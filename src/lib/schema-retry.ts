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

/**
 * The column the database says it cannot find, or null if this is another error.
 *
 * Two shapes matter. A write names the column in a `PGRST204`
 * ("Could not find the 'course_list' column of 'app_settings'"). A **select** on an
 * unknown column comes back as Postgres `42703` instead, worded
 * "column students.group_confirmed_at does not exist" — no quotes, and the table
 * name glued to the front. Both are the same situation to a caller that can simply
 * ask for one column less, so both are recognised here.
 */
export function missingColumnFrom(error: unknown): string | null {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return null;
  const message = e.message || "";

  const isMissing =
    e.code === "PGRST204" ||
    e.code === "42703" ||
    /could not find the .* column/i.test(message) ||
    /column .* does not exist/i.test(message);
  if (!isMissing) return null;

  const quoted = /Could not find the '([^']+)' column/i.exec(message);
  if (quoted) return quoted[1];

  // "column students.group_confirmed_at does not exist" -> "group_confirmed_at".
  // The qualifier may be a table alias or a schema-qualified name, so take the last
  // dotted segment.
  const named = /column ["']?([\w.]+)["']? does not exist/i.exec(message);
  if (!named) return null;
  return named[1].split(".").pop() ?? null;
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

/**
 * The same rescue for a bulk write.
 *
 * PostgREST rejects the whole array when one column is unknown, and it names that
 * column once. So the column has to come out of **every** row, not just the one
 * that happened to be first — dropping it from a single row would leave the write
 * failing on the next row that still carries it.
 */
export async function retryRowsWithoutMissingColumns<T extends { error: unknown }>(
  rows: Record<string, unknown>[],
  attempt: (rows: Record<string, unknown>[]) => PromiseLike<T>,
  maxAttempts = 8,
): Promise<{ last: T; dropped: string[] }> {
  let working = rows.map((row) => ({ ...row }));
  const dropped: string[] = [];
  let last = await attempt(working);

  for (let i = 1; i < maxAttempts && last.error; i++) {
    const column = missingColumnFrom(last.error);
    // Not a missing-column error, or the column is already gone: retrying would
    // repeat the same request, so stop and hand the error back.
    if (!column || !working.some((row) => column in row)) break;
    working = working.map((row) => {
      const copy = { ...row };
      delete copy[column];
      return copy;
    });
    dropped.push(column);
    last = await attempt(working);
  }

  return { last, dropped };
}
