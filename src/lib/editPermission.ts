/**
 * Who may edit, and where the admin's grant is kept.
 *
 * Two switches decide whether the Update Taarifa form works. `profile_edits_enabled` in
 * `app_settings` is the cohort-wide switch the admin flips during a correction week. The
 * grant is one student's name on the door, and it is spent by the save.
 *
 * The grant is a row in `profile_update_requests` with `status = "edit_granted"` rather
 * than a column on `students`. That table is already live and already writable from the
 * browser, so the feature works the moment it is deployed. A new column would have needed
 * DDL, and nothing in this environment can run DDL against the live project — the
 * migration that added one was in the repo but never applied, which is why the feature
 * did nothing. A grant row is deliberately a row like any other: it survives the admin
 * closing the tab, and the student's own page reads it without being told.
 *
 * The rule lives here rather than in the route so the combination can be tested without a
 * browser, and so the form and the database cannot drift apart on who is allowed to write.
 */

export type EditPermission = {
  /** The cohort-wide switch from `app_settings`. */
  globallyEnabled: boolean;
  /** When the admin opened this one student's form; null when no grant is outstanding. */
  unlockedAt?: string | null;
};

/** The `status` that marks a row as the admin's grant rather than a profile request. */
export const GRANT_STATUS = "edit_granted";

/** True when this student may write, from either switch. */
export function canEdit({ globallyEnabled, unlockedAt }: EditPermission): boolean {
  return !!globallyEnabled || !!unlockedAt;
}

/**
 * True when the admin has opened this one form.
 *
 * A grant also releases the seat in the database (`unlock_student_group`), but the row the
 * page already holds still carries the old stamp. The route reads this to force the seat
 * open, without which the student would be granted the form and then shown a locked seat —
 * the one thing the grant exists to undo. The same flag drives the banner, so the student
 * is never left guessing why the form suddenly works.
 */
export function hasGrant({ unlockedAt }: EditPermission): boolean {
  return !!unlockedAt;
}

/** A `profile_update_requests` row, narrowed to what a grant reads. */
export type GrantRow = {
  id?: string | null;
  student_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

/** True when this row is the admin's grant rather than a profile request. */
export function isGrantRow(row: GrantRow | null | undefined): boolean {
  return row?.status === GRANT_STATUS;
}

/**
 * The student's outstanding grant, or null.
 *
 * A student's request history and their grant share one table, so the status is what
 * separates them. The newest row wins, which also makes a stray duplicate harmless.
 */
export function grantFromRows(
  rows: GrantRow[] | null | undefined,
  studentId?: string | null,
): GrantRow | null {
  if (!rows?.length || !studentId) return null;
  const mine = rows.filter((r) => r?.student_id === studentId && isGrantRow(r));
  if (!mine.length) return null;
  return [...mine].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  )[0];
}

/**
 * When the admin opened this student's form, in the shape `canEdit` wants. Reads the grant
 * off the rows the page already fetched, so the form and the banner agree on one source.
 */
export function unlockedAtFromRows(
  rows: GrantRow[] | null | undefined,
  studentId?: string | null,
): string | null {
  return grantFromRows(rows, studentId)?.created_at ?? null;
}

/**
 * The request history a student should see: everything except the grant rows, which are
 * an admin instruction rather than a correction the student made.
 */
export function requestHistory<T extends GrantRow>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((r) => !isGrantRow(r));
}
