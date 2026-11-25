import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_CODE_MAX,
  COURSE_NAME_MAX,
  courseFromRow,
  courseLabel,
  coursePayload,
  normaliseCourseCode,
  normaliseCourseName,
  publishWarning,
  toggledPublish,
  validateCourse,
  visibilityLabel,
} from "./examBuilder.ts";

test("course name is trimmed and inner whitespace collapsed", () => {
  assert.equal(normaliseCourseName("  Introduction   to  Qur'an "), "Introduction to Qur'an");
  assert.equal(normaliseCourseName(null), "");
  assert.equal(normaliseCourseName(undefined), "");
});

test("course code is uppercased and stripped of spaces", () => {
  assert.equal(normaliseCourseCode(" is 120 "), "IS120");
  assert.equal(normaliseCourseCode("qur-101"), "QUR-101");
  assert.equal(normaliseCourseCode(null), "");
});

test("both course fields are required", () => {
  const errors = validateCourse({});
  assert.equal(errors.courseName, "Jina la kozi linahitajika.");
  assert.equal(errors.courseCode, "Code ya kozi inahitajika.");
});

test("whitespace alone does not satisfy a required field", () => {
  const errors = validateCourse({ courseName: "   ", courseCode: "   " });
  assert.ok(errors.courseName);
  assert.ok(errors.courseCode);
});

test("a complete course passes", () => {
  const fields = { courseName: "Introduction to Qur'an and Hadith", courseCode: "is120" };
  assert.deepEqual(validateCourse(fields), {});
});

test("a code with a slash is refused, and a spaced code is simply normalised", () => {
  assert.ok(validateCourse({ courseName: "Fiqh", courseCode: "IS/120" }).courseCode);
  assert.ok(validateCourse({ courseName: "Fiqh", courseCode: "-120" }).courseCode);
  // "IS 120" is the same code as "IS120", so it is stored that way rather than refused.
  assert.deepEqual(validateCourse({ courseName: "Fiqh", courseCode: "IS 120" }), {});
});

test("over-long values are refused with their limit named", () => {
  const name = validateCourse({ courseName: "a".repeat(COURSE_NAME_MAX + 1), courseCode: "IS1" });
  assert.match(name.courseName!, new RegExp(String(COURSE_NAME_MAX)));
  const code = validateCourse({ courseName: "Fiqh", courseCode: "A".repeat(COURSE_CODE_MAX + 1) });
  assert.match(code.courseCode!, new RegExp(String(COURSE_CODE_MAX)));
});

test("coursePayload stores the normalised pair and nulls when absent", () => {
  assert.deepEqual(coursePayload({ courseName: " Hadith ", courseCode: "is 120" }), {
    course_name: "Hadith",
    course_code: "IS120",
  });
  assert.deepEqual(coursePayload({}), { course_name: null, course_code: null });
});

test("courseLabel prefers name plus code, and degrades gracefully", () => {
  assert.equal(courseLabel({ courseName: "Hadith", courseCode: "IS120" }), "Hadith (IS120)");
  assert.equal(courseLabel({ courseName: "Hadith" }), "Hadith");
  assert.equal(courseLabel({ courseCode: "is120" }), "IS120");
  assert.equal(courseLabel({}), null);
  assert.equal(courseLabel(null), null);
});

test("courseFromRow reads the snake_case columns", () => {
  assert.deepEqual(courseFromRow({ course_name: "Tafsir", course_code: "QUR-101" }), {
    courseName: "Tafsir",
    courseCode: "QUR-101",
  });
  assert.deepEqual(courseFromRow(null), { courseName: null, courseCode: null });
});

test("publish state flips both ways and null counts as unpublished", () => {
  assert.equal(toggledPublish(false), true);
  assert.equal(toggledPublish(true), false);
  assert.equal(toggledPublish(null), true);
  assert.equal(toggledPublish(undefined), true);
  assert.equal(visibilityLabel(true), "Inaonekana kwa wanafunzi");
  assert.equal(visibilityLabel(false), "Haionekani kwa wanafunzi");
});

test("an exam with no questions is flagged before publishing", () => {
  assert.match(publishWarning(0)!, /Hakuna maswali/);
  assert.equal(publishWarning(1), null);
});

test("an edit may leave the course blank, a create may not", () => {
  assert.deepEqual(validateCourse({}, false), {});
  assert.ok(validateCourse({}, true).courseCode);
  // A partly-filled pair is still checked when editing: the code that is there
  // must be a valid one.
  assert.ok(validateCourse({ courseCode: "IS/120" }, false).courseCode);
});
