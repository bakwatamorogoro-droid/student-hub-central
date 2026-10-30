import { supabase } from "@/integrations/supabase/client";

export type AcademicFields = {
  course?: string | null;
  study_year?: number | string | null;
  semester?: string | null;
  academic_year?: string | null;
};

export type ProfileUpdatePayload = AcademicFields & {
  reg_no?: string;
  full_name?: string;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  semina?: string;
  student_group?: string;
};

/** PostgREST reports an unknown column as PGRST204 / "Could not find the ... column". */
export function isMissingColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST204" || /could not find the .* column/i.test(e.message || "");
}

function normalize(payload: ProfileUpdatePayload) {
  const out: Record<string, unknown> = {};
  if (payload.reg_no !== undefined) out.reg_no = payload.reg_no?.trim().toUpperCase() || null;
  if (payload.full_name !== undefined) out.full_name = payload.full_name?.trim() || null;
  if (payload.semina !== undefined) out.semina = payload.semina || null;
  if (payload.student_group !== undefined) out.student_group = payload.student_group || null;
  if (payload.phone !== undefined) out.phone = payload.phone || null;
  if (payload.age !== undefined) out.age = payload.age == null ? null : Number(payload.age);
  if (payload.gender !== undefined) out.gender = payload.gender || null;
  if (payload.course !== undefined) out.course = payload.course?.trim() || null;
  if (payload.study_year !== undefined) {
    out.study_year = payload.study_year == null || payload.study_year === ("" as unknown as number)
      ? null
      : Number(payload.study_year);
  }
  if (payload.semester !== undefined) out.semester = payload.semester || null;
  if (payload.academic_year !== undefined) out.academic_year = payload.academic_year || null;
  return out;
}

/**
 * Updates a student row directly.
 *
 * `semester` may not exist on the backend yet (it is added by
 * drizzle/migrations/0004_add_semester.sql). When PostgREST rejects the column
 * we retry without it so the remaining edits still save, and report it back so
 * the UI can tell the admin to run the migration.
 */
export async function updateStudentProfile(
  studentId: string,
  payload: ProfileUpdatePayload,
): Promise<{ error: Error | null; semesterUnsupported: boolean }> {
  const body = normalize(payload);
  const withSemester = "semester" in body;

  const first = await supabase.from("students").update(body as any).eq("id", studentId);
  if (!first.error) return { error: null, semesterUnsupported: false };

  if (withSemester && isMissingColumnError(first.error)) {
    const { semester: _drop, ...withoutSemester } = body;
    const retry = await supabase.from("students").update(withoutSemester as any).eq("id", studentId);
    if (!retry.error) return { error: null, semesterUnsupported: true };
    return { error: retry.error as unknown as Error, semesterUnsupported: true };
  }

  return { error: first.error as unknown as Error, semesterUnsupported: false };
}
