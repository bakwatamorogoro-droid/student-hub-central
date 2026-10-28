import { supabase } from "@/integrations/supabase/client";

/**
 * The admin-managed `app_settings` lists can drift from what is actually stored
 * on the students table (for example the settings seed says "Semina 1..3" while
 * the imported cohort uses "SEMINA 1..14"). Merging both keeps every real value
 * selectable instead of silently dropping a student's current semina or group.
 */
export type Directory = {
  semina: string[];
  groups: string[];
  courses: string[];
};

const CASE_INSENSITIVE = new Intl.Collator(undefined, { sensitivity: "base" });

function merge(...lists: (string[] | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list || []) {
      const value = String(raw ?? "").trim();
      if (!value) continue;
      if (!seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const na = Number(a.replace(/\D+/g, ""));
    const nb = Number(b.replace(/\D+/g, ""));
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return CASE_INSENSITIVE.compare(a, b);
  });
}

async function distinct(column: "semina" | "student_group" | "course"): Promise<string[]> {
  const { data, error } = await supabase
    .from("students")
    .select(column)
    .not(column, "is", null)
    .limit(4000);
  if (error) return [];
  return (data as unknown as Record<string, string>[]).map((r) => r[column]);
}

export async function loadDirectory(
  settings: {
    semina_list?: string[] | null;
    group_list?: string[] | null;
    course_list?: string[] | null;
  } | null,
): Promise<Directory> {
  const [semina, groups, courses] = await Promise.all([
    distinct("semina"),
    distinct("student_group"),
    distinct("course"),
  ]);
  return {
    semina: merge(settings?.semina_list, semina),
    groups: merge(settings?.group_list, groups),
    courses: merge(settings?.course_list, courses),
  };
}
