import { test } from "node:test";
import assert from "node:assert/strict";

import {
  academicYearFromDate,
  buildExamHistory,
  courseCodeFromTitle,
  examAcademicYear,
  historyTotal,
  normaliseAcademicYear,
} from "./examHistory.ts";

test("a paper sat before July belongs to the year that started the previous August", () => {
  assert.equal(academicYearFromDate("2026-05-20T14:42:41Z"), "2025/2026");
  assert.equal(academicYearFromDate("2026-06-19T21:42:23Z"), "2025/2026");
});

test("a paper sat from July onwards belongs to the new year", () => {
  assert.equal(academicYearFromDate("2026-11-25T13:06:38Z"), "2026/2027");
  assert.equal(academicYearFromDate("2026-07-01T00:00:00Z"), "2026/2027");
});

test("a missing or unreadable date has no year rather than a wrong one", () => {
  assert.equal(academicYearFromDate(null), null);
  assert.equal(academicYearFromDate("not a date"), null);
});

test("the admin's own year wins and is normalised", () => {
  assert.equal(normaliseAcademicYear("2026/2027"), "2026/2027");
  assert.equal(normaliseAcademicYear("2025 - 2026"), "2025/2026");
  assert.equal(normaliseAcademicYear("2025-2026"), "2025/2026");
  assert.equal(normaliseAcademicYear(""), null);
  assert.equal(
    examAcademicYear({
      id: "x",
      target_academic_year: "2026/2027",
      start_time: "2026-05-20T00:00:00Z",
    }),
    "2026/2027",
  );
});

test("the year falls back to the start time, then the creation date", () => {
  assert.equal(
    examAcademicYear({ id: "x", target_academic_year: null, start_time: "2026-11-25T10:05:00Z" }),
    "2026/2027",
  );
  assert.equal(
    examAcademicYear({ id: "x", start_time: null, created_at: "2026-06-16T08:43:09Z" }),
    "2025/2026",
  );
});

test("a course code is read from the title the live row actually carries", () => {
  // The real title on the live exam row.
  assert.equal(
    courseCodeFromTitle(
      "INTRODUCTION TO QUR’AN AND HADITH STUDIES (IS120) SEMINAR QUESTIONS - 2025/2026 ASSIGNMENT [15 MARKS]",
    ),
    "IS120",
  );
  assert.equal(courseCodeFromTitle("ISL 204 — Fiqh"), "ISL204");
  assert.equal(courseCodeFromTitle("QUR-101"), "QUR101");
});

test("a title with no code does not invent one", () => {
  assert.equal(courseCodeFromTitle("ASSESSMENT TEST 2"), null);
  assert.equal(courseCodeFromTitle("viwango"), null);
  assert.equal(courseCodeFromTitle(""), null);
  assert.equal(courseCodeFromTitle(null), null);
});

test("year and marks are not mistaken for a course code", () => {
  assert.equal(courseCodeFromTitle("SEMINAR 2025/2026"), null);
  assert.equal(courseCodeFromTitle("TEST 120 [15 MARKS]"), null);
  assert.equal(courseCodeFromTitle("EXAM 2026"), null);
});

test("only exams that were sat get a frame", () => {
  const entries = buildExamHistory(
    [
      { id: "a", title: "Hadith (IS120)", start_time: "2026-06-29T00:00:00Z" },
      { id: "b", title: "viwango", test_number: 1, target_academic_year: "2026/2027" },
    ],
    { a: 1243, b: 0 },
  );
  assert.deepEqual(
    entries.map((e) => [e.key, e.count, e.name]),
    [["a", 1243, "IS120"]],
  );
});

test("frames run busiest first, then newest year", () => {
  const entries = buildExamHistory(
    [
      { id: "old", title: "Hadith (IS120)", start_time: "2026-06-29T00:00:00Z" },
      { id: "new", title: "Assessment", start_time: "2026-11-25T00:00:00Z" },
      { id: "mid", title: "Viwango", start_time: "2026-10-01T00:00:00Z" },
    ],
    { old: 1243, new: 1, mid: 50 },
  );
  assert.deepEqual(
    entries.map((e) => e.key),
    ["old", "mid", "new"],
  );
});

test("a frame falls back to the test label, then the title, when there is no code", () => {
  const [labelled] = buildExamHistory(
    [{ id: "a", title: "MAJARIO", test_number: 2, start_time: "2026-11-25T00:00:00Z" }],
    { a: 5 },
  );
  assert.equal(labelled.name, "Test 2");

  const [untitled] = buildExamHistory(
    [{ id: "b", title: "  viwango  ", start_time: "2026-11-25T00:00:00Z" }],
    { b: 5 },
  );
  assert.equal(untitled.name, "viwango");
});

test("the study year is kept only when it is a real year", () => {
  const [entry] = buildExamHistory(
    [{ id: "a", title: "X (IS120)", target_study_year: 2, start_time: "2026-11-25T00:00:00Z" }],
    { a: 3 },
  );
  assert.equal(entry.studyYear, 2);

  const [none] = buildExamHistory(
    [{ id: "b", title: "Y (IS120)", target_study_year: 0, start_time: "2026-11-25T00:00:00Z" }],
    { b: 3 },
  );
  assert.equal(none.studyYear, null);
});

test("the frame list is capped so the ticker cannot run long", () => {
  const exams = Array.from({ length: 9 }, (_, i) => ({
    id: `e${i}`,
    title: `Course (IS10${i})`,
    start_time: "2026-11-25T00:00:00Z",
  }));
  const counts = Object.fromEntries(exams.map((e, i) => [e.id, 10 + i]));
  assert.equal(buildExamHistory(exams, counts).length, 6);
  assert.equal(buildExamHistory(exams, counts, 2).length, 2);
});

test("a long title is shortened so it cannot break the card", () => {
  const [entry] = buildExamHistory(
    [
      {
        id: "a",
        title:
          "INTRODUCTION TO QUR’AN AND HADITH STUDIES SEMINAR QUESTIONS - 2025/2026 ASSIGNMENT [15 MARKS]",
        start_time: "2026-06-29T00:00:00Z",
      },
    ],
    { a: 4 },
  );
  assert.equal(entry.name, "INTRODUCTION TO QUR’AN AND");
});

test("the total adds up the frames", () => {
  const entries = buildExamHistory(
    [
      { id: "a", title: "A (IS120)", start_time: "2026-06-29T00:00:00Z" },
      { id: "b", title: "B (IS130)", start_time: "2026-11-25T00:00:00Z" },
    ],
    { a: 1243, b: 1295 },
  );
  assert.equal(historyTotal(entries), 2538);
  assert.equal(historyTotal([]), 0);
});
