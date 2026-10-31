import test from "node:test";
import assert from "node:assert/strict";
import { missingColumnFrom, retryWithoutMissingColumns } from "./schema-retry.ts";

const missing = (column: string) => ({
  code: "PGRST204",
  message: `Could not find the '${column}' column of 'app_settings' in the schema cache`,
});

test("reads the column name out of a PostgREST error", () => {
  assert.equal(missingColumnFrom(missing("course_list")), "course_list");
  assert.equal(missingColumnFrom(missing("current_semester")), "current_semester");
});

test("anything that is not a missing-column error yields null", () => {
  assert.equal(missingColumnFrom(null), null);
  assert.equal(missingColumnFrom(undefined), null);
  assert.equal(missingColumnFrom({ code: "23505", message: "duplicate key" }), null);
  assert.equal(missingColumnFrom({ message: "permission denied" }), null);
  // The right code but no column to parse: nothing to drop.
  assert.equal(missingColumnFrom({ code: "PGRST204", message: "schema cache miss" }), null);
});

test("a write that succeeds first time is not retried", async () => {
  const seen: string[][] = [];
  const { last, dropped } = await retryWithoutMissingColumns({ a: 1 }, async (body) => {
    seen.push(Object.keys(body));
    return { error: null };
  });
  assert.equal(last.error, null);
  assert.deepEqual(dropped, []);
  assert.deepEqual(seen, [["a"]]);
});

test("drops one column per attempt, as the database names them", async () => {
  // The bug this pins: five columns are absent from production and PostgREST
  // names one per response, so a single retry left the save broken.
  const payload = {
    semina_list: [1],
    course_list: [2],
    program_years: 2,
    current_academic_year: "2025/2026",
    current_semester: "Semester ya Kwanza",
    academic_years_list: [3],
  };
  const absent = [
    "course_list",
    "program_years",
    "current_academic_year",
    "current_semester",
    "academic_years_list",
  ];
  const attempts: Record<string, unknown>[] = [];

  const { last, dropped } = await retryWithoutMissingColumns(payload, async (body) => {
    attempts.push({ ...body });
    const stillThere = absent.find((c) => c in body);
    return { error: stillThere ? missing(stillThere) : null };
  });

  assert.equal(last.error, null, "the write should end up succeeding");
  assert.deepEqual(dropped, absent);
  // Every column the database does have must survive all five retries.
  assert.equal(attempts.at(-1)?.semina_list !== undefined, true);
  assert.equal("course_list" in (attempts.at(-1) ?? {}), false);
});

test("keeps only the last attempt's result", async () => {
  const { last } = await retryWithoutMissingColumns({ a: 1 }, async (body) => ({
    error: "a" in body ? missing("a") : null,
    data: "final",
  }));
  assert.equal(last.error, null);
  assert.equal((last as { data?: string }).data, "final");
});

test("a non-missing error is returned without retrying", async () => {
  let calls = 0;
  const denied = { code: "42501", message: "permission denied for table app_settings" };
  const { last, dropped } = await retryWithoutMissingColumns({ a: 1 }, async () => {
    calls++;
    return { error: denied };
  });
  assert.equal(calls, 1);
  assert.equal(last.error, denied);
  assert.deepEqual(dropped, []);
});

test("a column named twice does not loop forever", async () => {
  // A server that keeps naming a column already removed would otherwise spin.
  let calls = 0;
  const { last, dropped } = await retryWithoutMissingColumns({ a: 1 }, async () => {
    calls++;
    return { error: missing("a") };
  });
  assert.equal(calls, 2, "one original attempt plus one retry that drops 'a'");
  assert.deepEqual(dropped, ["a"]);
  assert.ok(last.error, "the error is handed back once retrying is pointless");
});

test("the attempt count is bounded", async () => {
  let calls = 0;
  const payload: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) payload["c" + i] = i;
  await retryWithoutMissingColumns(
    payload,
    async (body) => {
      calls++;
      const stillThere = Object.keys(body)[0];
      return { error: stillThere ? missing(stillThere) : null };
    },
    4,
  );
  assert.equal(calls, 4);
});
