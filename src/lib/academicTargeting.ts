export const STUDY_YEARS = [1, 2, 3, 4] as const;

const currentYear = new Date().getFullYear();

export const ACADEMIC_YEARS = Array.from({ length: 7 }, (_, index) => {
  const start = currentYear - 2 + index;
  return `${start}/${start + 1}`;
});

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
  if (target.target_study_year && Number(target.target_study_year) !== Number(student.study_year)) return false;
  if (target.target_academic_year && target.target_academic_year !== student.academic_year) return false;
  return true;
}