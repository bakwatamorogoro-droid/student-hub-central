import { supabase } from "@/integrations/supabase/client";

/** Admin sign-in. See `adminLogin` for what this does and does not protect. */
const KEY = "admin_session_token";
const LEGACY_KEY = "admin_authed";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function isAdmin(): boolean {
  return getAdminToken() !== null;
}

/**
 * Checks the admin credentials and remembers that the screens are unlocked.
 *
 * The password is compared against app_settings, which is the only admin
 * credential the live database actually holds: admin_login() and
 * admin_login_token() come from SQL files that were never applied, so calling
 * them only ever returns an error.
 *
 * This gates the admin screens; it is not a security boundary. The publishable
 * key is public, so anyone holding it can read app_settings directly. Real
 * protection needs the RLS in supabase/HARDEN_RLS.sql, which cannot be applied
 * until the rest of the app stops reading these tables from the browser.
 */
export async function adminLogin(username: string, password: string): Promise<boolean> {
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
