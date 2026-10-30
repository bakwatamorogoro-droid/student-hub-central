import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

/**
 * QR attendance. The browser never decides whether a check-in is valid: it only
 * collects a scanned token and the phone's GPS fix, and the database recomputes
 * the distance, the QR window and the session state.
 *
 * These call the RPCs in `supabase/APPLY_STUDENT_PIN_AUTH.sql` straight from the
 * browser. They are SECURITY DEFINER and granted to `anon`, so no service key is
 * needed. Run that SQL before using this; until it is applied the calls fail and
 * the UI reports `not_ready`.
 */

const secretSchema = z.object({
  token: z.string().min(1).max(4000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /**
   * The sign-in token from student_login(). Required: the student's identity
   * must come from a session the server issued, never from anything the
   * browser can choose. `students.device_id` is world-readable, so it is not
   * an acceptable substitute.
   */
  studentToken: z.string().trim().min(32).max(200).optional(),
});

export type AttendanceFailure =
  | "not_ready"
  | "invalid_token"
  | "expired_token"
  | "session_closed"
  | "not_registered"
  | "outside_area"
  | "gps_required"
  | "already_marked";

export type AttendanceResult =
  | { ok: true; fullName: string; semina: string | null; distanceM: number; checkInAt: string }
  | { ok: false; reason: AttendanceFailure; distanceM?: number; radiusM?: number };

type CheckInRow = {
  ok: boolean;
  reason: string | null;
  full_name: string | null;
  semina: string | null;
  distance_m: number | null;
  radius_m: number | null;
  check_in_at: string | null;
};

function toResult(row: CheckInRow | null | undefined): AttendanceResult {
  if (!row) return { ok: false, reason: "not_ready" };
  if (row.ok) {
    return {
      ok: true,
      fullName: row.full_name ?? "",
      semina: row.semina ?? null,
      distanceM: Number(row.distance_m ?? 0),
      checkInAt: row.check_in_at ?? new Date().toISOString(),
    };
  }
  return {
    ok: false,
    reason: (row.reason || "invalid_token") as AttendanceFailure,
    distanceM: row.distance_m == null ? undefined : Number(row.distance_m),
    radiusM: row.radius_m == null ? undefined : Number(row.radius_m),
  };
}

export async function checkInWithQr(input: z.infer<typeof secretSchema>): Promise<AttendanceResult> {
  const parsed = secretSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_token" };
  const data = parsed.data;

  const { data: r, error } = await supabase.rpc("attendance_check_in_qr", {
    p_token: data.token,
    p_lat: data.lat,
    p_lng: data.lng,
    p_student_token: data.studentToken ?? null,
  });
  // A missing function means the SQL has not been applied yet.
  if (error) return { ok: false, reason: "not_ready" };
  return toResult(Array.isArray(r) ? r[0] : r);
}

const rotateSchema = z.object({
  sessionId: z.string().uuid(),
  adminToken: z.string().trim().min(32).max(200),
});

export type RotateResult = { ok: true; token: string; expiresAt: string } | { ok: false };

/** Issues a fresh short-lived token for a session the teacher owns. */
export async function rotateSessionToken(input: z.infer<typeof rotateSchema>): Promise<RotateResult> {
  const parsed = rotateSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  // Called with the publishable key plus the admin's session token; the database
  // checks the token, so nothing the browser sends is trusted for identity.
  const { data: row, error } = await supabase.rpc("attendance_rotate_token", {
    p_session_id: parsed.data.sessionId,
    p_admin_token: parsed.data.adminToken,
  });
  if (error) return { ok: false };
  const r = Array.isArray(row) ? row[0] : row;
  if (!r?.token || !r.expires_at) return { ok: false };
  return { ok: true, token: r.token, expiresAt: r.expires_at };
}
