/**
 * Saving when the database is a few migrations behind.
 *
 * Several columns the UI writes (`course_list`, `program_years`,
 * `current_academic_year`, `current_semester`, `academic_years_list`, `semester`)
 * are added by migrations that have not been applied to production. PostgREST
 * refuses the whole write when any one of them is unknown.
 *
 * The catch is that it names **one** column per response, not all of them:
 *
 *   {"code":"PGRST204",
 *    "message":"Could not find the 'course_list' column of 'app_settings' ..."}
 *
 * So a single retry that drops one column is not enough when two are missing —
 * the retry fails on the next name, and the caller gives up and reports an
 * error. That is what the admin saw when saving settings. Five columns are
 * missing there, so five attempts are needed.
 *
 * This drops whatever PostgREST names, one per attempt, until the write goes
 * through, and reports which columns were sacrificed so the caller can say so.
 * The alternative — guessing the missing set up front — breaks the moment a
 * different column is the one that is absent.
 */

/** The column PostgREST says it cannot find, or null if this is another error. */
export function missingColumnFrom(error: unknown): string | null {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return null;
  const isMissing = e.code === "PGRST204" || /could not find the .* column/i.test(e.message || "");
  if (!isMissing) return null;
  const match = /Could not find the '([^']+)' column/i.exec(e.message || "");
  return match ? match[1] : null;
}

/**
 * Runs `attempt`, and whenever the database rejects an unknown column, removes
 * that column and tries again. Resolves with the last attempt's result and the
 * names of the columns that were dropped.
 *
 * `maxAttempts` bounds the loop: a response that names a column already absent
 * from the payload would otherwise spin forever.
 */
export async function retryWithoutMissingColumns<T extends { error: unknown }>(
  payload: Record<string, unknown>,
  // `PromiseLike`, not `Promise`: the Supabase query builder is thenable but does
  // not implement the full Promise interface.
  attempt: (payload: Record<string, unknown>) => PromiseLike<T>,
  maxAttempts = 8,
): Promise<{ last: T; dropped: string[] }> {
  const working: Record<string, unknown> = { ...payload };
  const dropped: string[] = [];
  let last = await attempt(working);

  for (let i = 1; i < maxAttempts && last.error; i++) {
    const column = missingColumnFrom(last.error);
    // Not a missing-column error, or the column is already gone: retrying would
    // repeat the same request, so stop and hand the error back.
    if (!column || !(column in working)) break;
    delete working[column];
    dropped.push(column);
    last = await attempt(working);
  }

  return { last, dropped };
}
