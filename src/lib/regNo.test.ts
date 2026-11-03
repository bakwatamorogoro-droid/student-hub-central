import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalRegNo, displayRegNo, groupByRegNo, isUsableRegNo, sameRegNo } from "./regNo.ts";

test("the three spellings the roster really carries collapse to one number", () => {
  const a = "MUM2025-04-15805";
  const b = "MUM2025-04-15805 "; // trailing space from the spreadsheet
  const c = "MUM2025 -04-15805"; // space after the year
  const d = "mum2025-04-15805"; // lower case
  assert.equal(canonicalRegNo(a), canonicalRegNo(b));
  assert.equal(canonicalRegNo(a), canonicalRegNo(c));
  assert.equal(canonicalRegNo(a), canonicalRegNo(d));
  assert.equal(canonicalRegNo(a), "MUM20250415805");
});

test("a stored number is trimmed, upper-cased, and free of inner spaces", () => {
  assert.equal(displayRegNo("  mum2025 -04-15805 "), "MUM2025-04-15805");
  assert.equal(displayRegNo("MUM2025-04-15805"), "MUM2025-04-15805");
  // The hyphens the cohort writes are kept; only spaces are a typo.
  assert.equal(displayRegNo("MUM 2025-04-15805"), "MUM2025-04-15805");
});

test("two different students are never called the same", () => {
  assert.equal(sameRegNo("MUM2025-04-15805", "MUM2025-04-15806"), false);
  assert.equal(sameRegNo("MUM2025-04-15805", "MUM2024-04-15805"), false);
  assert.equal(sameRegNo("MUM2025-04-15805", "MUM2025-04-15805"), true);
  // Reordered digits are a different number, not a "close enough" one.
  assert.equal(sameRegNo("MUM2025-04-15805", "MUM2025-04-15085"), false);
});

test("an empty or too-short number is not a number we can merge on", () => {
  assert.equal(isUsableRegNo(""), false);
  assert.equal(isUsableRegNo("   "), false);
  assert.equal(isUsableRegNo("M1"), false);
  assert.equal(isUsableRegNo("MUM"), false);
  assert.equal(isUsableRegNo("MUM2025-04-15805"), true);
  // Two unknown numbers must never be treated as the same student.
  assert.equal(sameRegNo("", ""), false);
  assert.equal(sameRegNo("   ", null), false);
});

test("duplicate groups are found, and a lone number is not one", () => {
  const rows = [
    { id: "a", reg_no: "MUM2025-04-15805 " },
    { id: "b", reg_no: "MUM2025 -04-15805" },
    { id: "c", reg_no: "MUM2025-04-15805" },
    { id: "d", reg_no: "MUM2025-04-99999" },
  ];
  const groups = groupByRegNo(rows, (r) => r.reg_no);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].canonical, "MUM20250415805");
  assert.deepEqual(
    groups[0].rows.map((r) => r.id),
    ["a", "b", "c"],
  );
});

test("the group keeps the order it was given, so the earliest row leads", () => {
  const rows = [
    { id: "first", reg_no: "MUM2025-04-13229", created: "2025-01-01" },
    { id: "second", reg_no: "MUM2025-04-13229 ", created: "2025-06-01" },
  ];
  const [group] = groupByRegNo(rows, (r) => r.reg_no);
  assert.deepEqual(
    group.rows.map((r) => r.id),
    ["first", "second"],
  );
});

test("rows with no usable number are left out rather than grouped together", () => {
  const rows = [
    { id: "a", reg_no: "" },
    { id: "b", reg_no: null },
    { id: "c", reg_no: "  " },
  ];
  assert.deepEqual(
    groupByRegNo(rows, (r) => r.reg_no),
    [],
  );
});
