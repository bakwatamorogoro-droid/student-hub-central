// East Africa Time helpers (UTC+3, no DST)
const EAT_OFFSET_MIN = 180; // +03:00

/**
 * Convert a value from an <input type="datetime-local"> (e.g. "2026-05-20T10:00")
 * which the user enters as EAT (East Africa Time) to a UTC ISO string for DB storage.
 */
export function eatLocalInputToUtcIso(local: string): string | null {
  if (!local) return null;
  // Parse "YYYY-MM-DDTHH:mm" as EAT then convert to UTC
  const [d, t] = local.split("T");
  if (!d || !t) return null;
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  // Build a UTC timestamp representing the EAT wall-clock time
  const utcMs = Date.UTC(y, mo - 1, da, h, mi, 0) - EAT_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * Convert a UTC ISO string from DB to the value expected by <input type="datetime-local">
 * shown as EAT wall-clock time ("YYYY-MM-DDTHH:mm").
 */
export function utcIsoToEatLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const eat = new Date(d.getTime() + EAT_OFFSET_MIN * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${eat.getUTCFullYear()}-${pad(eat.getUTCMonth() + 1)}-${pad(eat.getUTCDate())}T${pad(eat.getUTCHours())}:${pad(eat.getUTCMinutes())}`;
}

/**
 * Format a UTC ISO string (or Date) as a human-readable EAT string.
 */
export function formatEat(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const eat = new Date(d.getTime() + EAT_OFFSET_MIN * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(eat.getUTCDate())}/${pad(eat.getUTCMonth() + 1)}/${eat.getUTCFullYear()} ${pad(eat.getUTCHours())}:${pad(eat.getUTCMinutes())} EAT`;
}
