/** The phone's current position, or null when it is unavailable or refused. */
export function getPosition(
  timeoutMs = 15000,
): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** Great-circle distance in metres between two points. */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Area = { lat: number | null; lng: number | null; radiusM: number };

export type AreaVerdict =
  | { status: "no_fence" }
  | { status: "missing_fix" }
  | { status: "inside"; distanceM: number; radiusM: number }
  | { status: "outside"; distanceM: number; radiusM: number }
  | { status: "near_edge"; distanceM: number; radiusM: number };

/**
 * A fix is measured against the fence with the phone's own error margin added in.
 *
 * Without this, a student standing at the school gate reads 290 m with ±40 m of
 * error, the raw comparison says "outside", and a correct student is refused. The
 * margin has to widen the fence, never narrow it: a fix may only ever be treated as
 * closer than it looks, because the alternative is turning away someone who is
 * standing in the room.
 */
export const GPS_ACCURACY_CEILING_M = 150;

/** Accuracy worse than this cannot place anyone inside a building-sized fence. */
export const MAX_USABLE_ACCURACY_M = 500;

export function effectiveDistanceM(distanceM: number, accuracyM: number | null): number {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return distanceM;
  return Math.max(0, distanceM - Math.min(accuracyM, GPS_ACCURACY_CEILING_M));
}

/**
 * Judges a phone's fix against the teacher's fence.
 *
 * A fence with no centre is not a fence, so `no_fence` passes — otherwise turning
 * the setting on before picking a location would lock everyone out. A fix is
 * required only when there is a centre to measure from.
 *
 * `accuracyM` is the phone's reported error. It is subtracted from the distance, so
 * a vague reading can only help the student. `near_edge` means the student is
 * outside the raw radius but inside it once the error bar is allowed for: the
 * teacher gets a flag, the student is let in.
 */
export function checkArea(
  area: Area,
  fix: { lat: number | null; lng: number | null; accuracy?: number | null },
): AreaVerdict {
  if (area.lat == null || area.lng == null) return { status: "no_fence" };
  if (fix.lat == null || fix.lng == null) return { status: "missing_fix" };
  const distanceM = distanceMetres(area.lat, area.lng, fix.lat, fix.lng);
  const radiusM = area.radiusM;
  if (distanceM <= radiusM) return { status: "inside", distanceM, radiusM };
  if (effectiveDistanceM(distanceM, fix.accuracy ?? null) <= radiusM)
    return { status: "near_edge", distanceM, radiusM };
  return { status: "outside", distanceM, radiusM };
}

/** Rounds to the nearest metre for display, and words the gap for a student. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** A short Swahili sentence a student can act on. */
export function areaMessage(verdict: AreaVerdict): string {
  switch (verdict.status) {
    case "inside":
      return `Uko ndani ya eneo (${formatDistance(verdict.distanceM)} kutoka kituo).`;
    case "near_edge":
      return `Uko mpakani (${formatDistance(verdict.distanceM)} kutoka kituo). Umekaribishwa kwa sababu ya usahihi wa GPS.`;
    case "outside":
      return `Uko mbali sana: ${formatDistance(verdict.distanceM)} kutoka kituo. Unaruhusiwa ndani ya ${formatDistance(verdict.radiusM)}.`;
    case "missing_fix":
      return "Ruhusu GPS (location) ili mfumo upime eneo lako.";
    case "no_fence":
      return "Eneo halijawekwa na mwalimu.";
  }
}
