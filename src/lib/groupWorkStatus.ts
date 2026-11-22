/**
 * What the group's assignment looks like from the group page.
 *
 * The group page answers "who is in my group"; the assignment page answers "what
 * has my group sent". A student standing on the first page had no way to tell
 * whether their group had already submitted, whether the teacher had answered,
 * or whether a deadline was about to pass without opening the second page and
 * reading it. This module reduces both sources to the one line that page needs.
 *
 * Pure and import-free apart from the mark formatter, so `node --test` can hold
 * the boundaries: the Supabase reads stay in the callers.
 */

import { formatMark, gradeLabel, markPercent } from "./assignmentMarks.ts";

/** The part of an open assignment this module reads. */
export type WorkAssignment = {
  id: string;
  title: string;
  dueAt: string | null;
  points: number;
};

/** The part of a group submission this module reads. */
export type WorkSubmission = {
  submittedAt: string | null;
  answered: boolean;
  mark: string | null;
  markScore: number | null;
  markMax: number | null;
  /** How many marks the teacher left on the work. */
  annotations: number;
};

export type GroupWorkState = "no_assignment" | "open" | "sent" | "answered";

export type GroupWorkStatus = {
  state: GroupWorkState;
  /** The assignment to open: the soonest deadline, otherwise the newest. */
  assignment: WorkAssignment | null;
  /** Whole days until the deadline. Negative once it has passed. Null without one. */
  daysLeft: number | null;
  /** The deadline has passed and the work is still unsent. */
  overdue: boolean;
  /** "7/24", when the teacher gave a mark. */
  mark: string | null;
  markPercent: number | null;
  grade: string;
  /** How many of the teacher's marks sit on the work. */
  notes: number;
};

const DAY_MS = 86_400_000;

function dueTime(a: WorkAssignment): number {
  const ms = Date.parse(String(a.dueAt ?? ""));
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/**
 * The assignment to offer first.
 *
 * A deadline is the only thing that makes one assignment more urgent than
 * another, so the earliest one wins. Assignments with no deadline sort last
 * rather than first: an open-ended task is never the one to hurry towards.
 */
export function nextAssignment(assignments: WorkAssignment[]): WorkAssignment | null {
  if (!assignments.length) return null;
  return [...assignments].sort((a, b) => {
    const byDue = dueTime(a) - dueTime(b);
    if (byDue !== 0) return byDue;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/** Whole days from `now` to the deadline, rounded up so "today" is 0 and not -1. */
export function daysUntil(dueAt: string | null | undefined, now: number): number | null {
  const ms = Date.parse(String(dueAt ?? ""));
  if (!Number.isFinite(ms)) return null;
  return Math.ceil((ms - now) / DAY_MS);
}

/**
 * The one line the group page shows about its assignment.
 *
 * `submission` wins over the assignment list: once a group has sent its work,
 * the deadline no longer applies to it, and showing "past due" next to work that
 * was handed in on time would be a lie. `answered` wins over `sent` for the same
 * reason — the group is waiting on nothing once the teacher has replied.
 *
 * A submitted group also loses its countdown entirely: "13 days ago" is not news
 * to a group that has already handed the work in, and the send date is shown
 * instead.
 */
export function groupWorkStatus(input: {
  assignments: WorkAssignment[];
  submission: WorkSubmission | null;
  now: number;
}): GroupWorkStatus {
  const { assignments, submission, now } = input;
  const assignment = nextAssignment(assignments);
  const daysLeft = assignment ? daysUntil(assignment.dueAt, now) : null;

  if (submission) {
    const percent = markPercent(submission.markScore, submission.markMax);
    return {
      state: submission.answered ? "answered" : "sent",
      assignment,
      daysLeft: null,
      overdue: false,
      mark: submission.mark || formatMark(submission.markScore, submission.markMax) || null,
      markPercent: percent,
      grade: gradeLabel(percent),
      notes: submission.annotations,
    };
  }

  return {
    state: assignment ? "open" : "no_assignment",
    assignment,
    daysLeft,
    overdue: daysLeft !== null && daysLeft < 0,
    mark: null,
    markPercent: null,
    grade: "",
    notes: 0,
  };
}

/**
 * The deadline as a student reads a date: "3 Novemba 2026" / "3 November 2026".
 *
 * The locale comes from the caller so the date follows the language toggle; a
 * date formatted in Swahili inside an English page is the one piece of the UI
 * that cannot be translated after the fact.
 */
export function formatDeadline(
  iso: string | null | undefined,
  locale: "sw" | "en" = "sw",
): string | null {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(locale === "en" ? "en-GB" : "sw-TZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The countdown as a translation key rather than a finished sentence.
 *
 * The page owns the words, so the same module serves both languages: returning
 * "Siku 3 zimebaki" here would print Swahili on the English page.
 */
export function countdownLabel(
  days: number | null,
): { key: string; vars?: Record<string, number> } | null {
  if (days === null) return null;
  if (days === 0) return { key: "gh_due_today" };
  if (days > 0) return { key: "gh_due_left", vars: { n: days } };
  return { key: "gh_due_past", vars: { n: Math.abs(days) } };
}
