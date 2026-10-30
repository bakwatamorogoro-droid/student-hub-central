import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Student sign-in without email.
 *
 * Supabase email auth is disabled on this project, so there is no
 * `auth.users` row to hang a student account on, and no service-role key is
 * configured. Sign-in therefore goes through the SQL functions in
 * `supabase/APPLY_STUDENT_PIN_AUTH.sql`, which are callable with the public
 * key and run as the table owner:
 *
 *   student_login(reg_no, pin)  -> a session token (only its hash is stored)
 *   student_me(token)           -> the student's own profile + attendance
 *   student_logout(token)       -> invalidate the session
 *
 * A PIN is issued by an admin, never chosen by the student, so knowing a
 * registration number is not enough to claim an account.
 */

const regNoSchema = z.string().trim().min(3).max(40);
const pinSchema = z.string().regex(/^[0-9]{4,10}$/);
const tokenSchema = z.string().trim().min(32).max(200);

export type LoginResult =
  | { ok: true; token: string; fullName: string }
  | { ok: false; reason: "bad_credentials" | "locked" | "not_ready"; lockedUntil?: string };

export type StudentProfile = {
  fullName: string;
  regNo: string;
  semina: string | null;
  studentGroup: string | null;
  course: string | null;
  studyYear: number | null;
  academicYear: string | null;
  attendance: Array<{
    id: string;
    check_in_date: string | null;
    created_at: string;
    semina: string | null;
    student_group: string | null;
    distance_m: number | null;
    status: string | null;
  }>;
};

/** Reads the public Supabase credentials that are available to the server. */
async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const loginStudent = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ regNo: regNoSchema, pin: pinSchema }).parse(data))
  .handler(async ({ data }): Promise<LoginResult> => {
    const supabase = await publicClient();
    if (!supabase) return { ok: false, reason: "not_ready" };

    const { data: row, error } = await supabase.rpc("student_login", {
      p_reg_no: data.regNo,
      p_pin: data.pin,
    });

    // A missing function means the SQL file has not been applied yet.
    if (error) return { ok: false, reason: "not_ready" };

    const r = Array.isArray(row) ? row[0] : row;
    if (!r?.ok) {
      if (r?.reason === "locked") {
        return { ok: false, reason: "locked", lockedUntil: r.expires_at ?? undefined };
      }
      return { ok: false, reason: "bad_credentials" };
    }

    return { ok: true, token: r.token, fullName: r.full_name };
  });

export const getMyProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: tokenSchema }).parse(data))
  .handler(async ({ data }): Promise<StudentProfile | null> => {
    const supabase = await publicClient();
    if (!supabase) return null;

    const { data: row, error } = await supabase.rpc("student_me", { p_token: data.token });
    if (error) return null;

    const r = Array.isArray(row) ? row[0] : row;
    if (!r?.ok) return null;

    return {
      fullName: r.full_name,
      regNo: r.reg_no,
      semina: r.semina,
      studentGroup: r.student_group,
      course: r.course,
      studyYear: r.study_year,
      academicYear: r.academic_year,
      attendance: Array.isArray(r.attendance) ? r.attendance : [],
    };
  });

export const logoutStudent = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: tokenSchema }).parse(data))
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    if (!supabase) return;
    await supabase.rpc("student_logout", { p_token: data.token });
  });
