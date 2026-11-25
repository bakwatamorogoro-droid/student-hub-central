/**
 * What the admin fills in when composing a test.
 *
 * Three rules live here rather than inline in the form, because each one has a
 * failure mode that is invisible until later:
 *
 * 1. **Only one kind of test is offered.** The builder used to ask for a quiz
 *    mode (individual / group / assignment), and a mis-picked "group" quietly
 *    changed how marks were added up. Every test composed here is an individual
 *    test.
 * 2. **The course is required, with both a name and a code.** An exam with no
 *    course cannot be told apart from another in the list, and results cannot be
 *    grouped by course. The code is what a student recognises on a timetable.
 * 3. **Publishing is a decision made in the list, not only in the form.** An
 *    unpublished test is invisible to students; the admin needs to see and flip
 *    that from the list without opening the editor.
 */

export type CourseFields = {
  courseName?: string | null;
  courseCode?: string | null;
};

export type CourseErrors = {
  courseName?: string;
  courseCode?: string;
};

/** Collapses runs of whitespace so "  Islamic   Studies " and its twin compare equal. */
function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Course codes are compared and stored uppercase with no inner spaces:
 * "is 120", "IS120" and " is120 " are the same code.
 */
export function normaliseCourseCode(raw: string | null | undefined): string {
  return collapse(String(raw ?? ""))
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** The course name as typed, with whitespace tidied. */
export function normaliseCourseName(raw: string | null | undefined): string {
  return collapse(String(raw ?? ""));
}

/** Longest values the form accepts, matching the database columns. */
export const COURSE_NAME_MAX = 120;
export const COURSE_CODE_MAX = 20;

/**
 * A code is the short identifier on a timetable: letters, digits, and the
 * separators that appear in real codes (`IS120`, `QUR-101`, `ISL 204`).
 */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/;

/**
 * Why a course cannot be saved, keyed by field. An empty object means it can.
 *
 * The course is compulsory when a test is **created** — the owner asked for the
 * code to be mandatory, and a test with no course cannot be told apart from
 * another in the list. When an older test is edited, the fields are checked only
 * if they have been filled in, so an exam composed before this rule existed can
 * still have its duration or questions changed.
 */
export function validateCourse(fields: CourseFields, required = true): CourseErrors {
  const errors: CourseErrors = {};
  const name = normaliseCourseName(fields.courseName);
  const code = normaliseCourseCode(fields.courseCode);

  if (!name) {
    if (required) errors.courseName = "Jina la kozi linahitajika.";
  } else if (name.length > COURSE_NAME_MAX)
    errors.courseName = `Jina la kozi lisiwe zaidi ya herufi ${COURSE_NAME_MAX}.`;

  if (!code) {
    if (required) errors.courseCode = "Code ya kozi inahitajika.";
  } else if (code.length > COURSE_CODE_MAX)
    errors.courseCode = `Code ya kozi isiwe zaidi ya herufi ${COURSE_CODE_MAX}.`;
  else if (!CODE_PATTERN.test(code))
    errors.courseCode = "Code itumie herufi, namba, au - . _ pekee (mfano IS120).";

  return errors;
}

/**
 * The payload for the two course columns, normalised.
 *
 * `retryWithoutMissingColumns` drops these if the migration adding them has not
 * been applied, so the rest of the test still saves.
 */
export function coursePayload(fields: CourseFields): {
  course_name: string | null;
  course_code: string | null;
} {
  const name = normaliseCourseName(fields.courseName);
  const code = normaliseCourseCode(fields.courseCode);
  return { course_name: name || null, course_code: code || null };
}

/** "INTRODUCTION TO QUR'AN (IS120)" — the code in brackets, when there is one. */
export function courseLabel(exam: CourseFields | null | undefined): string | null {
  const name = normaliseCourseName(exam?.courseName);
  const code = normaliseCourseCode(exam?.courseCode);
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  return null;
}

/** Where a course is read from a database row, which uses snake_case. */
export function courseFromRow(row: Record<string, unknown> | null | undefined): CourseFields {
  return {
    courseName: (row?.course_name as string | null) ?? null,
    courseCode: (row?.course_code as string | null) ?? null,
  };
}

/** What students see. Unpublished is the default, so a half-built test stays hidden. */
export function visibilityLabel(published: boolean | null | undefined): string {
  return published ? "Inaonekana kwa wanafunzi" : "Haionekani kwa wanafunzi";
}

/**
 * The next publish state, so the list button and the form switch cannot drift.
 * A null/undefined value counts as unpublished, which is what the database default is.
 */
export function toggledPublish(published: boolean | null | undefined): boolean {
  return !published;
}

/**
 * Why the publish control is worth showing: an exam with no questions is
 * publishable in the database but useless to a student, so the list warns.
 */
export function publishWarning(questionCount: number): string | null {
  if (questionCount > 0) return null;
  return "Hakuna maswali bado — mtihani utaonekana tupu kwa wanafunzi.";
}
