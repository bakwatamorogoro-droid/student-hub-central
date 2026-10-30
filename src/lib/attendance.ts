import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { getPosition } from "@/lib/geo";
import { resolveStudentToken } from "@/lib/studentAccount";
import { deterministicUuid, digestsEqual, hashSecret, newSalt, randomUuid } from "@/lib/pin-crypto";
import { getDeviceId } from "@/lib/device-id";

/**
 * Geofenced attendance, built on tables that already exist.
 *
 * The earlier version called `attendance_check_in()` and friends from
 * `supabase/APPLY_STUDENT_PIN_AUTH.sql`. That file has never been applied, and
 * this project has no service-role key and no DB connection, so nothing in this
 * repository can create those tables or functions. Attendance therefore has to
 * run on storage that is already there.
 *
 * Two constraints shape the design:
 *
 * 1. `attendance` carries `UNIQUE (student_id, check_in_date)`, so a student can
 *    only ever have one row per calendar day. That makes it impossible to record
 *    a second lecture on the same day, which is the bug this file fixes. The
 *    per-session record therefore lives in `quiz_participants` instead — unused
 *    by the rest of the app, writable with the publishable key, and carrying
 *    `UNIQUE (exam_id, student_id)`, which is exactly one check-in per student
 *    per session.
 * 2. The publishable key is public, so the browser cannot be trusted to decide
 *    whether a check-in is valid. A rotating token is only meaningful if the
 *    rotation is unguessable and short-lived, which is what makes a screenshot
 *    useless.
 *
 * Namespaces inside `quiz_participants`:
 *
 *   a0000000-…-0003  a session            (student_id = the teacher's id, or zeros)
 *   a0000000-…-0004  one student's check-in for that session
 *   a0000000-…-0005  the session's live QR token
 *
 * The `attendance` row is still written, in parallel, so every existing admin
 * screen, export and statistic keeps working unchanged.
 */

const SESSION_NS = "a0000000-0000-4000-8000-000000000003";
const CHECKIN_NS = "a0000000-0000-4000-8000-000000000004";
const TOKEN_NS = "a0000000-0000-4000-8000-000000000005";

/** How long a single QR token stays valid. Short, so a photo goes stale. */
const TOKEN_TTL_SECONDS = 30;

export type AttendanceFailure =
  | "not_ready"
  | "invalid_token"
  | "expired_token"
  | "session_closed"
  | "not_registered"
  | "outside_area"
  | "wrong_group"
  | "gps_required"
  | "already_marked";

export type AttendanceResult =
  | { ok: true; fullName: string; semina: string | null; distanceM: number; checkInAt: string }
  | { ok: false; reason: AttendanceFailure; distanceM?: number; radiusM?: number };

export type OpenSession = {
  id: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
  hasJoinCode: boolean;
};

export type Session = {
  id: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
  joinCode: string | null;
};

export type PresentRow = {
  fullName: string;
  regNo: string;
  studentId: string;
  createdAt: string;
  distanceM: number | null;
  method: string | null;
};

type SessionPayload = {
  v: 1;
  t: "session";
  /** Device that started the session; lets a test clean up only its own rows. */
  device: string | null;
  title: string;
  semina: string | null;
  student_group: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  join_code: string | null;
  active: boolean;
  closes_at: string | null;
};

type TokenPayload = {
  v: 1;
  t: "token";
  salt: string;
  hash: string;
  expires_at: string;
};

type CheckInPayload = {
  v: 1;
  t: "checkin";
  session_id: string;
  reg_no: string;
  student_id: string;
  method: "qr" | "code";
  distance_m: number | null;
  check_in_at: string;
};

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** EAT (UTC+3, no DST) calendar date, for the legacy `attendance` row. */
function todayEat(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------

/**
 * Starts a session and returns it.
 *
 * The join code is allocated here and checked for collisions by retrying,
 * because `quiz_participants` has no unique index on it.
 */
export async function startAttendanceSession(input: {
  title: string;
  semina: string | null;
  studentGroup: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  joinCode: string;
}): Promise<{ ok: true; session: Session } | { ok: false; message: string }> {
  const schema = z.object({
    title: z.string().trim().min(1).max(120),
    semina: z.string().nullable(),
    studentGroup: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    radiusM: z.number().int().min(5).max(5000),
    joinCode: z.string().trim().min(4).max(12),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Taarifa za kipindi hazijakamilika" };
  const d = parsed.data;

  const live = await listOpenSessions();
  let code = d.joinCode.toUpperCase();
  for (let i = 0; i < 8 && live.some((s) => s.joinCode === code); i++) code = makeJoinCode();

  // The session's own id keys its row, so `UNIQUE (exam_id, student_id)` cannot
  // make two sessions collide with each other.
  const sessionId = randomUuid();
  const payload: SessionPayload = {
    v: 1,
    t: "session",
    device: getDeviceId() || null,
    title: d.title,
    semina: d.semina,
    student_group: d.studentGroup,
    lat: d.lat,
    lng: d.lng,
    radius_m: d.radiusM,
    join_code: code,
    active: true,
    closes_at: null,
  };

  const { error } = await supabase.from("quiz_participants").insert({
    // The row's own id *is* the session id, so callers can address the session
    // without a second lookup.
    id: sessionId,
    exam_id: SESSION_NS,
    student_id: sessionId,
    reg_no: "SESSION",
    full_name: d.title,
    semina: JSON.stringify(payload),
    student_group: d.studentGroup,
  });
  if (error) return { ok: false, message: error.message ?? "Imeshindikana kuanzisha kipindi" };

  return {
    ok: true,
    session: {
      id: sessionId,
      title: d.title,
      semina: d.semina,
      studentGroup: d.studentGroup,
      radiusM: d.radiusM,
      joinCode: code,
    },
  };
}

/** Sessions that are still open. Pass the student's token to filter by group. */
export async function listOpenSessions(
  studentToken?: string,
): Promise<Array<OpenSession & { joinCode: string | null }>> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, semina")
    .eq("exam_id", SESSION_NS);
  if (error || !data) return [];

  let student: Awaited<ReturnType<typeof resolveStudentToken>> = null;
  if (studentToken) student = await resolveStudentToken(studentToken);

  const now = Date.now();
  const out: Array<OpenSession & { joinCode: string | null }> = [];
  for (const row of data as Array<{ id: string; semina: string | null }>) {
    const p = parse<SessionPayload>(row.semina);
    if (!p || p.t !== "session" || !p.active) continue;
    if (p.closes_at && new Date(p.closes_at).getTime() <= now) continue;
    // A group-targeted session is only shown to that group.
    if (student && p.student_group && p.student_group !== student.studentGroup) continue;
    out.push({
      id: row.id,
      title: p.title,
      semina: p.semina,
      studentGroup: p.student_group,
      radiusM: p.radius_m,
      hasJoinCode: !!p.join_code,
      joinCode: p.join_code,
    });
  }
  return out;
}

/** Reads one session by id. */
export async function getSession(sessionId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, semina")
    .eq("id", sessionId)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const p = parse<SessionPayload>((data[0] as { semina: string | null }).semina);
  if (!p || p.t !== "session") return null;
  return {
    id: sessionId,
    title: p.title,
    semina: p.semina,
    studentGroup: p.student_group,
    radiusM: p.radius_m,
    joinCode: p.join_code,
  };
}

/** Closes a session so no further check-ins are accepted. */
export async function endAttendanceSession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;

  const { data } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("id", sessionId)
    .limit(1);
  const p = parse<SessionPayload>((data?.[0] as { semina: string | null })?.semina);
  if (!p) return false;

  const { error } = await supabase
    .from("quiz_participants")
    .update({
      semina: JSON.stringify({ ...p, active: false, closes_at: new Date().toISOString() }),
    })
    .eq("id", sessionId);
  return !error;
}

// ---------------------------------------------------------------
// Rotating QR token
// ---------------------------------------------------------------

/**
 * Mints a new QR token for a session and stores only its digest.
 *
 * The token itself is returned to the caller and never persisted, so a leaked
 * database row cannot be used to mint a valid scan.
 */
export async function rotateSessionToken(
  sessionId: string,
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false }> {
  const salt = newSalt();
  const secret = newSalt() + newSalt();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  const payload: TokenPayload = {
    v: 1,
    t: "token",
    salt,
    hash: await hashSecret(secret, salt),
    expires_at: expiresAt,
  };

  // One token row per session, replaced in place.
  const { data } = await supabase
    .from("quiz_participants")
    .select("id")
    .eq("exam_id", TOKEN_NS)
    .eq("student_id", sessionId)
    .limit(1);

  const existing = (data as Array<{ id: string }> | null)?.[0]?.id;
  const body = {
    exam_id: TOKEN_NS,
    student_id: sessionId,
    reg_no: "TOKEN",
    full_name: "QR",
    semina: JSON.stringify(payload),
  };
  const { error } = existing
    ? await supabase.from("quiz_participants").update(body).eq("id", existing)
    : await supabase.from("quiz_participants").insert(body);
  if (error) return { ok: false };

  return { ok: true, token: secret, expiresAt };
}

/** Whether a scanned token matches the session's live token, and is fresh. */
async function tokenIsLive(
  sessionId: string,
  scanned: string,
): Promise<"ok" | "expired" | "wrong"> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("exam_id", TOKEN_NS)
    .eq("student_id", sessionId)
    .limit(1);
  if (error || !data || data.length === 0) return "wrong";

  const p = parse<TokenPayload>((data[0] as { semina: string | null }).semina);
  if (!p || p.t !== "token") return "wrong";
  if (new Date(p.expires_at).getTime() <= Date.now()) return "expired";
  return digestsEqual(await hashSecret(scanned, p.salt), p.hash) ? "ok" : "wrong";
}

// ---------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------

/**
 * Records one check-in.
 *
 * Every gate is applied here, in order: the session must exist and be open, the
 * token or code must match, GPS must be available, and the student must be
 * inside the radius the teacher set. The student's identity comes from their
 * sign-in token, never from anything the caller supplies directly.
 */
export async function checkIn(input: {
  studentToken: string;
  token?: string | null;
  joinCode?: string | null;
  /** The phone's fix, or null when GPS is off, refused or unavailable. */
  lat: number | null;
  lng: number | null;
}): Promise<AttendanceResult> {
  const student = await resolveStudentToken(input.studentToken);
  if (!student) return { ok: false, reason: "not_registered" };

  // Resolve which session this is for.
  let session: Session | null = null;
  let method: "qr" | "code" = "qr";

  if (input.token) {
    const sessions = await listOpenSessions();
    for (const s of sessions) {
      const verdict = await tokenIsLive(s.id, input.token);
      if (verdict === "ok") {
        session = await getSession(s.id);
        break;
      }
      if (verdict === "expired") return { ok: false, reason: "expired_token" };
    }
    if (!session) return { ok: false, reason: "invalid_token" };
  } else if (input.joinCode) {
    method = "code";
    const wanted = input.joinCode.trim().toUpperCase();
    const sessions = await listOpenSessions();
    const match = sessions.find((s) => (s.joinCode || "").toUpperCase() === wanted);
    if (!match) return { ok: false, reason: "invalid_token" };
    session = await getSession(match.id);
  } else {
    return { ok: false, reason: "invalid_token" };
  }

  if (!session) return { ok: false, reason: "invalid_token" };

  // Reload the raw payload: the radius and coordinates are the teacher's, not
  // the browser's.
  const { data: raw } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("id", session.id)
    .limit(1);
  const payload = parse<SessionPayload>((raw?.[0] as { semina: string | null })?.semina);
  if (!payload) return { ok: false, reason: "invalid_token" };
  if (!payload.active) return { ok: false, reason: "session_closed" };
  if (payload.closes_at && new Date(payload.closes_at).getTime() <= Date.now()) {
    return { ok: false, reason: "session_closed" };
  }

  // A group-targeted session is only for that group. The picker hides the others,
  // but a scanned join code bypasses the picker, so the rule is enforced here.
  if (payload.student_group && payload.student_group !== student.studentGroup) {
    return { ok: false, reason: "wrong_group" };
  }

  // Geofence. A session the teacher started without coordinates has no fence,
  // so a student whose GPS is off can still check in — otherwise turning GPS on
  // would be a requirement the teacher never asked for.
  let dist: number | null = null;
  if (payload.lat != null && payload.lng != null) {
    if (input.lat == null || input.lng == null) return { ok: false, reason: "gps_required" };
    dist = distanceM(payload.lat, payload.lng, input.lat, input.lng);
    if (dist > payload.radius_m) {
      return { ok: false, reason: "outside_area", distanceM: dist, radiusM: payload.radius_m };
    }
  }

  // The row id is derived from "student + session", and `student_id` holds that
  // same derived value: `UNIQUE (exam_id, student_id)` then makes a second
  // check-in for the same session impossible, even from two devices at once.
  const checkInId = await deterministicUuid(`checkin:${session.id}:${student.id}`);

  const { data: existing } = await supabase
    .from("quiz_participants")
    .select("id")
    .eq("exam_id", CHECKIN_NS)
    .eq("student_id", checkInId)
    .limit(1);
  if (existing && existing.length > 0) return { ok: false, reason: "already_marked" };

  const checkInAt = new Date().toISOString();
  const record: CheckInPayload = {
    v: 1,
    t: "checkin",
    session_id: session.id,
    // The row's `reg_no` column holds the session id, so the student's own
    // number is carried in the payload for the teacher's list.
    reg_no: student.regNo,
    student_id: student.id,
    method,
    distance_m: dist,
    check_in_at: checkInAt,
  };

  const { error } = await supabase.from("quiz_participants").insert({
    id: checkInId,
    exam_id: CHECKIN_NS,
    student_id: checkInId,
    // The session id in `reg_no` is what the teacher's list filters on.
    reg_no: session.id,
    full_name: student.fullName,
    semina: JSON.stringify(record),
    student_group: student.studentGroup,
  });
  if (error) {
    // 23505 is the unique index: a racing second scan.
    if ((error as { code?: string }).code === "23505")
      return { ok: false, reason: "already_marked" };
    return { ok: false, reason: "not_ready" };
  }

  // Mirror into the legacy `attendance` table so every existing admin screen
  // keeps working. This can legitimately fail on a second lecture the same day,
  // because that table only allows one row per student per date; the per-session
  // record above is the authoritative one.
  await supabase.from("attendance").insert({
    student_id: student.id,
    reg_no: student.regNo,
    full_name: student.fullName,
    semina: session.semina,
    student_group: student.studentGroup,
    check_in_date: todayEat(),
    status: "present",
    confirmed_by_admin: false,
    gps_lat: input.lat,
    gps_lng: input.lng,
    distance_m: dist,
  });

  return {
    ok: true,
    fullName: student.fullName,
    semina: session.semina,
    distanceM: dist ?? 0,
    checkInAt,
  };
}

/** The students checked in to one session, for the teacher's screen. */
export async function fetchSessionPresent(sessionId: string): Promise<PresentRow[]> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("full_name, reg_no, semina, joined_at")
    .eq("exam_id", CHECKIN_NS)
    .eq("reg_no", sessionId);
  if (error || !data) return [];

  return (
    data as Array<{ full_name: string; reg_no: string; semina: string | null; joined_at: string }>
  )
    .map((r) => {
      const p = parse<CheckInPayload>(r.semina);
      return {
        fullName: r.full_name,
        regNo: p?.reg_no ?? "",
        studentId: p?.student_id ?? "",
        createdAt: p?.check_in_at ?? r.joined_at,
        distanceM: p?.distance_m ?? null,
        method: p?.method ?? null,
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A short, unambiguous code the teacher can read out. */
export function makeJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export { getPosition };
