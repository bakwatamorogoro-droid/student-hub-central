import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import { displayRegNo, groupByRegNo } from "@/lib/regNo";
import {
  attendanceQuality,
  contentColumns,
  denormPayload,
  planDedupe,
  submissionQuality,
  type DedupeGroup,
  type StudentRow,
} from "@/lib/dedupeStudents";

/**
 * The database half of the duplicate-student cleanup.
 *
 * `dedupeStudents.ts` decides what to merge; this file carries it out. The two
 * are kept apart so the decision — which row survives, what happens to a
 * colliding mark — can be tested without a database.
 *
 * Two things shape the implementation:
 *
 *   * The merge is done row by row from the browser, because no new function
 *     can be created on the live project. That means it can stop halfway, so
 *     every step is safe to repeat: moving a dependent is an update that a
 *     second run re-does to the same value, and deleting a student that is
 *     already gone is treated as success.
 *   * Every dependent row is moved before its student is removed. Deleting
 *     first would cascade the very marks the merge exists to save.
 */

/**
 * The client, untyped for the dependent tables.
 *
 * The generated types cover the tables the app reads on every screen. A couple
 * of tables that hang off a student (`student_pins`, `student_sessions`) are not
 * in them, and the table name here is a variable rather than a literal, which
 * the typed client cannot express at all. The reads and writes below are all
 * keyed by `student_id`, so the shape is not in doubt; the cast is what lets one
 * loop serve every table instead of eight near-identical blocks.
 */
const db = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
    };
    delete: () => { eq: (column: string, value: string) => Promise<{ error: unknown }> };
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

/**
 * PostgREST's code for "this table is not in the schema cache".
 *
 * Only this one counts as "the table is not here". A missing *column* has its
 * own code and must not be swallowed: if `student_pins` were present but lacked
 * `student_id`, silently skipping it would leave a PIN pointing at a student
 * that is about to be deleted.
 */
function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

/**
 * The tables that hang off a student, and how to move a row onto the keeper.
 *
 * `denorm` lists the columns that repeat the student's name and number. Not
 * every table has them — `group_messages` has no `reg_no`, and
 * `profile_update_requests` calls its copies `current_reg_no` — so each table
 * names only the columns it really has. Writing a column a table lacks would
 * fail the whole merge.
 *
 * `key` names the pair that must be unique per student, so a row that would
 * collide with one the keeper already has is found before the move rather than
 * as a constraint error halfway through. `null` means the rows are independent
 * and always move.
 */
type TablePlan = {
  table: string;
  denorm: string[];
  key: ((row: Record<string, unknown>) => string) | null;
  /** True when the row itself is keyed by `student_id` and cannot be moved twice. */
  singleton?: boolean;
  /**
   * How much a colliding row is worth keeping. When the duplicate scores higher,
   * its content is copied onto the keeper's row before the duplicate is removed,
   * so the better answers survive. Omitted means "either copy is equivalent".
   */
  quality?: (row: Record<string, unknown>) => number;
  /**
   * Columns that must never be copied across on a collision: the row's own
   * identity and the student pointer, which belong to the keeper's row.
   */
  identity?: string[];
};

const TABLE_PLANS: TablePlan[] = [
  {
    table: "submissions",
    denorm: ["reg_no"],
    // UNIQUE(exam_id, student_id): two rows for one exam are the same mark.
    key: (r) => String(r.exam_id ?? ""),
    quality: submissionQuality,
    identity: ["id", "student_id", "exam_id"],
  },
  {
    table: "attendance",
    denorm: ["reg_no", "full_name", "semina", "student_group"],
    // UNIQUE(student_id, check_in_date): one check-in per day.
    key: (r) => String(r.check_in_date ?? ""),
    quality: attendanceQuality,
    identity: ["id", "student_id", "check_in_date"],
  },
  {
    table: "quiz_participants",
    denorm: ["reg_no", "full_name", "semina", "student_group"],
    key: (r) => String(r.exam_id ?? ""),
    identity: ["id", "student_id", "exam_id"],
  },
  {
    table: "pdf_submissions",
    denorm: ["reg_no", "full_name", "semina", "student_group"],
    key: null,
  },
  {
    table: "group_messages",
    denorm: ["full_name"],
    key: null,
  },
  {
    table: "profile_update_requests",
    denorm: ["current_reg_no", "current_full_name"],
    key: null,
  },
  {
    table: "student_pins",
    // A PIN is keyed by student_id, so a duplicate cannot be moved onto a
    // keeper that already has one; the keeper's own PIN wins.
    denorm: ["reg_no"],
    key: null,
    singleton: true,
  },
];

/** Re-point one table's rows from the duplicate student to the keeper. */
async function moveTable(
  plan: TablePlan,
  fromId: string,
  keeper: StudentRow,
): Promise<{ moved: number; collisions: number }> {
  const rows = await dependentsOf(plan.table, fromId);
  if (rows.length === 0) return { moved: 0, collisions: 0 };

  const keeperRows = await dependentsOf(plan.table, keeper.id);
  if (plan.singleton) {
    // A row keyed by `student_id` has no `id` of its own, so it is handled here
    // rather than in the loop below. One per student: the keeper's own wins, and
    // a duplicate's copy is removed only when the keeper already has one.
    if (keeperRows.length > 0) {
      const { error } = await db.from(plan.table).delete().eq("student_id", fromId);
      if (error) throw error as Error;
      return { moved: 0, collisions: rows.length };
    }
    const payload = denormPayload(plan.denorm, keeper, displayRegNo);
    delete payload.student_id;
    const { error } = await db.from(plan.table).update(payload).eq("student_id", fromId);
    if (error) throw error as Error;
    return { moved: rows.length, collisions: 0 };
  }

  const keeperKeys = new Map<string, Record<string, unknown>>();
  if (plan.key) {
    for (const r of keeperRows as Record<string, unknown>[]) keeperKeys.set(plan.key(r), r);
  }

  let moved = 0;
  let collisions = 0;
  for (const row of rows as Record<string, unknown>[]) {
    const id = String(row.id);
    const key = plan.key ? plan.key(row) : null;
    const keeperRow = key ? keeperKeys.get(key) : undefined;
    if (keeperRow) {
      // The keeper already has a row for this key. Two rows for one exam are the
      // duplicate the merge exists to collapse — but they are not identical, and
      // on some the duplicate carries the higher mark. Keep the richer content on
      // the keeper's own row, then drop the duplicate copy.
      if (plan.quality && plan.quality(row) > plan.quality(keeperRow)) {
        const content = contentColumns(row, plan.identity ?? ["id", "student_id"]);
        const { error } = await db.from(plan.table).update(content).eq("id", String(keeperRow.id));
        if (error) throw error as Error;
        keeperKeys.set(key!, { ...keeperRow, ...content });
      }
      const { error } = await db.from(plan.table).delete().eq("id", id);
      if (error) throw error as Error;
      collisions += 1;
      continue;
    }
    const { error } = await db
      .from(plan.table)
      .update(denormPayload(plan.denorm, keeper, displayRegNo))
      .eq("id", id);
    if (error) throw error as Error;
    if (key) keeperKeys.set(key, row);
    moved += 1;
  }
  return { moved, collisions };
}

export type MergeReport = {
  canonical: string;
  keeperId: string;
  keeperRegNo: string;
  /** Dependents re-pointed at the keeper. */
  moved: number;
  /** Dependents dropped because the keeper already had that row. */
  collisions: number;
  /** True when the duplicate rows were removed. */
  removed: boolean;
  error?: string;
};

/** Every student row, oldest first, so `planDedupe` sees the earliest first. */
export async function loadStudentRows(): Promise<StudentRow[]> {
  return fetchAllStudents<StudentRow>(
    "id, reg_no, full_name, semina, student_group, gender, created_at",
    {
      orderBy: "created_at",
      ascending: true,
    },
  );
}

/** The duplicate groups in the live roster, with a keeper chosen for each. */
export async function scanDuplicates(): Promise<DedupeGroup<StudentRow>[]> {
  const rows = await loadStudentRows();
  return planDedupe(groupByRegNo(rows, (r) => r.reg_no));
}

/** Every dependent row of one student, or an empty list when there are none. */
async function dependentsOf<T = Record<string, unknown>>(
  table: string,
  studentId: string,
): Promise<T[]> {
  const { data, error } = await db.from(table).select("*").eq("student_id", studentId);
  // A table that is not in this database has no rows to move, which is not a
  // failure: the merge should carry on with the tables that are there.
  if (error) {
    if (isMissingTable(error)) return [];
    throw error as Error;
  }
  return (data as T[]) ?? [];
}

/**
 * Merge one duplicate group into its keeper.
 *
 * Order matters, and the tidy step comes last for a reason. `students.reg_no`
 * is UNIQUE, and in 89 of the 185 live groups the keeper's tidy spelling is
 * already held by one of the rows being removed — the trailing-space copy, or
 * the one with a stray space after the year. Writing the tidy spelling while
 * those rows still exist would trip the constraint. So the order is:
 *
 *   1. move every dependent row onto the keeper,
 *   2. delete the now-empty duplicate rows, freeing their spellings,
 *   3. write the tidy spelling and profile onto the keeper.
 *
 * A failure at any point leaves the data consistent: nothing is deleted while
 * rows still point at it, and if step 3 fails the keeper simply keeps the
 * spelling it already had.
 */
export async function mergeGroup(group: DedupeGroup<StudentRow>): Promise<MergeReport> {
  const report: MergeReport = {
    canonical: group.canonical,
    keeperId: group.keeper.id,
    keeperRegNo: displayRegNo(group.keeper.reg_no),
    moved: 0,
    collisions: 0,
    removed: false,
  };

  try {
    for (const dup of group.removals) {
      for (const plan of TABLE_PLANS) {
        const { moved, collisions } = await moveTable(plan, dup.id, group.keeper);
        report.moved += moved;
        report.collisions += collisions;
      }
    }

    for (const dup of group.removals) {
      const { error } = await supabase.from("students").delete().eq("id", dup.id);
      // A row already removed by an earlier run is not a failure.
      if (error && (error as { code?: string }).code !== "PGRST116") {
        throw error as unknown as Error;
      }
    }

    // Write the tidy spelling and the complete profile onto the keeper. This is
    // the step that makes a second scan find nothing. A column the keeper does
    // not have is left alone rather than blanked.
    const { error: tidyError } = await supabase
      .from("students")
      .update({
        reg_no: report.keeperRegNo,
        semina: group.keeper.semina ?? undefined,
        student_group: group.keeper.student_group ?? undefined,
        gender: group.keeper.gender,
      })
      .eq("id", group.keeper.id);
    if (tidyError) throw tidyError as unknown as Error;

    report.removed = true;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}

/** Merge every group, reporting each, so one bad group cannot stop the rest. */
export async function mergeAll(
  groups: DedupeGroup<StudentRow>[],
  onProgress?: (done: number, total: number, report: MergeReport) => void,
): Promise<MergeReport[]> {
  const reports: MergeReport[] = [];
  let done = 0;
  for (const group of groups) {
    const report = await mergeGroup(group);
    reports.push(report);
    done += 1;
    onProgress?.(done, groups.length, report);
  }
  return reports;
}
