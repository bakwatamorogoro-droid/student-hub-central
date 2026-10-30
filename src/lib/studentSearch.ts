import { supabase } from "@/integrations/supabase/client";

/**
 * Flexible student lookup that supports:
 *  - exact Reg Namba (e.g. "MUM2025-04-14106")
 *  - partial Reg Namba (last digits)
 *  - first name / last name / any name token
 *
 * The imported cohort stores Reg Namba with trailing spaces ("MUM2025-04-14106 "),
 * so a plain `.ilike(reg_no, value)` never matches. The value is trimmed, matched
 * with `%...%`, and the trailing-space rows are filtered out afterwards.
 *
 * Returns all matches (up to 200). The caller decides whether to auto-confirm a
 * single match or show a picker so the student confirms it is them.
 */
export async function findStudentsByQuery(q: string): Promise<any[]> {
  const term = q.trim();
  if (!term) return [];
  const upper = term.toUpperCase();

  // PostgREST treats commas, parens and percent signs as filter syntax.
  const safe = upper.replace(/[%,()]/g, " ").trim();
  if (!safe) return [];

  const { data, error } = await supabase
    .from("students")
    .select("*")
    .or(`reg_no.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .order("full_name")
    .limit(200);
  if (error) return [];

  const rows = (data || []) as any[];
  // A trimmed exact match wins outright, so the student is not asked to pick
  // themselves out of a list when they typed their full Reg Namba.
  const exact = rows.filter((r: any) => String(r.reg_no ?? "").trim().toUpperCase() === upper);
  if (exact.length > 0) return exact;
  return rows;
}
