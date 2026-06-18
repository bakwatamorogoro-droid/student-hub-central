import { supabase } from "@/integrations/supabase/client";

const KEY = "admin_authed";

export function isAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export async function adminLogin(username: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.from("app_settings").select("admin_username, admin_password").eq("id", 1).single();
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