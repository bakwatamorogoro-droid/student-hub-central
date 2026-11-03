/**
 * Who may edit, and whether their seat is open.
 *
 * Two switches decide whether the Update Taarifa form works. `profile_edits_enabled` in
 * `app_settings` is the cohort-wide switch the admin flips during a correction week. The
 * grant on the student's own row (`edit_unlocked_at`, set by `grant_student_edit`) is one
 * student's name on the door, and it is spent by the save.
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

/** True when this student may write, from either switch. */
export function canEdit({ globallyEnabled, unlockedAt }: EditPermission): boolean {
  return !!globallyEnabled || !!unlockedAt;
}

/**
 * True when the admin has opened this one form.
 *
 * `grant_student_edit` clears `group_confirmed_at` in the same call, but the row the page
 * already holds still carries the old stamp. The route reads this to force the seat open,
 * without which the student would be granted the form and then shown a locked seat — the
 * one thing the grant exists to undo. The same flag drives the banner, so the student is
 * never left guessing why the form suddenly works.
 */
export function hasGrant({ unlockedAt }: EditPermission): boolean {
  return !!unlockedAt;
}
