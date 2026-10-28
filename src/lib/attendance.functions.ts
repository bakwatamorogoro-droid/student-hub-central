import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side QR attendance. The browser never decides whether a check-in is
 * valid: it only collects a scanned token and the phone's GPS fix, and the
 * server recomputes the distance, the QR window and the session state.
 *
 * Run supabase/APPLY_ATTENDANCE_QR.sql before using this. Until it is applied the
 * functions return a `not_ready` reason so the UI can explain what is missing.
 */

const secretSchema = z.object({
  token: z.string().min(1).max(4000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(100000).optional(),
  /** Present when the student is signed in; the RPC reads auth.uid() from it. */
  accessToken: z.string().min(10).max(4000).optional(),
  /** Present when the student has no account; matches students.device_id. */
  deviceId: z.string().min(8).max(200).optional(),
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

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code || "";
  const msg = (error.message || "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

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

export const checkInWithQr = createServerFn({ method: "POST" })
  .validator((data: unknown) => secretSchema.parse(data))
  .handler(async ({ data }): Promise<AttendanceResult> => {
    const { createClient } = await import("@supabase/supabase-js");

    // The RPC is SECURITY DEFINER and granted to anon/authenticated, so it can
    // read tables the caller cannot. Call it with the public key: with a student
    // session attached it resolves the student from auth.uid(), and without one
    // it falls back to the device bound at registration. Either way the database
    // decides, so no service key is needed for a normal check-in.
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const publicKey =
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (url && publicKey) {
      const client = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(data.accessToken
          ? { global: { headers: { Authorization: `Bearer ${data.accessToken}` } } }
          : {}),
      });
      const { data: r, error } = await client.rpc("attendance_check_in_qr", {
        p_token: data.token,
        p_lat: data.lat,
        p_lng: data.lng,
        p_accuracy: data.accuracy ?? null,
        p_device_id: data.deviceId ?? null,
      });
      // A missing function means the SQL has not been applied yet; anything else
      // is a real answer the student should see.
      if (!error) return toResult(Array.isArray(r) ? r[0] : r);
      if (!isMissingFunction(error)) return { ok: false, reason: "not_ready" };
    }

    // Only reached when the SQL is absent. Kept so the reason is explicit.
    return { ok: false, reason: "not_ready" };
  });

const rotateSchema = z.object({ sessionId: z.string().uuid() });

export type RotateResult = { ok: true; token: string; expiresAt: string } | { ok: false };

/** Issues a fresh short-lived token for a session the teacher owns. */
export const rotateSessionToken = createServerFn({ method: "POST" })
  .validator((data: unknown) => rotateSchema.parse(data))
  .handler(async ({ data }): Promise<RotateResult> => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return { ok: false };

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: row, error } = await admin.rpc("attendance_rotate_token", {
      p_session_id: data.sessionId,
    });
    if (error) return { ok: false };
    const r = Array.isArray(row) ? row[0] : row;
    if (!r?.token) return { ok: false };
    return { ok: true, token: r.token, expiresAt: r.expires_at };
  });
