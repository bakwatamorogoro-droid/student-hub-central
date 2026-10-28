export const STUDY_YEARS = [1, 2, 3, 4] as const;

export const SEMESTERS = ["Semester ya Kwanza", "Semester ya Pili"] as const;

/** Fixed for the whole system, so no form ever asks the student for it. */
export const CURRENT_ACADEMIC_YEAR = "2026/2027";

export type Semester = (typeof SEMESTERS)[number];

/** Study years offered by a programme of `programYears` years (e.g. 2 → [1, 2]). */
export function studyYearsFor(programYears: number | string | null | undefined): number[] {
  const n = Number(programYears);
  if (!Number.isFinite(n) || n < 1) return [...STUDY_YEARS];
  return Array.from({ length: Math.min(Math.floor(n), 12) }, (_, i) => i + 1);
}

export const ACADEMIC_YEARS: string[] = [CURRENT_ACADEMIC_YEAR];

type AcademicProfile = {
  study_year?: number | null;
  academic_year?: string | null;
};

type AcademicTarget = {
  target_study_year?: number | null;
  target_academic_year?: string | null;
};

export function matchesAcademicTarget(target: AcademicTarget, student: AcademicProfile | null) {
  if (!target.target_study_year && !target.target_academic_year) return true;
  if (!student) return false;
  if (target.target_study_year && Number(target.target_study_year) !== Number(student.study_year))
    return false;
  if (target.target_academic_year && target.target_academic_year !== student.academic_year)
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
