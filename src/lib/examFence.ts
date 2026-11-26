import { checkArea, type AreaVerdict } from "./geo.ts";

/**
 * Where a paper may be sat, and what happens when the student leaves.
 *
 * The fence used to live only in `app_settings`, one centre for the whole
 * college, so every test inherited the same radius and the same on/off switch.
 * A teacher who wanted "this test is in the lab, that one is anywhere" had no
 * way to say it. The per-exam switch is what this module resolves: the exam's
 * own words when it has any, the school's otherwise.
 *
 * `area_mode` is deliberately tri-state rather than a boolean. Every existing
 * paper has no value there, and those papers must keep behaving exactly as they
 * did before the switch existed — falling back to the school setting — instead
 * of silently becoming "anywhere" or "locked to a centre nobody chose".
 */

export type AreaMode = "off" | "classroom";

export type ExamAreaValue = {
  area_mode: string | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_m: number | null;
};

export type ExamAreaRow = {
  area_mode?: string | null;
  area_lat?: number | null;
  area_lng?: number | null;
  area_radius_m?: number | null;
};

export type SchoolArea = {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  /** The school-wide "students must be on campus" setting. */
  required: boolean;
};

export type ExamFence = {
  /** Null when the teacher locked the paper but never picked a centre. */
  lat: number | null;
  lng: number | null;
  radiusM: number;
  /** True when the paper may not be sat outside the fence. */
  enforced: boolean;
  source: "exam" | "school";
};

function finite(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
}

export function areaModeOf(row: ExamAreaRow | null | undefined): AreaMode | null {
  const mode = String(row?.area_mode ?? "")
    .trim()
    .toLowerCase();
  if (mode === "off") return "off";
  if (mode === "classroom") return "classroom";
  return null;
}

/**
 * The fence a student is judged against, or null when there is none.
 *
 * - `classroom` uses the exam's own centre; without one it falls back to the
 *   school gate rather than letting the paper loose, because the teacher asked
 *   for a fenced test and "no centre" is a configuration mistake, not permission.
 * - `off` returns null: the teacher deliberately let this one be sat anywhere.
 * - no mode at all is a paper written before the switch existed, so it inherits
 *   the school setting — the behaviour it already had.
 */
export function resolveExamFence(
  exam: ExamAreaRow | null | undefined,
  school: SchoolArea | null | undefined,
  /** The paper's own GPS switch. Off means no fence at all, anywhere in the flow. */
  requireGps = true,
): ExamFence | null {
  // GPS switched off is the teacher saying "sat anywhere". It must silence the
  // live gate too, not just the start gate — half an enforcement is a student
  // locked out of a paper they were allowed to start.
  if (!requireGps) return null;
  const mode = areaModeOf(exam);
  const schoolLat = finite(school?.lat);
  const schoolLng = finite(school?.lng);
  const schoolRadius = Math.max(1, finite(school?.radiusM) ?? 300);
  const hasSchool = schoolLat != null && schoolLng != null;

  if (mode === "off") return null;

  if (mode === "classroom") {
    const lat = finite(exam?.area_lat);
    const lng = finite(exam?.area_lng);
    if (lat != null && lng != null) {
      return {
        lat,
        lng,
        radiusM: Math.max(1, finite(exam?.area_radius_m) ?? schoolRadius),
        enforced: true,
        source: "exam",
      };
    }
    if (!hasSchool) return null;
    return {
      lat: schoolLat,
      lng: schoolLng,
      radiusM: schoolRadius,
      enforced: true,
      source: "school",
    };
  }

  // Legacy paper: exactly the old rule — a centre in settings is a fence.
  if (school?.required === false) return null;
  if (!hasSchool) return null;
  return {
    lat: schoolLat,
    lng: schoolLng,
    radiusM: schoolRadius,
    enforced: true,
    source: "school",
  };
}

// ------------------------------------------------------------ live enforcement

/**
 * How long a student may be outside before the paper locks.
 *
 * Long enough that a single wild fix (indoors, between two cell towers) is not
 * an incident, short enough that walking out of the room is not a free pass. The
 * clock is wall time, not a tick count, so a throttled background tab cannot
 * stretch it.
 */
export const LOCK_GRACE_MS = 12_000;

export type GateStatus = "inside" | "outside" | "unknown";

export type LocationGate = {
  status: GateStatus;
  /** When the current continuous run outside began, if any. */
  outsideSince: number | null;
  /** True once that run outlasted the grace period. */
  locked: boolean;
  /** Total time outside across the paper, for the teacher's record. */
  outsideMs: number;
  /** How many times the paper actually locked. */
  breaches: number;
  /** Last sample's timestamp, used to accumulate `outsideMs`. */
  lastAt: number | null;
};

export const INITIAL_GATE: LocationGate = {
  status: "unknown",
  outsideSince: null,
  locked: false,
  outsideMs: 0,
  breaches: 0,
  lastAt: null,
};

/**
 * Folds one position reading into the gate.
 *
 * `unknown` continues the run rather than resetting it. A student who switches
 * location services off mid-paper must not be rewarded with an unlocked screen:
 * losing the fix is not proof of leaving, but it is not proof of staying either,
 * and the only safe reading is "keep measuring". Coming back inside clears the
 * lock, so a student who walked out and returned can carry on — the paper is
 * suspended, not destroyed.
 */
export function advanceGate(
  prev: LocationGate,
  status: GateStatus,
  now: number,
  graceMs = LOCK_GRACE_MS,
): LocationGate {
  const elapsed = prev.status === "outside" && prev.lastAt != null ? now - prev.lastAt : 0;
  const outsideMs = prev.outsideMs + Math.max(0, elapsed);

  if (status === "inside") {
    return {
      status: "inside",
      outsideSince: null,
      locked: false,
      outsideMs,
      breaches: prev.breaches,
      lastAt: now,
    };
  }

  const outsideSince = prev.outsideSince ?? now;
  const longEnough = now - outsideSince >= graceMs;
  const locked = prev.locked || longEnough;
  return {
    status,
    outsideSince,
    locked,
    outsideMs,
    breaches: prev.breaches + (locked && !prev.locked ? 1 : 0),
    lastAt: now,
  };
}

/** Reads a fence verdict as a gate status, treating the error margin as inside. */
export function gateStatusFromVerdict(verdict: AreaVerdict | null): GateStatus {
  if (!verdict) return "unknown";
  if (verdict.status === "inside" || verdict.status === "near_edge") return "inside";
  return "outside";
}

/** The distance to show the student, or null when the fix could not be judged. */
export function verdictDistanceM(verdict: AreaVerdict | null): number | null {
  if (!verdict) return null;
  return "distanceM" in verdict ? Math.round(verdict.distanceM) : null;
}

/** Judges a fix against a fence, keeping the "no centre" case separate. */
export function judgeFence(
  fence: ExamFence | null,
  fix: { lat: number | null; lng: number | null; accuracy?: number | null },
): AreaVerdict | null {
  if (!fence || fence.lat == null || fence.lng == null) return null;
  return checkArea({ lat: fence.lat, lng: fence.lng, radiusM: fence.radiusM }, fix);
}

// ------------------------------------------------------ pasting a Maps link

/**
 * Pulls coordinates out of whatever Google Maps gives the teacher.
 *
 * A teacher does not know their classroom's latitude; they know how to open
 * Maps, find the building, and copy the address bar or the "Share" link. Those
 * come in half a dozen shapes — `@-6.81,39.28,17z`, `?q=-6.81,39.28`,
 * `?ll=`, `!3d-6.81!4d39.28`, or a bare "lat, lng" pair — so all of them are
 * accepted rather than making the teacher reformat a number by hand.
 *
 * Returns null when nothing plausible is present, so the caller can say so
 * instead of silently storing a wrong centre.
 */
export function parseGoogleMapsCoords(
  input: string | null | undefined,
): { lat: number; lng: number } | null {
  const text = String(input ?? "").trim();
  if (!text) return null;

  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|center|daddr)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng };
  }
  return null;
}

/** A keyless Google Maps embed for the picked centre. */
export function googleMapsEmbedUrl(lat: number, lng: number, zoom = 17): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
}

/** A link that opens the same point in the Maps app or site. */
export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Reads the picker's fields out of an exam row or a form draft. */
export function areaFromRow(row: Record<string, unknown> | null | undefined): ExamAreaValue {
  return {
    area_mode: (row?.area_mode as string | null) ?? null,
    area_lat: (row?.area_lat as number | null) ?? null,
    area_lng: (row?.area_lng as number | null) ?? null,
    area_radius_m: (row?.area_radius_m as number | null) ?? null,
  };
}

/** The payload keys the database expects, kept in one place. */
export function areaPayload(value: ExamAreaValue): Record<string, number | string | null> {
  const mode: AreaMode | null = areaModeOf(value);
  return {
    area_mode: mode,
    area_lat: mode === "classroom" ? value.area_lat : null,
    area_lng: mode === "classroom" ? value.area_lng : null,
    area_radius_m: mode === "classroom" ? value.area_radius_m : null,
  };
}

/** Warns about the two configurations that would leave the paper unfenced. */
export function areaWarning(value: ExamAreaValue): string | null {
  if (areaModeOf(value) !== "classroom") return null;
  if (value.area_lat == null || value.area_lng == null) {
    return "Hujaweka kituo. Mtihani utafungwa kwa kituo cha chuo mpaka uweke eneo la darasa.";
  }
  return null;
}
