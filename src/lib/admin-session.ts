import { supabase } from "@/integrations/supabase/client";

/**
 * Admin sign-in.
 *
 * The password is verified by admin_login() and a session token is minted by
 * admin_login_token(), both SECURITY DEFINER, so the app never reads
 * app_settings.admin_password. The token is what proves an admin to the
 * database for privileged writes such as issuing a student PIN or rotating a
 * QR token.
 *
 * Run supabase/HARDEN_ADMIN_PASSWORD.sql and supabase/APPLY_STUDENT_PIN_AUTH.sql.
 */
const KEY = "admin_session_token";
const LEGACY_KEY = "admin_authed";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function isAdmin(): boolean {
  return getAdminToken() !== null;
}

export async function adminLogin(username: string, password: string): Promise<boolean> {
  // Mint a verifiable session token. This is the path the app uses once the
  // SQL files above have been applied.
  const token = await supabase.rpc("admin_login_token", {
    p_username: username,
    p_password: password,
  });
  if (!token.error) {
    const row = Array.isArray(token.data) ? token.data[0] : token.data;
    if (row?.ok && row.token) {
      window.localStorage.setItem(KEY, row.token);
      return true;
    }
    if (row && row.ok === false) return false;
  }

  // Fallback for a project that has admin_login() but not the token function
  // yet, so /admin keeps working between applying the two SQL files.
  const rpc = await supabase.rpc("admin_login", {
    p_username: username,
    p_password: password,
  });
  if (!rpc.error) {
    if (rpc.data === true) {
      window.localStorage.setItem(LEGACY_KEY, "1");
      return true;
    }
    return false;
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("admin_username, admin_password")
    .eq("id", 1)
    .single();
  if (error || !data) return false;
  if (data.admin_username === username && data.admin_password === password) {
    window.localStorage.setItem(LEGACY_KEY, "1");
    return true;
  }
  return false;
}

export function adminLogout() {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(LEGACY_KEY);
}
