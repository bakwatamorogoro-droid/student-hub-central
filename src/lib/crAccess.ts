/**
 * The CR's credentials, and the one check that accepts them.
 *
 * A CR is the class representative: not an admin, and not a student. Their single
 * job is to open the accounts of classmates who mistyped their details, so the
 * person can go back and fix them. They must not see marks, exams or settings, so
 * they get their own door rather than a key to `/admin`.
 *
 * The pair is fixed (`IS2026` / `CR2026`) and lives here rather than in
 * `app_settings`, because that row is the admin's and a second credential in it
 * would mean a second writer to the same single-row table. The check is pure and
 * import-free so `node --test` pins it — see `crAccess.test.ts`.
 *
 * What this does and does not protect: the publishable key ships in the bundle,
 * so these constants are readable by anyone who opens devtools, exactly like the
 * admin password. The gate keeps an honest visitor out of the wrong screen; it is
 * not a security boundary. Real protection is the RLS in `supabase/HARDEN_RLS.sql`,
 * which cannot be applied until the rest of the app stops reading these tables
 * from the browser.
 */

export const CR_USERNAME = "IS2026";
export const CR_PASSWORD = "CR2026";

/**
 * True when the pair is the CR's.
 *
 * The username is trimmed and compared case-insensitively: it is an identifier
 * people retype from a noticeboard and paste with stray spaces, and `is2026`
 * should not be a failed sign-in. The password is compared exactly — trimming or
 * folding it would quietly accept a near-miss on the one thing meant to be secret.
 */
export function crCredentialsMatch(username: string, password: string): boolean {
  return username.trim().toUpperCase() === CR_USERNAME && password === CR_PASSWORD;
}
