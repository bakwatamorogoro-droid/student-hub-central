import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch ALL rows from `students` in pages of 1000 so we can support 20,000+ users.
 * Supabase's PostgREST caps a single .select() at 1000 rows by default.
 */
export async function fetchAllStudents<T = any>(
  columns: string = "*",
  opts?: { orderBy?: string; ascending?: boolean }
): Promise<T[]> {
  const pageSize = 1000;
  const order = opts?.orderBy ?? "full_name";
  const ascending = opts?.ascending ?? true;
  const all: T[] = [];
  let from = 0;
  // hard cap to avoid runaway loops; 100k should be plenty
  for (let i = 0; i < 100; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("students")
      .select(columns)
      .order(order, { ascending })
      .range(from, to);
    if (error) throw error;
    const rows = (data || []) as unknown as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
