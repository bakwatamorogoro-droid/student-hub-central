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
  | { status: "outside"; distanceM: number; radiusM: number };

/**
 * Judges a phone's fix against the teacher's fence.
 *
 * A fence with no centre is not a fence, so `no_fence` passes — otherwise turning
 * the setting on before picking a location would lock everyone out. A fix is
 * required only when there is a centre to measure from.
 */
export function checkArea(
  area: Area,
  fix: { lat: number | null; lng: number | null },
): AreaVerdict {
  if (area.lat == null || area.lng == null) return { status: "no_fence" };
  if (fix.lat == null || fix.lng == null) return { status: "missing_fix" };
  const distanceM = distanceMetres(area.lat, area.lng, fix.lat, fix.lng);
  const radiusM = area.radiusM;
  return distanceM > radiusM
    ? { status: "outside", distanceM, radiusM }
    : { status: "inside", distanceM, radiusM };
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
    case "outside":
      return `Uko mbali sana: ${formatDistance(verdict.distanceM)} kutoka kituo. Unaruhusiwa ndani ya ${formatDistance(verdict.radiusM)}.`;
    case "missing_fix":
      return "Ruhusu GPS (location) ili mfumo upime eneo lako.";
    case "no_fence":
      return "Eneo halijawekwa na mwalimu.";
  }
}
