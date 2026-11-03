import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_MARKS_HEADERS,
  GROUP_MARKS_HEADERS,
  allMarksRows,
  allMarksTable,
  formatMark,
  gradeOf,
  gradeOrDash,
  groupMarkId,
  groupMarksRows,
  groupMarksTable,
  groupOverviewRows,
  marksSummary,
  markPercent,
  parseMark,
  trimNumber,
  type GroupMark,
} from "./assignmentMarks.ts";

/** Unwraps a parse the test expects to succeed, failing loudly when it does not. */
function markOf(text: string, fallbackMax?: number) {
  const out = parseMark(text, fallbackMax);
  if (!out.ok) throw new Error(`expected ${JSON.stringify(text)} to parse, got: ${out.error}`);
  return out.mark;
}

test("the owner's own example, 7/24, is a mark", () => {
  assert.deepEqual(markOf("7/24"), { score: 7, max: 24 });
});

test("spacing and the other ways a mark is written are accepted", () => {
  for (const text of ["7 / 24", "7-24", "7 out of 24", "7 kati ya 24", "7 of 24"]) {
    assert.deepEqual(markOf(text), { score: 7, max: 24 }, text);
  }
});

test("a bare number is marked out of the fallback total", () => {
  assert.deepEqual(markOf("7"), { score: 7, max: 100 });
  assert.deepEqual(markOf("18", 20), { score: 18, max: 20 });
});

test("half marks are kept", () => {
  assert.deepEqual(markOf("7.5/24"), { score: 7.5, max: 24 });
  assert.deepEqual(markOf("7,5/24"), { score: 7.5, max: 24 });
});

test("zero is a real mark and must not be treated as empty", () => {
  assert.deepEqual(markOf("0/24"), { score: 0, max: 24 });
});

test("a mark above the total is a typo, not a mark", () => {
  const out = parseMark("25/24");
  assert.equal(out.ok, false);
  assert.match(out.ok === false ? out.error : "", /kuzidi jumla 24/);
});

test("empty and non-numeric input is rejected with a usable hint", () => {
  for (const bad of ["", "   ", "abc", "7%", "saba"]) {
    const out = parseMark(bad);
    assert.equal(out.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.ok(out.ok === false && out.error.length > 0);
  }
});

test("a total of zero or a negative score cannot be stored", () => {
  assert.equal(parseMark("7/0").ok, false);
  assert.equal(parseMark("-1/24").ok, false);
});

test("a mark is spelled back the way the owner wrote it", () => {
  assert.equal(formatMark(7, 24), "7/24");
  assert.equal(formatMark(7.5, 24), "7.5/24");
  assert.equal(formatMark(7, null), "7");
  assert.equal(formatMark(null, 24), "");
  assert.equal(formatMark(0, 24), "0/24");
});

test("a trailing .0 is trimmed but real decimals stay", () => {
  assert.equal(trimNumber(7), "7");
  assert.equal(trimNumber(7.0), "7");
  assert.equal(trimNumber(7.5), "7.5");
  assert.equal(trimNumber(7.4999), "7.5");
});

test("percent and grade follow the owner's pass bands", () => {
  assert.equal(markPercent(7, 24), (7 / 24) * 100);
  assert.equal(markPercent(7, null), null);
  assert.equal(markPercent(7, 0), null);
  assert.equal(gradeOf(100), "A");
  assert.equal(gradeOf(75), "A");
  assert.equal(gradeOf(74.9), "B");
  assert.equal(gradeOf(65), "B");
  assert.equal(gradeOf(50), "C");
  assert.equal(gradeOf(40), "D");
  assert.equal(gradeOf(39.9), "F");
  assert.equal(gradeOf(null), "");
});

/**
 * The owner was explicit: "ikiwa wote basi itaonesha tu majina, reg namba, kozi
 * na alama zao" — when exporting everyone, show only the name, registration
 * number, course and marks. Nothing about presenters, questions or seminars.
 */
test("the all-groups sheet carries only the four things the owner asked for", () => {
  assert.deepEqual(
    [...ALL_MARKS_HEADERS],
    ["Reg Namba", "Jina", "Kozi", "Alama", "Daraja (Grade)"],
  );

  const roster = [
    {
      reg_no: "MUM2025-04-13653",
      full_name: "IGAI ATHUMAN ZONZO",
      course: "BACHELOR OF ISLAMIC STUDIES WITH EDUCATION",
      semina: "SEMINA 6",
      gender: "Mwanaume",
      student_group: "GROUP 1",
    },
  ];
  const rows = allMarksRows(roster, []);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), [...ALL_MARKS_HEADERS]);
  assert.equal(rows[0].Jina, "IGAI ATHUMAN ZONZO");
  assert.equal(rows[0].Kozi, "BACHELOR OF ISLAMIC STUDIES WITH EDUCATION");
  assert.equal(rows[0].Alama, "");
});

test("a student's mark is found through the group they sit in", () => {
  const roster = [
    {
      reg_no: "A1",
      full_name: "AMINA",
      course: "BSED",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      student_group: "GROUP 5",
    },
    {
      reg_no: "B2",
      full_name: "BAKARI",
      course: "BSED",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      student_group: "GROUP 6",
    },
  ];
  const marks: GroupMark[] = [
    { semina: "SEMINA 3", gender: "male", group: "GROUP 5", score: 7, max: 24 },
  ];
  const rows = allMarksRows(roster, marks);
  const amina = rows.find((r) => r["Reg Namba"] === "A1")!;
  const bakari = rows.find((r) => r["Reg Namba"] === "B2")!;
  assert.equal(amina.Alama, "7/24");
  assert.equal(amina["Daraja (Grade)"], "F");
  // The other group has no mark yet, so the student stays on the roll, blank.
  assert.equal(bakari.Alama, "");
  assert.equal(bakari["Daraja (Grade)"], "");
});

test("gender spellings match the same group", () => {
  const roster = [
    {
      reg_no: "A1",
      full_name: "AMINA",
      course: "BSED",
      semina: "SEMINA 3",
      gender: "Mwanamke",
      student_group: "GROUP 5",
    },
  ];
  for (const gender of ["female", "FEMALE", "F", "ke", "MWANAMKE"]) {
    const rows = allMarksRows(roster, [
      { semina: "semina 3", gender, group: "group 5", score: 20, max: 24 },
    ]);
    assert.equal(rows[0].Alama, "20/24", gender);
  }
});

test("rows are ordered by registration number so the sheet reads like a roll", () => {
  const roster = [
    {
      reg_no: "MUM2025-04-9",
      full_name: "Z",
      course: "X",
      semina: "S",
      gender: "M",
      student_group: "G",
    },
    {
      reg_no: "MUM2025-04-1",
      full_name: "A",
      course: "X",
      semina: "S",
      gender: "M",
      student_group: "G",
    },
  ];
  assert.deepEqual(
    allMarksRows(roster, []).map((r) => r["Reg Namba"]),
    ["MUM2025-04-1", "MUM2025-04-9"],
  );
});

test("the table form is the same data, ready for a PDF grid", () => {
  const rows = allMarksRows(
    [
      {
        reg_no: "A1",
        full_name: "AMINA",
        course: "BSED",
        semina: "SEMINA 3",
        gender: "M",
        student_group: "GROUP 5",
      },
    ],
    [{ semina: "SEMINA 3", gender: "M", group: "GROUP 5", score: 18, max: 24 }],
  );
  assert.deepEqual(allMarksTable(rows), [["A1", "AMINA", "BSED", "18/24", "A"]]);
});

/* -------------------------------------------------------------------------- */
/* The overview: which groups did the work, and who to export                 */
/* -------------------------------------------------------------------------- */

const submission = (over: Partial<Parameters<typeof groupOverviewRows>[0][number]> = {}) => ({
  key: { semina: "SEMINA 3", gender: "Mwanaume", group: "GROUP 5" },
  label: "SEMINA 3 · GROUP 5 · WANAUME",
  presenters: ["AMINA", "BAKARI"],
  question: "Je, ni masharti gani ya mkopo?",
  answered: false,
  submittedAt: "2026-01-02T10:00:00.000Z",
  mark: null,
  markScore: null,
  markMax: null,
  annotations: [],
  row: { file_url: "https://x/f.pdf", file_name: "f.pdf" },
  ...over,
});

test("a group that did the work becomes one overview line, marked or not", () => {
  const rows = groupOverviewRows([
    submission(),
    submission({
      key: { semina: "SEMINA 3", gender: "Mwanamke", group: "GROUP 5" },
      label: "SEMINA 3 · GROUP 5 · WANAWAKE",
      mark: "18/24",
      markScore: 18,
      markMax: 24,
      answered: true,
      annotations: [{}, {}],
    }),
  ]);

  assert.equal(rows.length, 2);
  const men = rows.find((r) => r.gender === "MWANAUME")!;
  const women = rows.find((r) => r.gender === "MWANAMKE")!;

  // The same "GROUP 5" on each side of the seminar is two different groups.
  assert.notEqual(men.id, women.id);
  assert.equal(men.submitted, true);
  assert.equal(men.marked, false);
  assert.equal(men.mark, "");
  assert.equal(men.percent, null);
  assert.equal(men.grade, "");

  assert.equal(women.marked, true);
  assert.equal(women.mark, "18/24");
  assert.equal(women.percent, 75);
  assert.equal(women.grade, "A");
  assert.equal(women.answered, true);
  assert.equal(women.annotations, 2);
});

test("the overview key is the same key the mark is stored under", () => {
  const [row] = groupOverviewRows([submission()]);
  assert.equal(row.id, groupMarkId("SEMINA 3", "Mwanaume", "GROUP 5"));
  // A differently spelled gender lands on the same key, or the overview would
  // lose the mark its own roster row carries.
  assert.equal(row.id, groupMarkId("semina 3", "male", "group 5"));
});

test("the summary counts the groups, and averages only the marks that exist", () => {
  const groups = groupOverviewRows([
    submission({ mark: "18/24", markScore: 18, markMax: 24, answered: true }),
    submission({
      key: { semina: "SEMINA 3", gender: "Mwanaume", group: "GROUP 6" },
      mark: "6/24",
      markScore: 6,
      markMax: 24,
    }),
    // A group that submitted but has not been marked yet must not drag the
    // average toward zero.
    submission({
      key: { semina: "SEMINA 3", gender: "Mwanaume", group: "GROUP 7" },
    }),
  ]);

  const s = marksSummary(groups);
  assert.equal(s.total, 3);
  assert.equal(s.submitted, 3);
  assert.equal(s.marked, 2);
  assert.equal(s.answered, 1);
  assert.equal(s.average, 50); // (75 + 25) / 2, not divided by three
  assert.equal(s.best, 75);
  assert.equal(s.lowest, 25);
});

test("an empty overview has no average rather than a divide-by-zero", () => {
  const s = marksSummary([]);
  assert.deepEqual(s, {
    total: 0,
    submitted: 0,
    marked: 0,
    answered: 0,
    average: null,
    best: null,
    lowest: null,
  });
});

test("the per-group sheet shows the group, the seminar and the gender", () => {
  assert.deepEqual(
    [...GROUP_MARKS_HEADERS],
    ["Group", "Semina", "Jinsia", "Reg Namba", "Jina", "Kozi", "Alama", "Daraja (Grade)"],
  );
});

test("choosing groups keeps only those students, with their own group's mark", () => {
  const roster = [
    {
      reg_no: "A1",
      full_name: "AMINA",
      course: "BSED",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      student_group: "GROUP 5",
    },
    {
      reg_no: "B2",
      full_name: "BAKARI",
      course: "BSED",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      student_group: "GROUP 6",
    },
  ];
  const marks: GroupMark[] = [
    { semina: "SEMINA 3", gender: "Mwanaume", group: "GROUP 5", score: 18, max: 24 },
  ];
  const chosen = [groupMarkId("SEMINA 3", "Mwanaume", "GROUP 5")];

  const rows = groupMarksRows(roster, marks, chosen);
  assert.equal(rows.length, 1, "only the chosen group's students");
  assert.equal(rows[0]["Reg Namba"], "A1");
  assert.equal(rows[0].Group, "GROUP 5");
  assert.equal(rows[0].Jinsia, "Wanaume");
  assert.equal(rows[0].Alama, "18/24");
  assert.equal(rows[0]["Daraja (Grade)"], "A");

  // Choosing both groups keeps the group with no mark on the roll, blank.
  const both = groupMarksRows(roster, marks, [
    groupMarkId("SEMINA 3", "Mwanaume", "GROUP 5"),
    groupMarkId("SEMINA 3", "Mwanaume", "GROUP 6"),
  ]);
  assert.equal(both.length, 2);
  assert.equal(both.find((r) => r["Reg Namba"] === "B2")!.Alama, "");
  assert.equal(both.find((r) => r["Reg Namba"] === "B2")!["Daraja (Grade)"], "-");
});

test("the per-group sheet reads in seminar, gender and group order", () => {
  const roster = [
    {
      reg_no: "1",
      full_name: "A",
      course: "X",
      semina: "SEMINA 3",
      gender: "Mwanamke",
      student_group: "GROUP 5",
    },
    {
      reg_no: "2",
      full_name: "B",
      course: "X",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      student_group: "GROUP 6",
    },
    {
      reg_no: "3",
      full_name: "C",
      course: "X",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      student_group: "GROUP 5",
    },
  ];
  const all = roster.map((p) => groupMarkId(p.semina, p.gender, p.student_group));
  assert.deepEqual(
    groupMarksRows(roster, [], all).map((r) => `${r.Jinsia} ${r.Group} ${r["Reg Namba"]}`),
    ["Wanaume GROUP 5 3", "Wanaume GROUP 6 2", "Wanawake GROUP 5 1"],
  );
});

test("the per-group table form is the same data, ready for a PDF grid", () => {
  const rows = groupMarksRows(
    [
      {
        reg_no: "A1",
        full_name: "AMINA",
        course: "BSED",
        semina: "SEMINA 3",
        gender: "M",
        student_group: "GROUP 5",
      },
    ],
    [{ semina: "SEMINA 3", gender: "M", group: "GROUP 5", score: 18, max: 24 }],
    [groupMarkId("SEMINA 3", "M", "GROUP 5")],
  );
  assert.deepEqual(groupMarksTable(rows), [
    ["GROUP 5", "SEMINA 3", "Wanaume", "A1", "AMINA", "BSED", "18/24", "A"],
  ]);
});

test("an ungraded student shows a dash, not a false F", () => {
  assert.equal(gradeOrDash(null), "-");
  assert.equal(gradeOrDash(90), "A");
  assert.equal(gradeOrDash(10), "F");
});
