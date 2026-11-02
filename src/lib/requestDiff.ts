/**
 * Reading a profile update request as a before -> after diff.
 *
 * Kept apart from the admin page so it can be tested directly, and because the bug
 * it fixes was purely a matter of which fields are allowed to count as a change.
 *
 * The student form seeds its semina and group inputs from the student's row so the
 * card can display them. The old admin view rendered every non-null column of the
 * request, with no baseline, so that seed came back as a correction on every single
 * save — including the requests whose `changed_fields` was empty. A student who
 * changed nothing still looked, to the admin, as though they had asked to be moved.
 *
 * `changed_fields` is the student form's own list of what it altered, so it is the
 * only honest source for what a request is about.
 */

/** A `profile_update_requests` row. Only the columns this module reads are named. */
export type RequestRow = {
  changed_fields?: string[] | null;
  current_reg_no?: string | null;
  current_full_name?: string | null;
  current_course?: string | null;
  current_study_year?: number | string | null;
  current_semester?: string | null;
  current_semina?: string | null;
  current_student_group?: string | null;
  new_reg_no?: string | null;
  new_full_name?: string | null;
  new_course?: string | null;
  new_study_year?: number | string | null;
  new_semester?: string | null;
  new_semina?: string | null;
  new_student_group?: string | null;
  placed_semina?: string | null;
  placed_student_group?: string | null;
  [key: string]: unknown;
};

/** Human labels for the `changed_fields` keys written by the student form. */
export const FIELD_LABELS: Record<string, string> = {
  reg_no: "Reg Namba",
  full_name: "Jina",
  semina: "Semina",
  group: "Group",
  course: "Kozi",
  study_year: "Mwaka wa Masomo",
  semester: "Semester",
};

export type DiffPair = {
  key: string;
  label: string;
  from: string | number | null | undefined;
  to: string | number | null | undefined;
};

/**
 * The fields worth showing the admin: only those the student changed, each with the
 * value they held when the request was made.
 *
 * `from` comes from the `current_*` snapshot written alongside the request. Rows
 * created before those columns existed have no snapshot for the academic fields, so
 * the pair renders without a struck-through baseline rather than an invented one.
 */
export function diffRows(r: RequestRow): DiffPair[] {
  const changed = Array.isArray(r.changed_fields) ? r.changed_fields : [];
  const has = (k: string) => changed.includes(k);
  const pairs: DiffPair[] = [];
  if (has("reg_no"))
    pairs.push({ key: "reg_no", label: "Reg Namba", from: r.current_reg_no, to: r.new_reg_no });
  if (has("full_name"))
    pairs.push({ key: "full_name", label: "Jina", from: r.current_full_name, to: r.new_full_name });
  if (has("course"))
    pairs.push({ key: "course", label: "Kozi", from: r.current_course, to: r.new_course });
  if (has("study_year"))
    pairs.push({
      key: "study_year",
      label: "Mwaka",
      from: r.current_study_year,
      to: r.new_study_year,
    });
  if (has("semester"))
    pairs.push({
      key: "semester",
      label: "Semester",
      from: r.current_semester,
      to: r.new_semester,
    });
  // Semina and group are derived by the group system, never edited by the student.
  // They appear only when a request carries a genuine before/after.
  if (has("semina"))
    pairs.push({ key: "semina", label: "Semina", from: r.current_semina, to: r.new_semina });
  if (has("group"))
    pairs.push({
      key: "group",
      label: "Group",
      from: r.current_student_group,
      to: r.new_student_group,
    });
  return pairs.filter((p) => p.to != null && String(p.to) !== String(p.from ?? ""));
}

/** Where the group system placed the student, for the admin to read back. */
export function placementRows(r: RequestRow): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (r.placed_semina) out.push({ label: "Semina", value: String(r.placed_semina) });
  if (r.placed_student_group) out.push({ label: "Group", value: String(r.placed_student_group) });
  return out;
}
