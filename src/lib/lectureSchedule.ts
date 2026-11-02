/**
 * The Friday all-students lecture.
 *
 * Every Friday, 07:00–10:00 EAT, every student is expected in the hall. EAT is
 * UTC+3 with no DST, so the window is a fixed offset from UTC rather than a
 * timezone lookup — the app has to give the same answer on a phone set to any
 * timezone, and on a server.
 *
 * Kept free of imports so `node --test` covers the boundaries directly.
 */

export const LECTURE_START_HOUR = 7;
export const LECTURE_END_HOUR = 10;
/** Friday, with 0 = Sunday. */
export const LECTURE_WEEKDAY = 5;

const EAT_OFFSET_MS = 3 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function toMs(at: Date | number): number {
  return typeof at === "number" ? at : at.getTime();
}

/** The EAT calendar date of an instant, as "YYYY-MM-DD". */
export function eatDateKey(at: Date | number = Date.now()): string {
  return new Date(toMs(at) + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** EAT weekday of an instant, 0 = Sunday. */
export function eatWeekday(at: Date | number = Date.now()): number {
  return new Date(toMs(at) + EAT_OFFSET_MS).getUTCDay();
}

/** UTC instant matching an EAT wall-clock hour on an EAT date. */
function eatInstant(dateKey: string, hour: number): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour) - EAT_OFFSET_MS;
}

/**
 * The Friday that owns `at`, as an EAT date key.
 *
 * On a Friday this is that same day, whether the lecture is still ahead or
 * already over — the caller decides which of those it is holding.
 */
export function lectureDateKey(at: Date | number = Date.now()): string {
  const ms = toMs(at);
  const shift = (LECTURE_WEEKDAY - eatWeekday(ms) + 7) % 7;
  return eatDateKey(ms + shift * DAY_MS);
}

export type LectureWindow = {
  /** EAT date of the Friday, "YYYY-MM-DD". */
  dateKey: string;
  opensAt: string;
  closesAt: string;
  opensAtMs: number;
  closesAtMs: number;
};

/** The window belonging to the Friday that owns `at`, which may have closed. */
export function lectureWindow(at: Date | number = Date.now()): LectureWindow {
  const dateKey = lectureDateKey(at);
  const opensAtMs = eatInstant(dateKey, LECTURE_START_HOUR);
  const closesAtMs = eatInstant(dateKey, LECTURE_END_HOUR);
  return {
    dateKey,
    opensAt: new Date(opensAtMs).toISOString(),
    closesAt: new Date(closesAtMs).toISOString(),
    opensAtMs,
    closesAtMs,
  };
}

/** Whether the lecture is open right now. The close is exclusive. */
export function isLectureOpen(at: Date | number = Date.now()): boolean {
  const ms = toMs(at);
  const w = lectureWindow(ms);
  return ms >= w.opensAtMs && ms < w.closesAtMs;
}

/** The next window that has not closed yet, for a countdown. */
export function nextLectureWindow(at: Date | number = Date.now()): LectureWindow {
  const ms = toMs(at);
  const w = lectureWindow(ms);
  if (ms < w.closesAtMs) return w;
  return lectureWindow(ms + 7 * DAY_MS);
}

/** Milliseconds until the next lecture opens; 0 while one is open. */
export function msUntilLecture(at: Date | number = Date.now()): number {
  const ms = toMs(at);
  if (isLectureOpen(ms)) return 0;
  return nextLectureWindow(ms).opensAtMs - ms;
}

/** "07:00 – 10:00", for a label. */
export function lectureHoursLabel(): string {
  const pad = (h: number) => String(h).padStart(2, "0");
  return `${pad(LECTURE_START_HOUR)}:00 – ${pad(LECTURE_END_HOUR)}:00`;
}

/** "Ijumaa, 6 Novemba 2026" for the window's own Friday. */
export function lectureDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("sw-TZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "saa 3 dakika 12" — a short countdown phrase. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "sasa hivi";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`siku ${days}`);
  if (hours) parts.push(`saa ${hours}`);
  if (minutes && !days) parts.push(`dakika ${minutes}`);
  if (!days && !hours && !minutes) parts.push(`sekunde ${seconds}`);
  return parts.join(" ");
}
