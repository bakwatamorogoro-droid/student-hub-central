import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Student accounts. A student signs in with the registration number the
 * institution gave them; the server checks that number against the authorised
 * `students` table before any account is created, so unknown or duplicate
 * registrations are refused.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and supabase/APPLY_ATTENDANCE_QR.sql.
 */

/** Registration numbers are used as the login identity, so keep them tidy. */
export function regNoToEmail(regNo: string): string {
  return `${regNo.trim().toLowerCase().replace(/[^a-z0-9]/g, ".")}@students.local`;
}

const registerSchema = z.object({
  regNo: z.string().min(3).max(40),
  password: z.string().min(6).max(72),
});

export type RegisterResult =
  | { ok: true; fullName: string }
  | { ok: false; reason: "not_ready" | "not_registered" | "already_registered" | "weak_password" };

export const registerStudentAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => registerSchema.parse(data))
  .handler(async ({ data }): Promise<RegisterResult> => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return { ok: false, reason: "not_ready" };

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. The registration number must exist in the authorised student list.
    const { data: student, error: findError } = await admin
      .from("students")
      .select("id, full_name, auth_user_id")
      .ilike("reg_no", data.regNo.trim())
      .maybeSingle();

    if (findError) return { ok: false, reason: "not_ready" };
    if (!student) return { ok: false, reason: "not_registered" };
    if (student.auth_user_id) return { ok: false, reason: "already_registered" };

    // 2. Create the account. Supabase hashes the password; it is never stored raw.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: regNoToEmail(data.regNo),
      password: data.password,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      const msg = (createError?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("exists")) {
        return { ok: false, reason: "already_registered" };
      }
      if (msg.includes("password")) return { ok: false, reason: "weak_password" };
      return { ok: false, reason: "not_ready" };
    }

    // 3. Bind the account to the student row and mark it approved.
    const { data: link, error: linkError } = await admin.rpc("student_link_account", {
      p_reg_no: data.regNo.trim(),
      p_user_id: created.user.id,
    });
    if (linkError) return { ok: false, reason: "not_ready" };

    const row = Array.isArray(link) ? link[0] : link;
    if (!row?.ok) {
      // Roll the account back so a failed link does not leave a half-made user.
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, reason: (row?.reason || "not_registered") as RegisterResult extends { reason: infer R } ? R : never };
    }

    return { ok: true, fullName: row.full_name || student.full_name };
  });

const profileSchema = z.object({ accessToken: z.string().min(10).max(4000) });

/** The signed-in student's own profile, class and attendance history. */
export const getMyStudentProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => profileSchema.parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The token is verified by Supabase, so a forged one cannot read a profile.
    const { data: userData, error: userError } = await admin.auth.getUser(data.accessToken);
    if (userError || !userData?.user) return null;

    const { data: student } = await admin
      .from("students")
      .select("id, full_name, reg_no, semina, student_group, course, study_year, semester, academic_year")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (!student) return null;

    const { data: history } = await admin
      .from("attendance")
      .select("id, check_in_date, created_at, semina, student_group, distance_m, method")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { student, history: history || [] };
  });
