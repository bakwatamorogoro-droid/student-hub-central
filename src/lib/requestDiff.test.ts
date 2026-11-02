import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRows, placementRows, FIELD_LABELS } from "./requestDiff.ts";

/**
 * The rows below are copied from the live profile_update_requests table. Every one of
 * them has an empty `changed_fields` while carrying the student's own semina, group
 * and course — which is exactly what the admin page used to print as a correction.
 */
const livePhantomRow = {
  current_reg_no: "MUM2021-04-06376",
  current_full_name: "A",
  new_semina: "SEMINA 5",
  new_student_group: "GROUP 4",
  new_course: "LLB",
  changed_fields: [],
};

test("a request with no changed fields shows no corrections", () => {
  assert.deepEqual(diffRows(livePhantomRow), []);
});

test("the old rendering would have shown three corrections for that row", () => {
  // What the previous code did: every non-null column, baseline null.
  const old: string[] = [];
  if (livePhantomRow.new_semina) old.push("semina");
  if (livePhantomRow.new_student_group) old.push("group");
  if (livePhantomRow.new_course) old.push("course");
  assert.deepEqual(old, ["semina", "group", "course"]);
  assert.deepEqual(diffRows(livePhantomRow), [], "the fix must show none of them");
});

test("a real course change shows course alone, with before and after", () => {
  const r = {
    ...livePhantomRow,
    current_course: "LLB",
    new_course: "Bachelor of law with shariah",
    changed_fields: ["course"],
  };
  assert.deepEqual(diffRows(r), [
    { key: "course", label: "Kozi", from: "LLB", to: "Bachelor of law with shariah" },
  ]);
});

test("semina and group appear only for a move the system recorded", () => {
  const r = {
    ...livePhantomRow,
    current_semina: "SEMINA 5",
    new_semina: "SEMINA 7",
    changed_fields: ["semina"],
  };
  assert.deepEqual(diffRows(r), [
    { key: "semina", label: "Semina", from: "SEMINA 5", to: "SEMINA 7" },
  ]);
});

test("a field marked changed but holding the same value is not a correction", () => {
  const r = {
    ...livePhantomRow,
    current_course: "LLB",
    new_course: "LLB",
    changed_fields: ["course"],
  };
  assert.deepEqual(diffRows(r), []);
});

test("an old row with no snapshot still shows the change, without a baseline", () => {
  // Rows created before the current_* columns existed have no "before" value. The
  // change is real, so it must still reach the admin — just with nothing struck
  // through, rather than being hidden or given an invented baseline.
  const r = { ...livePhantomRow, changed_fields: ["course"], new_course: "LLB" };
  assert.deepEqual(diffRows(r), [{ key: "course", label: "Kozi", from: undefined, to: "LLB" }]);
});

test("several real changes render together", () => {
  const r = {
    ...livePhantomRow,
    current_course: "LLB",
    new_course: "Bachelor of law with shariah",
    current_semester: "SEMESTER 1",
    new_semester: "SEMESTER 2",
    changed_fields: ["course", "semester"],
  };
  assert.deepEqual(
    diffRows(r).map((p) => p.key),
    ["course", "semester"],
  );
});

test("the placement the group system wrote is read back", () => {
  assert.deepEqual(placementRows({ placed_semina: "SEMINA 7", placed_student_group: "GROUP 2" }), [
    { label: "Semina", value: "SEMINA 7" },
    { label: "Group", value: "GROUP 2" },
  ]);
  assert.deepEqual(placementRows(livePhantomRow), []);
});

test("every key the student form can write has a label", () => {
  for (const k of ["reg_no", "full_name", "semina", "group", "course", "study_year", "semester"]) {
    assert.ok(FIELD_LABELS[k], `missing label for ${k}`);
  }
});
