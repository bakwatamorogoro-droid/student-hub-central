/**
 * The one-hour window a student gets to fix a confirmed seat.
 *
 * Confirming is no longer final on the instant: the seat stays editable for an hour
 * after `group_confirmed_at`, then locks. The database enforces the same rule in
 * `confirm_student_group`, so this module only decides what the form shows — the
 * deadline it renders and the rule the database applies cannot drift apart because
 * both measure from the same stored stamp.
 *
 * Kept apart from the route so the boundary can be tested without a browser.
 */

/** How long a confirmed seat stays editable. */
export const GRACE_MS = 60 * 60 * 1000;

export type SeatState = "open" | "grace" | "locked";

/** Which state the seat is in, given when it was confirmed and the current time. */
export function seatState(confirmedAt: string | null | undefined, now = Date.now()): SeatState {
  if (!confirmedAt) return "open";
  const at = new Date(confirmedAt).getTime();
  if (Number.isNaN(at)) return "open";
  return now - at < GRACE_MS ? "grace" : "locked";
}

/** Milliseconds left in the window. Zero once it has closed, and for an open seat. */
export function graceRemainingMs(confirmedAt: string | null | undefined, now = Date.now()): number {
  if (seatState(confirmedAt, now) !== "grace") return 0;
  const at = new Date(confirmedAt as string).getTime();
  return Math.max(0, at + GRACE_MS - now);
}

/** `m: ss` for the countdown, so an hour shows as `59:59` rather than `3599s`. */
export function formatGrace(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** True when the student may still move their seminar and group. */
export function canEditSeat(confirmedAt: string | null | undefined, now = Date.now()): boolean {
  return seatState(confirmedAt, now) !== "locked";
}
