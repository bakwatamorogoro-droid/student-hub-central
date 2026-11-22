import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countdownLabel,
  daysUntil,
  formatDeadline,
  groupWorkStatus,
  nextAssignment,
  type WorkAssignment,
  type WorkSubmission,
} from "./groupWorkStatus.ts";

const NOW = Date.parse("2026-11-03T09:00:00Z");

function assignment(over: Partial<WorkAssignment> & { id: string }): WorkAssignment {
  return { title: `Kazi ${over.id}`, dueAt: null, points: 100, ...over };
}

function submission(over: Partial<WorkSubmission> = {}): WorkSubmission {
  return {
    submittedAt: "2026-11-02T10:00:00Z",
    answered: false,
    mark: null,
    markScore: null,
    markMax: null,
    annotations: 0,
    ...over,
  };
}

test("nextAssignment picks the soonest deadline, and no deadline sorts last", () => {
  const soon = assignment({ id: "b", dueAt: "2026-11-05T00:00:00Z" });
  const late = assignment({ id: "a", dueAt: "2026-12-01T00:00:00Z" });
  const open = assignment({ id: "c" });
  assert.equal(nextAssignment([late, open, soon])?.id, "b");
  assert.equal(nextAssignment([open, late])?.id, "a");
});

test("nextAssignment is null without assignments, and stable on a tie", () => {
  assert.equal(nextAssignment([]), null);
  const x = assignment({ id: "x", dueAt: "2026-11-05T00:00:00Z" });
  const y = assignment({ id: "y", dueAt: "2026-11-05T00:00:00Z" });
  assert.equal(nextAssignment([y, x])?.id, "x");
});

test("daysUntil rounds up, so the deadline day is 0 rather than -1", () => {
  assert.equal(daysUntil("2026-11-03T18:00:00Z", NOW), 1);
  assert.equal(daysUntil("2026-11-03T09:00:00Z", NOW), 0);
  assert.equal(daysUntil("2026-11-06T09:00:00Z", NOW), 3);
  assert.equal(daysUntil("2026-11-01T09:00:00Z", NOW), -2);
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil("not a date", NOW), null);
});

test("no assignments and no submission reads as no_assignment", () => {
  const s = groupWorkStatus({ assignments: [], submission: null, now: NOW });
  assert.equal(s.state, "no_assignment");
  assert.equal(s.assignment, null);
  assert.equal(s.overdue, false);
  assert.equal(s.mark, null);
  assert.equal(s.notes, 0);
});

test("an open assignment with a deadline ahead is open and not overdue", () => {
  const a = assignment({ id: "a", dueAt: "2026-11-06T09:00:00Z" });
  const s = groupWorkStatus({ assignments: [a], submission: null, now: NOW });
  assert.equal(s.state, "open");
  assert.equal(s.assignment?.id, "a");
  assert.equal(s.daysLeft, 3);
  assert.equal(s.overdue, false);
});

test("an open assignment past its deadline is overdue", () => {
  const a = assignment({ id: "a", dueAt: "2026-11-01T09:00:00Z" });
  const s = groupWorkStatus({ assignments: [a], submission: null, now: NOW });
  assert.equal(s.state, "open");
  assert.equal(s.overdue, true);
  assert.equal(s.daysLeft, -2);
});

test("a deadline that has not been set is never overdue", () => {
  const s = groupWorkStatus({
    assignments: [assignment({ id: "a" })],
    submission: null,
    now: NOW,
  });
  assert.equal(s.daysLeft, null);
  assert.equal(s.overdue, false);
});

test("sent work is 'sent' even when the deadline has already passed", () => {
  const a = assignment({ id: "a", dueAt: "2026-11-01T09:00:00Z" });
  const s = groupWorkStatus({ assignments: [a], submission: submission(), now: NOW });
  assert.equal(s.state, "sent");
  assert.equal(s.overdue, false, "work handed in is never called overdue");
  assert.equal(s.daysLeft, null, "a handed-in group is not shown a countdown");
});

test("answered work carries the mark, the percentage and the grade", () => {
  const s = groupWorkStatus({
    assignments: [assignment({ id: "a" })],
    submission: submission({ answered: true, markScore: 18, markMax: 24, annotations: 3 }),
    now: NOW,
  });
  assert.equal(s.state, "answered");
  assert.equal(s.mark, "18/24");
  assert.equal(s.markPercent, 75);
  assert.equal(s.grade, "A — Amafaulu");
  assert.equal(s.notes, 3);
});

test("an answer without a mark still reads as answered, with no mark", () => {
  const s = groupWorkStatus({
    assignments: [assignment({ id: "a" })],
    submission: submission({ answered: true }),
    now: NOW,
  });
  assert.equal(s.state, "answered");
  assert.equal(s.mark, null);
  assert.equal(s.markPercent, null);
  assert.equal(s.grade, "");
});

test("the mark string on the row is used when the numbers are missing", () => {
  const s = groupWorkStatus({
    assignments: [],
    submission: submission({ answered: true, mark: "7/24" }),
    now: NOW,
  });
  assert.equal(s.mark, "7/24");
  assert.equal(s.markPercent, null, "no numbers means no percentage to compute");
});

test("countdownLabel returns keys and counts, not finished sentences", () => {
  assert.deepEqual(countdownLabel(0), { key: "gh_due_today" });
  assert.deepEqual(countdownLabel(1), { key: "gh_due_left", vars: { n: 1 } });
  assert.deepEqual(countdownLabel(4), { key: "gh_due_left", vars: { n: 4 } });
  assert.deepEqual(countdownLabel(-1), { key: "gh_due_past", vars: { n: 1 } });
  assert.deepEqual(countdownLabel(-5), { key: "gh_due_past", vars: { n: 5 } });
  assert.equal(countdownLabel(null), null);
});

test("formatDeadline follows the language toggle", () => {
  assert.match(String(formatDeadline("2026-11-03T09:00:00Z", "sw")), /2026/);
  const sw = formatDeadline("2026-11-03T09:00:00Z", "sw");
  const en = formatDeadline("2026-11-03T09:00:00Z", "en");
  assert.notEqual(sw, en, "the two locales must not print the same month name");
  assert.match(String(en), /November/);
  assert.equal(formatDeadline(null), null);
  assert.equal(formatDeadline(""), null);
});
