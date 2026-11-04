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
  /**
   * When the student last spent a grant. A used grant is not an open door: the student
   * has had their one correction and needs the admin to open the form again.
   */
  usedAt?: string | null;
};

/** The `status` that marks a row as the admin's grant rather than a profile request. */
export const GRANT_STATUS = "edit_granted";

/**
 * True when this student may write.
 *
 * A grant always opens the form. The cohort-wide switch opens it only for a student who
 * has not already spent an edit — one correction each, which is what the owner asked for
 * ("akiedit na akathibisha hawezi kuedit tena hadi afanyiwe edit tena"). Without the
 * `usedAt` half, turning the switch on for the whole cohort handed a second edit to every
 * student who had already used their first.
 */
export function canEdit({ globallyEnabled, unlockedAt, usedAt }: EditPermission): boolean {
  if (unlockedAt) return true;
  return !!globallyEnabled && !usedAt;
}

/**
 * True when the admin has opened this one form.
 *
 * The flag drives the banner, so the student is never left guessing why the form suddenly
 * works, and the route reads it to spend the grant after a save.
 */
export function hasGrant({ unlockedAt }: EditPermission): boolean {
  return !!unlockedAt;
}

/**
 * True when the student has already used their one correction and the admin has not
 * opened the form again. Drives the "you have already updated once" notice, so a closed
 * form is explained rather than looking broken.
 */
export function isEditSpent({ globallyEnabled, unlockedAt, usedAt }: EditPermission): boolean {
  return !unlockedAt && !!usedAt && !!globallyEnabled;
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

/**
 * When the admin opened this student's form, from whichever shape the grant is stored in.
 *
 * `20261104120000_student_edit_grant.sql` puts the grant on `students.edit_unlocked_at`,
 * and the row the page already loads carries it. Until that migration is applied the RPC
 * it adds answers PGRST202 and `grantStudentEdit` falls back to a `profile_update_requests`
 * row, which is read from the rows the page already fetches for the history. Preferring the
 * column and falling back to the rows means the same page works against either database,
 * and a database that has both cannot report a grant that is not there.
 */
export function unlockedAtFor(
  student: { edit_unlocked_at?: string | null; id?: string | null } | null | undefined,
  rows: GrantRow[] | null | undefined,
): string | null {
  return student?.edit_unlocked_at ?? unlockedAtFromRows(rows, student?.id);
}

/**
 * When the student last spent an edit, off the row the page already loads.
 *
 * Read straight from `students.edit_used_at` (added by
 * `20261104140000_student_edit_once.sql`). A database that has not run it simply reports
 * `undefined`, which reads as "never used an edit" — the behaviour before this rule
 * existed, so nothing locks out early on an old database.
 */
export function usedAtFor(
  student: { edit_used_at?: string | null } | null | undefined,
): string | null {
  return student?.edit_used_at ?? null;
}
