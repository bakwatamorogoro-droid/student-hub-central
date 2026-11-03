/**
 * The arithmetic behind a multi-step form.
 *
 * Kept apart from the markup so "which steps are done, which is current, and how
 * far along are we" can be tested without rendering anything. Both the assignment
 * wizard (three steps) and the attendance wizard (two) read the same helpers, so
 * the two pages cannot drift into different ideas of what step 2 means.
 */

export type StepState = "done" | "active" | "todo";

/**
 * The state of every step, given the one the student is on.
 *
 * `current` is clamped into range, so a caller that advances past the end — or a
 * stored value from an older session — lands on a real step instead of rendering
 * an empty header.
 */
export function stepStates(count: number, current: number): StepState[] {
  const total = Math.max(0, Math.floor(count));
  const at = clampStep(current, total);
  return Array.from({ length: total }, (_, i) => (i < at ? "done" : i === at ? "active" : "todo"));
}

/** Keeps a step index inside `0 … count - 1`. An empty form sits at 0. */
export function clampStep(index: number, count: number): number {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return 0;
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.min(Math.max(i, 0), total - 1);
}

/** 0–100, for the progress bar. One step of three that is done reads 33%. */
export function progressPct(current: number, count: number): number {
  const total = Math.max(0, Math.floor(count));
  if (total <= 1) return total === 1 ? 100 : 0;
  return Math.round((clampStep(current, total) / (total - 1)) * 100);
}

/** "Hatua 2 kati ya 3" — the one line a small screen shows instead of the chips. */
export function stepCounterLabel(current: number, count: number): string {
  const total = Math.max(1, Math.floor(count));
  return `Hatua ${clampStep(current, total) + 1} kati ya ${total}`;
}

/** True when there is a previous step to go back to. */
export function canGoBack(current: number, count: number): boolean {
  return clampStep(current, count) > 0;
}

/** True when the current step is not the last one. */
export function canGoNext(current: number, count: number): boolean {
  return clampStep(current, count) < Math.max(1, Math.floor(count)) - 1;
}
