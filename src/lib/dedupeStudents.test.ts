import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseKeeper,
  dedupeTotals,
  describeGroup,
  attendanceQuality,
  contentColumns,
  denormPayload,
  richerRow,
  submissionQuality,
  normalisedKeeper,
  planDedupe,
  planMove,
  type StudentRow,
} from "./dedupeStudents.ts";
import { displayRegNo, groupByRegNo } from "./regNo.ts";

const row = (
  id: string,
  reg: string,
  created: string,
  extra: Partial<StudentRow> = {},
): StudentRow => ({
  id,
  reg_no: reg,
  full_name: `MTU ${id}`,
  created_at: created,
  semina: "SEMINA 1",
  student_group: "GROUP 1",
  ...extra,
});

test("the earliest registration is the one kept", () => {
  const rows = [
    row("b", "MUM2025-04-1 ", "2025-06-01"),
    row("a", "MUM2025-04-1", "2025-01-01"),
    row("c", "MUM2025-04-1", "2025-09-01"),
  ];
  const { keeper, reason } = chooseKeeper(rows);
  assert.equal(keeper.id, "a");
  assert.match(reason, /kwanza/);
});

test("an incomplete row is passed over when a complete one exists", () => {
  const rows = [
    row("a", "MUM2025-04-1", "2025-01-01", { student_group: "" }),
    row("b", "MUM2025-04-1", "2025-06-01"),
  ];
  const { keeper, reason } = chooseKeeper(rows);
  // The earliest row cannot submit group work, so the complete one stays.
  assert.equal(keeper.id, "b");
  assert.match(reason, /kamili/);
});

test("when every row is incomplete the earliest still wins", () => {
  const rows = [
    row("a", "MUM2025-04-1", "2025-01-01", { student_group: "" }),
    row("b", "MUM2025-04-1", "2025-06-01", { student_group: "" }),
  ];
  assert.equal(chooseKeeper(rows).keeper.id, "a");
});

test("a plan keeps one row per number and removes the rest", () => {
  const rows = [
    row("a", "MUM2025-04-1", "2025-01-01"),
    row("b", "MUM2025-04-1 ", "2025-06-01"),
    row("c", "MUM2025-04-2", "2025-02-01"),
  ];
  const groups = groupByRegNo(rows, (r) => r.reg_no);
  const plan = planDedupe(groups);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].keeper.id, "a");
  assert.deepEqual(
    plan[0].removals.map((r) => r.id),
    ["b"],
  );
  assert.deepEqual(dedupeTotals(plan), { groups: 1, removals: 1 });
});

test("the keeper is written back in the tidy spelling", () => {
  const keeper = row("a", "MUM2025 -04-1", "2025-01-01");
  assert.equal(normalisedKeeper(keeper, displayRegNo).reg_no, "MUM2025-04-1");
});

test("a dependent that would collide with the keeper's own row is not moved", () => {
  // The keeper already has a submission for exam X; the removed row has one too.
  const dependents = [
    { id: "s1", exam: "X" },
    { id: "s2", exam: "Y" },
  ];
  const plan = planMove(dependents, (d) => d.exam, new Set(["X"]));
  assert.deepEqual(
    plan.move.map((d) => d.id),
    ["s2"],
  );
  assert.deepEqual(
    plan.collisions.map((d) => d.id),
    ["s1"],
  );
});

test("a group reads as one line naming the keeper", () => {
  const rows = [row("a", "MUM2025-04-1", "2025-01-01"), row("b", "MUM2025-04-1", "2025-02-01")];
  const plan = planDedupe(groupByRegNo(rows, (r) => r.reg_no));
  const line = describeGroup(plan[0]);
  assert.match(line, /MUM2025-04-1/);
  assert.match(line, /\+1/);
});

test("a moved dependent points at the keeper and takes its tidy details", () => {
  const keeper = {
    ...row("a", "MUM2025 -04-1", "2025-01-01"),
    full_name: "Amina Hassan",
    semina: "Semina A",
    student_group: "1",
  };
  const payload = denormPayload(
    ["reg_no", "full_name", "semina", "student_group"],
    keeper,
    displayRegNo,
  );
  assert.equal(payload.student_id, "a");
  assert.equal(payload.reg_no, "MUM2025-04-1");
  assert.equal(payload.full_name, "Amina Hassan");
  assert.equal(payload.semina, "Semina A");
  assert.equal(payload.student_group, "1");
});

test("a table without a column never gets that column written to it", () => {
  // `group_messages` has no reg_no, and `profile_update_requests` calls its
  // copies current_*. Writing the wrong name would fail the whole merge.
  const keeper = { ...row("a", "MUM2025-04-1", "2025-01-01"), full_name: "Amina" };
  const groupMessage = denormPayload(["full_name"], keeper, displayRegNo);
  assert.deepEqual(Object.keys(groupMessage).sort(), ["full_name", "student_id"]);
  const request = denormPayload(["current_reg_no", "current_full_name"], keeper, displayRegNo);
  assert.deepEqual(Object.keys(request).sort(), [
    "current_full_name",
    "current_reg_no",
    "student_id",
  ]);
  assert.equal(request.current_reg_no, "MUM2025-04-1");
});

test("a finished exam outranks a blank start, whatever the score", () => {
  const blank = { answers: {}, score: 20, submitted_at: null };
  const finished = { answers: { q1: "a", q2: "b" }, score: 3, submitted_at: "2025-01-01" };
  assert.ok(submissionQuality(finished) > submissionQuality(blank));
});

test("the duplicate's richer answers are copied onto the keeper's row", () => {
  // The live data has this: the keeper's copy scored 8.25, the duplicate 10.55.
  const keeperRow = { id: "k1", student_id: "k", exam_id: "X", answers: { q1: "a" }, score: 8.25 };
  const dupRow = {
    id: "d1",
    student_id: "d",
    exam_id: "X",
    answers: { q1: "a", q2: "b" },
    score: 10.55,
  };
  const winner = richerRow(keeperRow, dupRow, submissionQuality);
  assert.equal(winner.id, "d1");
  const content = contentColumns(winner, ["id", "student_id", "exam_id"]);
  // The content is copied, but never the identity: the keeper's row keeps its id.
  assert.deepEqual(Object.keys(content).sort(), ["answers", "score"]);
});

test("an equal collision leaves the keeper's own row alone", () => {
  const keeperRow = { id: "k1", answers: { q1: "a" }, score: 5 };
  const dupRow = { id: "d1", answers: { q1: "a" }, score: 5 };
  assert.equal(richerRow(keeperRow, dupRow, submissionQuality).id, "k1");
});

test("an attendance row with GPS outranks one without", () => {
  assert.ok(attendanceQuality({ gps_lat: 1, gps_lng: 2 }) > attendanceQuality({ gps_lat: null }));
});
