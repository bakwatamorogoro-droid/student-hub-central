import { supabase } from "@/integrations/supabase/client";

const KEY = "admin_authed";

export function isAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export async function adminLogin(username: string, password: string): Promise<boolean> {
  // The password is checked by the admin_login() function so the app never needs
  // to read app_settings.admin_password, which is readable with the public key.
  // Run supabase/HARDEN_ADMIN_PASSWORD.sql to create it. Until then, fall back to
  // the old direct read so the admin page keeps working.
  const rpc = await supabase.rpc("admin_login", {
    p_username: username,
    p_password: password,
  });
  if (!rpc.error) {
    if (rpc.data === true) localStorage.setItem(KEY, "1");
    return rpc.data === true;
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("admin_username, admin_password")
    .eq("id", 1)
    .single();
  if (error || !data) return false;
  if (data.admin_username === username && data.admin_password === password) {
    localStorage.setItem(KEY, "1");
    return true;
  }
  return false;
}

export function adminLogout() {
  localStorage.removeItem(KEY);
}