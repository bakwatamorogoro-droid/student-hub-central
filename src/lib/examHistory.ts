/**
 * The history frames behind the "exams taken" counter.
 *
 * The dashboard used to print one number — every submission ever made — which
 * tells a visitor how busy the site is but not what was sat, for which course,
 * or in which academic year. The card now cycles through one frame per exam
 * (count, course, academic year, study year) so the same slot reads as a record
 * rather than a tally.
 *
 * The live `exams` table has no `course_code` column (the admin form's write is
 * dropped by `retryWithoutMissingColumns`), so the code is read from the title,
 * which is where it actually lives today: "…HADITH STUDIES (IS120)…".
 */

import { testLabel } from "./examCatalog.ts";

export type HistoryExam = {
  id: string;
  title?: string | null;
  test_number?: number | null;
  start_time?: string | null;
  created_at?: string | null;
  target_academic_year?: string | null;
  target_study_year?: number | null;
};

export type ExamHistoryEntry = {
  key: string;
  count: number;
  /** What the frame is called: the course code, else the test label, else the title. */
  name: string;
  academicYear: string | null;
  studyYear: number | null;
};

/** How many frames the ticker cycles through, the total frame aside. */
export const HISTORY_FRAME_LIMIT = 6;

/**
 * The academic year a date falls in.
 *
 * The Tanzanian academic year turns over mid-year, not on 1 January: a paper
 * sat in May 2026 belongs to 2025/2026, while one sat in November 2026 belongs
 * to 2026/2027. July is the boundary, which reproduces the year the admin had
 * typed on the live exam rows (`2026-11-25` → `2026/2027`).
 */
export function academicYearFromDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

/** "2025-2026" and "2025 / 2026" both read as "2025/2026"; anything else is ignored. */
export function normaliseAcademicYear(raw: string | null | undefined): string | null {
  const m = String(raw ?? "").match(/(\d{4})\s*[/-]\s*(\d{4})/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Words that look like a course prefix but are not one, so a title such as
 * "TEST 2025" or "EXAM 120" does not produce a code.
 */
const NOT_A_CODE = new Set(["TEST", "EXAM", "MARK", "MARKS", "SEM", "YEAR", "PAGE", "NO", "QUIZ"]);

/**
 * The course code inside a title.
 *
 * Only a bracketed or standalone token that starts with letters is accepted, so
 * the "[15 MARKS]" and "2025/2026" that real titles carry are not mistaken for
 * a code.
 */
export function courseCodeFromTitle(title: string | null | undefined): string | null {
  const text = String(title ?? "");
  const bracketed = text.match(/\(\s*([A-Za-z]{2,4}[\s-]?\d{2,4})\s*\)/);
  if (bracketed) return normaliseCode(bracketed[1]);

  const bare = text.match(/\b([A-Za-z]{2,4}[\s-]?\d{3,4})\b/);
  if (!bare) return null;
  const code = normaliseCode(bare[1]);
  return NOT_A_CODE.has(code.replace(/\d+$/, "")) ? null : code;
}

function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

/** The year an exam belongs to: the admin's own value, else the date it ran. */
export function examAcademicYear(exam: HistoryExam | null | undefined): string | null {
  return (
    normaliseAcademicYear(exam?.target_academic_year) ??
    academicYearFromDate(exam?.start_time) ??
    academicYearFromDate(exam?.created_at)
  );
}

function testLabelOf(exam: HistoryExam): string | null {
  return testLabel(exam);
}

/**
 * A title shortened for the card: the part before the first bracket or dash, so
 * "INTRODUCTION TO QUR'AN AND HADITH STUDIES (IS120) SEMINAR QUESTIONS - …"
 * becomes "Introduction to Qur'an and Hadith Studies".
 */
function shortTitle(title: string): string {
  const head = title
    .split(/[(\[]/)[0]
    .split(/\s[-–—]\s/)[0]
    .trim();
  const words = head.split(" ").slice(0, 4).join(" ");
  return words || title.slice(0, 24);
}

function titleOf(exam: HistoryExam): string {
  return shortTitle(
    String(exam.title ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * One frame per exam that was actually sat, busiest first.
 *
 * `counts` is keyed by exam id and holds submitted-only counts, so an exam that
 * was published but never finished contributes nothing. Ordering by count keeps
 * a barely-used exam from leading the rotation with "1" right after the total,
 * which reads as if the site had only one submission.
 */
export function buildExamHistory(
  exams: HistoryExam[],
  counts: Record<string, number>,
  limit = HISTORY_FRAME_LIMIT,
): ExamHistoryEntry[] {
  const entries = (exams ?? [])
    .map((exam) => {
      const count = Math.max(0, Math.floor(Number(counts[exam.id]) || 0));
      const courseCode = courseCodeFromTitle(exam.title);
      const studyYear = Number(exam.target_study_year);
      return {
        key: exam.id,
        count,
        academicYear: examAcademicYear(exam),
        studyYear: Number.isFinite(studyYear) && studyYear >= 1 ? studyYear : null,
        name: courseCode ?? testLabelOf(exam) ?? titleOf(exam),
      };
    })
    .filter((entry) => entry.count > 0);

  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const yearA = a.academicYear ?? "";
    const yearB = b.academicYear ?? "";
    if (yearA !== yearB) return yearB.localeCompare(yearA);
    return a.name.localeCompare(b.name);
  });

  return entries.slice(0, Math.max(0, limit));
}

/** The headline frame: every submission the per-exam frames add up to. */
export function historyTotal(entries: ExamHistoryEntry[]): number {
  return (entries ?? []).reduce((sum, entry) => sum + entry.count, 0);
}
