import { CURRENT_ACADEMIC_YEAR, admissionYearFromReg, studyYearFromReg } from "./studyYear.ts";
export const STUDY_YEARS = [1, 2, 3, 4] as const;

/**
 * Fixed group range: GROUP 1 … GROUP 11, 8 students each.
 *
 * The real shape lives in `groupAssignment.ts` (11 groups × 8 seats, separate
 * for men and women). This re-export keeps the older pickers in step with it
 * instead of letting them offer a GROUP 12 that can never be filled.
 */
export {
  GROUP_NAMES as GROUPS,
  GROUPS_PER_SEMINAR,
  GROUP_SIZE,
  SEMINARS,
} from "./groupAssignment.ts";

/**
 * Only SEMESTER 1 is active. SEMESTER 2 is still listed so the owner can see
 * it is coming, but no form lets anyone pick it until it is switched on.
 */
export const SEMESTER_1 = "SEMESTER 1";
export const SEMESTER_2 = "SEMESTER 2";
export const SEMESTERS = [SEMESTER_1, SEMESTER_2];
export const ACTIVE_SEMESTERS: string[] = [SEMESTER_1];

export const isSemesterActive = (value?: string | null): boolean =>
  !!value && ACTIVE_SEMESTERS.includes(value);

/** Fixed for the whole system, so no form ever asks the student for it. */
export { admissionYearFromReg, studyYearFromReg };
export { CURRENT_ACADEMIC_YEAR };

export type Semester = string;

/** Study years offered by a programme of `programYears` years (e.g. 2 → [1, 2]). */
export function studyYearsFor(programYears: number | string | null | undefined): number[] {
  const n = Number(programYears);
  if (!Number.isFinite(n) || n < 1) return [...STUDY_YEARS];
  return Array.from({ length: Math.min(Math.floor(n), 12) }, (_, i) => i + 1);
}

export const ACADEMIC_YEARS: string[] = [CURRENT_ACADEMIC_YEAR];

type AcademicProfile = {
  // `study_year` arrives as a number from Postgres but the student type used by
  // the pickers allows a string, so both are accepted and compared numerically.
  study_year?: number | string | null;
  academic_year?: string | null;
};

type AcademicTarget = {
  target_study_year?: number | null;
  target_academic_year?: string | null;
};

/**
 * Whether an exam or paper aimed at `target` should be shown to `student`.
 *
 * A field that is *missing* on the student's profile is not evidence of a
 * mismatch. 945 of 1623 students have no `study_year` and 1562 have no
 * `academic_year`, so requiring them to equal the target hid a published exam
 * from most of the cohort. Only a value that is present *and* different
 * excludes; an absent one defers to the admin, who is the only party that knows
 * who the work was written for.
 */
export function matchesAcademicTarget(target: AcademicTarget, student: AcademicProfile | null) {
  if (!target.target_study_year && !target.target_academic_year) return true;
  if (!student) return false;
  if (
    target.target_study_year &&
    student.study_year != null &&
    Number(target.target_study_year) !== Number(student.study_year)
  )
    return false;
  if (
    target.target_academic_year &&
    student.academic_year != null &&
    target.target_academic_year !== student.academic_year
  )
    return false;
  return true;
}

/** e.g. "Mwaka wa 2 · Semester ya Kwanza · 2026/2027" — omits whatever is missing. */
export function formatAcademicSummary(
  profile:
    | { study_year?: number | null; semester?: string | null; academic_year?: string | null }
    | null
    | undefined,
): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.study_year) parts.push(`Mwaka wa ${profile.study_year}`);
  if (profile.semester) parts.push(profile.semester);
  if (profile.academic_year) parts.push(profile.academic_year);
  return parts.join(" · ");
}
