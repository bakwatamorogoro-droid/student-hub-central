import { test } from "node:test";
import assert from "node:assert/strict";
import { admissionYearFromReg, studyYearFromReg } from "./studyYear.ts";

/**
 * The Reg Namba shapes below are copied from the live `students` table. The separators are
 * inconsistent on purpose — a rule that reads a fixed position misses the spaced and
 * underscored rows, which is 472 of 1572 in the imported cohort.
 */
const liveShapes = [
  ["MUM2025-04-13774", 2025, 2],
  ["MUM2025-04-16583 ", 2025, 2],
  ["MUM 2025-04-15296", 2025, 2],
  ["MUM2025_04_13564", 2025, 2],
  ["MUM2021-04-06376", 2021, 2],
  ["MUM2015-04-14176", 2015, 2],
  ["2025-04-16526", 2025, 2],
  ["MUMUM2025-04-14337", 2025, 2],
] as const;

test("the intake year is read from every Reg Namba shape the cohort uses", () => {
  for (const [reg, admission] of liveShapes) {
    assert.equal(admissionYearFromReg(reg), admission, reg);
  }
});

test("a 2025 intake is in year 2 during 2026/2027", () => {
  assert.equal(studyYearFromReg("MUM2025-04-13774"), 2);
});

test("a 2024 intake is in year 3 during 2026/2027", () => {
  assert.equal(studyYearFromReg("MUM2024-04-09927", "2026/2027", 4), 3);
});

test("a year beyond the programme is clamped, not reported as year 12", () => {
  // Admitted 2015, so arithmetic says 12; a 2-year programme caps at 2.
  assert.equal(studyYearFromReg("MUM2015-04-14176"), 2);
  assert.equal(studyYearFromReg("MUM2015-04-14176", "2026/2027", 4), 4);
});

test("a Reg Namba with no readable year yields null so the caller can fall back", () => {
  assert.equal(admissionYearFromReg("MUM-04-15401"), null);
  assert.equal(studyYearFromReg("MUM-04-15401"), null);
  assert.equal(studyYearFromReg(""), null);
  assert.equal(studyYearFromReg(null), null);
});

test("an admission after the academic year does not produce year zero or below", () => {
  assert.equal(studyYearFromReg("MUM2030-04-10001"), null);
});

test("the academic year argument is honoured", () => {
  assert.equal(studyYearFromReg("MUM2025-04-13774", "2027/2028"), 2);
  assert.equal(studyYearFromReg("MUM2026-04-10001", "2027/2028"), 2);
});
