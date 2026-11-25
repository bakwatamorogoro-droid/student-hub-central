import { test } from "node:test";
import assert from "node:assert/strict";

import { resultRows, compareByName } from "./resultRows.ts";

const sub = (name: string | null, reg: string, score: number | null) => ({
  reg_no: reg,
  score,
  students: name === null ? null : { full_name: name },
});

test("every row carries exactly name, registration number and mark", () => {
  const [row] = resultRows([sub("Amina Juma", "IS/2024/001", 72)]);
  assert.deepEqual(Object.keys(row).sort(), ["Alama", "Jina", "Reg Namba"]);
  assert.deepEqual(row, { Jina: "Amina Juma", "Reg Namba": "IS/2024/001", Alama: "72" });
});

test("rows are sorted A to Z by name, ignoring case", () => {
  const rows = resultRows([
    sub("zainab Ally", "R3", 50),
    sub("abdul Karim", "R1", 60),
    sub("Fatuma Said", "R2", 70),
  ]);
  assert.deepEqual(
    rows.map((r) => r.Jina),
    ["abdul Karim", "Fatuma Said", "zainab Ally"],
  );
});

test("an unmarked paper exports a blank cell, not a zero", () => {
  const [row] = resultRows([sub("Amina Juma", "R1", null)]);
  assert.equal(row.Alama, "");
});

test("a fractional mark is rounded to the whole number the class reads", () => {
  const [row] = resultRows([sub("Amina Juma", "R1", 71.6)]);
  assert.equal(row.Alama, "72");
});

test("a submission with no student record still exports its registration number", () => {
  const [row] = resultRows([sub(null, "IS/2024/009", 40)]);
  assert.equal(row.Jina, "—");
  assert.equal(row["Reg Namba"], "IS/2024/009");
});

test("students sharing a name fall back to registration number, so order is stable", () => {
  const rows = resultRows([sub("Ali", "R2", 10), sub("Ali", "R1", 20)]);
  assert.deepEqual(
    rows.map((r) => r["Reg Namba"]),
    ["R1", "R2"],
  );
});

test("an empty list exports nothing rather than throwing", () => {
  assert.deepEqual(resultRows([]), []);
  assert.equal(
    compareByName(
      { Jina: "a", "Reg Namba": "", Alama: "" },
      { Jina: "a", "Reg Namba": "", Alama: "" },
    ),
    0,
  );
});

test("a name typed in decorative Unicode exports as the letters it stands for", () => {
  // Copied from the live database: a student whose name was entered with a
  // "fancy text" keyboard. It reads as SALIMA ALLY BAULENI, but the PDF fonts
  // have no glyph for U+1D63C and printed the whole cell blank.
  const fancy = "𝙎𝘼𝙇𝙄𝙈𝘼 𝘼𝙇𝙇𝙔 BAULENI";
  const [row] = resultRows([sub(fancy, "R1", 2)]);
  assert.equal(row.Jina, "SALIMA ALLY BAULENI");
  assert.ok(/^[\x20-\x7E]+$/.test(row.Jina), "name still holds characters a PDF cannot draw");
});

test("plain names pass through untouched", () => {
  const [row] = resultRows([sub("YUSSUF MOH’D SALIM", "R1", 6)]);
  assert.equal(row.Jina, "YUSSUF MOH’D SALIM");
});
