/**
 * One registration number, one student.
 *
 * The roster was imported from a spreadsheet, and a spreadsheet let the same
 * number in more than one way: `MUM2025-04-15805`, `MUM2025-04-15805 ` (a
 * trailing space) and `MUM2025 -04-15805` (a space after the year) all name the
 * same person, and all three are in the table. The database's UNIQUE constraint
 * cannot see that: it compares the raw string, so each spelling slipped past it
 * as a different student. That is how 200 extra rows accumulated.
 *
 * The fix has two halves, and this file is the rule both halves share:
 *
 *   * `canonicalRegNo` strips everything that is not a letter or a digit, so
 *     the three spellings above collapse to one. Every comparison goes through
 *     it, so a new registration cannot create the duplicate the old ones did.
 *   * `displayRegNo` tidies a number for storing and showing, without changing
 *     which digits it holds.
 *
 * Nothing here is allowed to guess: a canonical match means the same digits in
 * the same order, never "close enough".
 */

/**
 * The comparison form: letters and digits only, upper-cased.
 *
 * `MUM2025 -04-15805` → `MUM20250415805`. Two numbers are the same student only
 * when this returns the same string.
 */
export function canonicalRegNo(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/**
 * The stored and printed form: trimmed, upper-cased, no stray spaces inside.
 *
 * The hyphens are kept because the cohort writes them, but a space inside the
 * number is a typo that has already cost us duplicates, so it is removed.
 * `MUM2025 -04-15805` → `MUM2025-04-15805`.
 */
export function displayRegNo(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** True when two spellings name the same student. */
export function sameRegNo(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalRegNo(a);
  return ca.length > 0 && ca === canonicalRegNo(b);
}

/**
 * A reg number that is too short to be one, or empty, is not a reg number.
 *
 * `canonicalRegNo("")` is `""`, and two empty numbers are not "the same
 * student" — they are two students whose numbers we do not know. Every caller
 * must refuse to merge on an empty canonical form.
 *
 * A real number is a year, a faculty and a serial, so it always carries digits:
 * requiring at least one is what keeps a stray word like `MUM` from being
 * treated as an identifier.
 */
export function isUsableRegNo(raw: string | null | undefined): boolean {
  const canon = canonicalRegNo(raw);
  return canon.length >= 5 && /\d/.test(canon);
}

export type RegNoGroup<T> = {
  /** The shared comparison form, e.g. `MUM20250415805`. */
  canonical: string;
  /** Every row that carries this number, in the order they were given. */
  rows: T[];
};

/**
 * Groups rows that share a registration number, keeping only the groups that
 * really are duplicates (two or more rows, and a number we can trust).
 *
 * The order of the input decides the order inside each group, so the caller can
 * hand the roster in `created_at` order and get the earliest first.
 */
export function groupByRegNo<T>(
  rows: T[],
  regOf: (row: T) => string | null | undefined,
): RegNoGroup<T>[] {
  const byCanon = new Map<string, T[]>();
  for (const row of rows) {
    const canon = canonicalRegNo(regOf(row));
    if (!isUsableRegNo(canon)) continue;
    const bucket = byCanon.get(canon) ?? [];
    bucket.push(row);
    byCanon.set(canon, bucket);
  }
  const out: RegNoGroup<T>[] = [];
  for (const [canonical, list] of byCanon) {
    if (list.length > 1) out.push({ canonical, rows: list });
  }
  return out;
}
