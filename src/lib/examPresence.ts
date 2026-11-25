/**
 * Who else is sitting this paper right now.
 *
 * The student's page shows a live strip: how many are writing, how many have
 * finished, and a few names. That is a social signal, not a roster, so the cost
 * has to stay flat as the cohort grows — the college expects over ten thousand
 * students sitting at once.
 *
 * Two rules follow from that:
 *
 * 1. **Count, do not download.** Totals come from `count: "exact", head: true`
 *    queries, which PostgREST answers with a header and no body. Asking for the
 *    rows and counting them in the browser meant tens of thousands of JSON rows
 *    per poll, per student.
 * 2. **Sample, do not list.** The names shown are capped at a handful. The rest
 *    of the cohort is a number.
 *
 * Polling backs off as the cohort grows: ten thousand browsers each asking every
 * five seconds is a self-inflicted load spike, and the number being watched does
 * not change fast enough to justify it.
 */

/** How many names the strip shows before it becomes a count. */
export const PRESENCE_SAMPLE = 6;

export type PresenceSample = {
  regNo: string;
  fullName: string;
};

export type ExamPresence = {
  /** Papers started and not yet handed in. */
  writingCount: number;
  /** Papers handed in. */
  finishedCount: number;
  /** A few of the students writing, for the faces in the strip. */
  sample: PresenceSample[];
  /** True when there are more writers than names shown. */
  truncated: boolean;
};

export const EMPTY_PRESENCE: ExamPresence = {
  writingCount: 0,
  finishedCount: 0,
  sample: [],
  truncated: false,
};

/**
 * Assembles the strip from the two counts and the sampled names.
 *
 * `writingCount` is the authority for "how many are writing" — the sample is
 * only what could be named, so a short sample never lowers the count.
 */
export function buildPresence(
  writingCount: number,
  finishedCount: number,
  sample: PresenceSample[],
  sampleLimit = PRESENCE_SAMPLE,
): ExamPresence {
  const names = sample.slice(0, sampleLimit);
  const writing = Math.max(0, Math.floor(writingCount) || 0);
  const finished = Math.max(0, Math.floor(finishedCount) || 0);
  return {
    writingCount: writing,
    finishedCount: finished,
    sample: names,
    truncated: writing > names.length,
  };
}

/**
 * How long to wait before the next poll.
 *
 * Small groups get a responsive five seconds. Above a thousand writers the extra
 * seconds matter more than the freshness: the numbers move by a handful per
 * minute at that size, and every browser in the hall is asking.
 */
export function presencePollDelay(writingCount: number): number {
  const n = Number.isFinite(writingCount) ? Math.max(0, writingCount) : 0;
  if (n >= 5000) return 60_000;
  if (n >= 1000) return 30_000;
  if (n >= 200) return 15_000;
  return 5_000;
}

/**
 * A stable per-browser offset so ten thousand clients do not poll in lockstep.
 *
 * Without this, every page loaded at the start of an exam fires its first poll
 * at the same instant, and the database sees the whole cohort as one burst. The
 * offset is derived from the id so it is stable for a given paper.
 */
export function presenceJitter(seed: string, windowMs = 3000): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const spread = Math.max(1, Math.floor(windowMs));
  return Math.abs(hash) % spread;
}

/** Thousands separated by a space: 12345 -> "12 345". */
export function formatCount(n: number): string {
  const value = Math.max(0, Math.floor(Number(n) || 0));
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Initials for the avatar circles, tolerant of empty names and reg numbers. */
export function presenceInitials(name: string, regNo = ""): string {
  const source = String(name || "").trim() || String(regNo || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
