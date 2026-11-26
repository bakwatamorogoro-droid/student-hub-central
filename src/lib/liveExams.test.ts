import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveExams, countAnswers, STALE_AFTER_SECONDS } from "./liveExams.ts";

const exams = [{ id: "e1", title: "Islamic Studies Test", duration_minutes: 60 }];
const counts = new Map([["e1", 5]]);

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "s1",
    exam_id: "e1",
    student_id: "st1",
    reg_no: "2024/001",
    started_at: new Date(Date.now() - 60_000).toISOString(),
    submitted_at: null,
    answers: {},
    gps_distance_m: null,
    device_id: "dev1",
    last_seen_at: null,
    ...over,
  };
}

test("countAnswers ignores blanks, empty objects and nulls", () => {
  assert.equal(countAnswers({ a: "jibu", b: "", c: null, d: {}, e: { x: "y" }, f: 0 }), 3);
  assert.equal(countAnswers(null), 0);
  assert.equal(countAnswers([]), 0);
  assert.equal(countAnswers("nonsense"), 0);
});

test("buildLiveExams treats started-but-not-submitted as live", () => {
  const out = buildLiveExams(exams, [row()], counts);
  assert.equal(out.length, 1);
  assert.equal(out[0].live.length, 1);
  assert.equal(out[0].startedCount, 1);
  assert.equal(out[0].submittedCount, 0);
});

test("buildLiveExams counts a submitted paper and keeps it out of live", () => {
  const out = buildLiveExams(exams, [row({ submitted_at: new Date().toISOString() })], counts);
  assert.equal(out[0].live.length, 0);
  assert.equal(out[0].submittedCount, 1);
  assert.equal(out[0].startedCount, 0);
});

test("buildLiveExams ignores a row with neither start nor submit", () => {
  const out = buildLiveExams(exams, [row({ started_at: null })], counts);
  assert.equal(out.length, 0);
});

test("buildLiveExams drops exams with no activity at all", () => {
  const out = buildLiveExams(exams, [], counts);
  assert.equal(out.length, 0);
});

test("buildLiveExams flags a quiet heartbeat as stale", () => {
  const quiet = row({
    last_seen_at: new Date(Date.now() - (STALE_AFTER_SECONDS + 30) * 1000).toISOString(),
  });
  const out = buildLiveExams(exams, [quiet], counts);
  assert.equal(out[0].staleCount, 1);
  assert.ok(out[0].live[0].idleSeconds > STALE_AFTER_SECONDS);
});

test("buildLiveExams keeps a fresh heartbeat fresh", () => {
  const fresh = row({ last_seen_at: new Date().toISOString() });
  const out = buildLiveExams(exams, [fresh], counts);
  assert.equal(out[0].staleCount, 0);
  assert.ok(out[0].live[0].idleSeconds < 5);
});

test("buildLiveExams falls back to started_at when there is no heartbeat", () => {
  const out = buildLiveExams(exams, [row()], counts);
  assert.equal(out[0].live[0].lastSeenAt, null);
  assert.ok(out[0].live[0].idleSeconds >= 55);
});

test("buildLiveExams reports progress against the exam's question count", () => {
  const out = buildLiveExams(exams, [row({ answers: { q1: "a", q2: "b", q3: "" } })], counts);
  assert.equal(out[0].live[0].answeredCount, 2);
  assert.equal(out[0].live[0].questionCount, 5);
});

test("buildLiveExams orders sitters by start time", () => {
  const early = row({
    id: "a",
    student_id: "a",
    started_at: new Date(Date.now() - 300_000).toISOString(),
  });
  const late = row({
    id: "b",
    student_id: "b",
    started_at: new Date(Date.now() - 10_000).toISOString(),
  });
  const out = buildLiveExams(exams, [late, early], counts);
  assert.deepEqual(
    out[0].live.map((s) => s.submissionId),
    ["a", "b"],
  );
});

test("buildLiveExams skips rows for an exam it was not given", () => {
  const out = buildLiveExams(exams, [row({ exam_id: "other" })], counts);
  assert.equal(out.length, 0);
});

// ------------------------------------------------------- the paper's fence

const fenced = [
  { id: "e1", title: "Islamic Studies Test", duration_minutes: 60, area_radius_m: 120 },
];

test("a paper's radius reaches the live view", () => {
  const out = buildLiveExams(fenced, [row({ live_distance_m: 40 })], counts);
  assert.equal(out[0].radiusM, 120);
  assert.equal(out[0].live[0].liveDistanceM, 40);
  assert.equal(out[0].live[0].outsideArea, false);
  assert.equal(out[0].outsideCount, 0);
});

test("a student past the radius is counted as outside", () => {
  const out = buildLiveExams(fenced, [row({ live_distance_m: 480 })], counts);
  assert.equal(out[0].live[0].outsideArea, true);
  assert.equal(out[0].outsideCount, 1);
});

test('a paper set to "anywhere" has no radius, so nobody is outside', () => {
  const open = [
    { id: "e1", title: "Take-home", duration_minutes: 60, area_mode: "off", area_radius_m: 120 },
  ];
  const out = buildLiveExams(open, [row({ live_distance_m: 40_000 })], counts);
  assert.equal(out[0].radiusM, 0);
  assert.equal(out[0].outsideCount, 0);
  assert.equal(out[0].live[0].outsideArea, false);
});

test("a paper with no radius column yet reports zero rather than guessing", () => {
  const out = buildLiveExams(exams, [row({ live_distance_m: 900 })], counts);
  assert.equal(out[0].radiusM, 0);
  assert.equal(out[0].outsideCount, 0);
});

test("several students are counted separately", () => {
  const rows = [
    row({ id: "s1", live_distance_m: 10 }),
    row({ id: "s2", student_id: "st2", live_distance_m: 400 }),
    row({ id: "s3", student_id: "st3", live_distance_m: 700 }),
  ];
  const out = buildLiveExams(fenced, rows, counts);
  assert.equal(out[0].outsideCount, 2);
});
