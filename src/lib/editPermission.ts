/**
 * Who may edit.
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
 * The flag drives the banner, so the student is never left guessing why the form suddenly
 * works, and the route reads it to spend the grant after a save.
 */
export function hasGrant({ unlockedAt }: EditPermission): boolean {
  return !!unlockedAt;
}
