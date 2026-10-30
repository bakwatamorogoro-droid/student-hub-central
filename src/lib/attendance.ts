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

export type OpenSession = {
  id: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
  hasJoinCode: boolean;
};

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

  const { data: r, error } = await supabase.rpc("attendance_check_in", {
    p_token: data.token,
    p_lat: data.lat,
    p_lng: data.lng,
    p_student_token: data.studentToken ?? null,
    p_join_code: null,
  });
  // A missing function means the SQL has not been applied yet.
  if (error) return { ok: false, reason: "not_ready" };
  return toResult(Array.isArray(r) ? r[0] : r);
}

const joinCodeSchema = z.string().trim().min(4).max(12);

/** Checks in with the code the teacher read out, for a student without a camera. */
export async function checkInWithCode(
  joinCode: string,
  studentToken: string,
): Promise<AttendanceResult> {
  const code = joinCodeSchema.safeParse(joinCode);
  const token = z.string().trim().min(32).max(200).safeParse(studentToken);
  if (!code.success || !token.success) return { ok: false, reason: "invalid_token" };

  const coords = await getPosition();
  if (!coords) return { ok: false, reason: "gps_required" };

  const { data: r, error } = await supabase.rpc("attendance_check_in", {
    p_token: null,
    p_lat: coords.lat,
    p_lng: coords.lng,
    p_student_token: token.data,
    p_join_code: code.data,
  });
  if (error) return { ok: false, reason: "not_ready" };
  return toResult(Array.isArray(r) ? r[0] : r);
}

/** The sessions a signed-in student may check in to right now. */
export async function listOpenSessions(studentToken: string): Promise<OpenSession[]> {
  const token = z.string().trim().min(32).max(200).safeParse(studentToken);
  if (!token.success) return [];

  const { data, error } = await supabase.rpc("attendance_open_sessions", { p_student_token: token.data });
  if (error) return [];
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    semina: (r.semina as string | null) ?? null,
    studentGroup: (r.student_group as string | null) ?? null,
    radiusM: Number(r.radius_m ?? 0),
    hasJoinCode: Boolean(r.has_join_code),
  }));
}

/** The phone's current position, or null when it is unavailable. */
export function getPosition(timeoutMs = 15000): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
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

export type PresentRow = {
  fullName: string;
  regNo: string;
  createdAt: string;
  distanceM: number | null;
  method: string | null;
};

/**
 * The present list for one session.
 *
 * Read through an RPC rather than a table select: HARDEN_RLS leaves `attendance`
 * with no policy, so a browser read returns no rows and the teacher's screen
 * would always look empty.
 */
export async function fetchSessionPresent(
  sessionId: string,
  adminToken: string,
): Promise<PresentRow[]> {
  const parsed = z
    .object({ sessionId: z.string().uuid(), adminToken: z.string().trim().min(32).max(200) })
    .safeParse({ sessionId, adminToken });
  if (!parsed.success) return [];

  const { data, error } = await supabase.rpc("attendance_session_present", {
    p_admin_token: parsed.data.adminToken,
    p_session_id: parsed.data.sessionId,
  });
  if (error) return [];
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((r: Record<string, unknown>) => ({
    fullName: String(r.full_name ?? ""),
    regNo: String(r.reg_no ?? ""),
    createdAt: String(r.created_at ?? ""),
    distanceM: r.distance_m == null ? null : Number(r.distance_m),
    method: (r.method as string | null) ?? null,
  }));
}

/**
 * Starts a session and returns it.
 *
 * A function, not a table insert: HARDEN_RLS leaves `attendance_sessions` with
 * no policy, so a browser insert is refused. The admin token is checked in SQL,
 * which also allocates a join code that is free.
 */
export async function startAttendanceSession(input: {
  adminToken: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  joinCode: string;
}): Promise<
  | { ok: true; id: string; joinCode: string; title: string; semina: string | null; studentGroup: string | null; radiusM: number }
  | { ok: false; message: string }
> {
  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Taarifa za kipindi hazijakamilika" };
  const d = parsed.data;

  const { data, error } = await supabase.rpc("attendance_start_session", {
    p_admin_token: d.adminToken,
    p_title: d.title,
    p_semina: d.semina,
    p_student_group: d.studentGroup,
    p_lat: d.lat,
    p_lng: d.lng,
    p_radius_m: d.radiusM,
    p_join_code: d.joinCode,
  });
  if (error) return { ok: false, message: error.message };

  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.id) return { ok: false, message: "Imeshindikana kuanzisha kipindi" };
  return {
    ok: true,
    id: String(r.id),
    joinCode: String(r.join_code ?? d.joinCode),
    title: String(r.title ?? d.title),
    semina: (r.semina as string | null) ?? null,
    studentGroup: (r.student_group as string | null) ?? null,
    radiusM: Number(r.radius_m ?? d.radiusM),
  };
}

/** Closes a session so no further check-ins are accepted. */
export async function endAttendanceSession(sessionId: string, adminToken: string): Promise<boolean> {
  const parsed = z
    .object({ sessionId: z.string().uuid(), adminToken: z.string().trim().min(32).max(200) })
    .safeParse({ sessionId, adminToken });
  if (!parsed.success) return false;

  const { error } = await supabase.rpc("attendance_end_session", {
    p_admin_token: parsed.data.adminToken,
    p_session_id: parsed.data.sessionId,
  });
  return !error;
}

const startSessionSchema = z.object({
  adminToken: z.string().trim().min(32).max(200),
  title: z.string().trim().min(1).max(120),
  semina: z.string().nullable(),
  studentGroup: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  radiusM: z.number().int().min(5).max(5000),
  joinCode: z.string().trim().min(4).max(12),
});

/** A short, unambiguous code the teacher can read out. */
export function makeJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
