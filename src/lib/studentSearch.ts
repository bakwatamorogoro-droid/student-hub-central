import { supabase } from "@/integrations/supabase/client";

/**
 * Flexible student lookup that supports:
 *  - exact Reg Namba (e.g. "MUM/2024/001")
 *  - partial Reg Namba (last digits)
 *  - first name / last name / any name token
 *
 * Returns all matches (up to 200). Caller decides whether to auto-confirm
 * a single match or show a picker so the student confirms it is them.
 */
export async function findStudentsByQuery(q: string) {
  const term = q.trim();
  if (!term) return [];
  const upper = term.toUpperCase();

  // 1) exact reg_no — fast path, ignores case
  const { data: exact } = await supabase
    .from("students")
    .select("*")
    .ilike("reg_no", upper)
    .maybeSingle();
  if (exact) return [exact];

  // sanitize for PostgREST `.or()` filter (commas/parens/percents are special)
  const safe = term.replace(/[%,()]/g, " ").trim();
  if (!safe) return [];

  // 2) flexible search: any part of reg_no OR full_name
  const { data, error } = await supabase
    .from("students")
    .select("*")
    .or(`reg_no.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .order("full_name")
    .limit(200);
  if (error) return [];
  return data || [];
}
