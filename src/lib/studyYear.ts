/**
 * The study year a Reg Namba implies.
 *
 * Import-free on purpose: `node --test` loads this directly, the same way it does
 * `groupAssignment.ts`. `academicTargeting.ts` re-exports it so callers keep importing
 * from one place, but the arithmetic lives here where it can be tested without a bundler.
 */

/** Fixed for the whole system, so no form ever asks the student for it. */
export const CURRENT_ACADEMIC_YEAR = "2026/2027";

/** The default programme length when `app_settings.program_years` is unset. */
export const DEFAULT_PROGRAM_YEARS = 2;

/**
 * The admission year a Reg Namba encodes.
 *
 * The cohort writes the intake year straight after the "MUM" prefix ("MUM2025-04-13774"
 * was admitted in 2025), so the study year is derivable rather than something to ask the
 * student for. The separators are inconsistent in the real data ("MUM 2025-04-15296",
 * "MUM2025_04_13564") and a handful of rows carry a typo in the prefix, so the match is on
 * the first four-digit calendar year anywhere in the string, not on a fixed position.
 */
export function admissionYearFromReg(regNo: string | null | undefined): number | null {
  const m = String(regNo ?? "").match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/**
 * The study year a Reg Namba implies for a given academic year — a 2025 intake is in year
 * 2 during 2026/2027.
 *
 * Clamped to the programme length so a legacy row admitted years ago reads as a final-year
 * student rather than year 12. Returns `null` when the Reg Namba carries no readable year,
 * which is the caller's cue to fall back to the stored value instead of writing a guess.
 */
export function studyYearFromReg(
  regNo: string | null | undefined,
  academicYear: string = CURRENT_ACADEMIC_YEAR,
  programYears: number | string | null | undefined = DEFAULT_PROGRAM_YEARS,
): number | null {
  const admission = admissionYearFromReg(regNo);
  const start = Number(String(academicYear ?? "").slice(0, 4));
  if (admission == null || !Number.isFinite(start)) return null;
  const year = start - admission + 1;
  if (year < 1) return null;
  const cap = Number(programYears);
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : DEFAULT_PROGRAM_YEARS;
  return Math.min(year, limit);
}
