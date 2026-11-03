/**
 * Merging duplicate student rows.
 *
 * The roster holds the same person more than once: `MUM2025-04-15805`,
 * `MUM2025-04-15805 ` and `MUM2025 -04-15805` all name one student, and the
 * database's UNIQUE constraint compared the raw strings so every spelling got
 * in. `regNo.ts` stops new ones; this file plans the repair of the old ones.
 *
 * The repair is a merge, not a delete. Of the 185 duplicate groups in the live
 * data, 135 have real rows on more than one spelling — a submission here, an
 * attendance mark there — so deleting the extras would silently throw away a
 * student's exam. Instead one row is kept and everything the others hold is
 * moved onto it, then the now-empty rows are removed.
 *
 * This module is pure: it decides *what* to do, never does it. The Supabase
 * calls live in `dedupeStudentsApi.ts`. Keeping the decision here means the
 * rules can be tested without a database, which matters because the wrong plan
 * loses marks.
 */

export type StudentRow = {
  id: string;
  reg_no: string;
  full_name: string;
  created_at?: string | null;
  semina?: string | null;
  student_group?: string | null;
  gender?: string | null;
  phone?: string | null;
};

export type DedupeMember<T> = {
  row: T;
  /** True for the one row that stays. */
  keep: boolean;
  /**
   * Why this row was chosen to stay, in one short phrase, so the admin can see
   * the reasoning rather than trusting a black box.
   */
  reason: string;
};

export type DedupeGroup<T> = {
  canonical: string;
  members: DedupeMember<T>[];
  /** The row that stays. */
  keeper: T;
  /** The rows to remove once their data has moved. */
  removals: T[];
};

/**
 * Picks the row to keep inside one duplicate group.
 *
 * The earliest registration wins. It is the record the office created first, it
 * is the one a student's own history is most likely attached to, and it makes
 * the choice deterministic — the same group always resolves the same way, so a
 * second run is a no-op rather than a coin toss.
 *
 * A row missing the group or seminar it needs is passed over when a complete row
 * exists: keeping the incomplete one would leave the student unable to submit
 * group work.
 */
export function chooseKeeper<T extends StudentRow>(rows: T[]): { keeper: T; reason: string } {
  const complete = (r: T) =>
    String(r.semina ?? "").trim() !== "" && String(r.student_group ?? "").trim() !== "";
  const byDate = [...rows].sort((a, b) => {
    const ta = Date.parse(String(a.created_at ?? "")) || 0;
    const tb = Date.parse(String(b.created_at ?? "")) || 0;
    return ta - tb;
  });

  const completeFirst = byDate.find(complete);
  if (completeFirst && completeFirst !== byDate[0]) {
    return { keeper: completeFirst, reason: "usajili kamili wa kwanza" };
  }
  const chosen = completeFirst ?? byDate[0];
  return { keeper: chosen, reason: "usajili wa kwanza" };
}

/**
 * Every duplicate group in the roster, each with its keeper already chosen.
 *
 * `groups` comes from `groupByRegNo`, so the input order decides which row is
 * "first" when two rows share a timestamp.
 */
export function planDedupe<T extends StudentRow>(
  groups: { canonical: string; rows: T[] }[],
): DedupeGroup<T>[] {
  return groups.map((group) => {
    const { keeper, reason } = chooseKeeper(group.rows);
    return {
      canonical: group.canonical,
      keeper,
      removals: group.rows.filter((r) => r.id !== keeper.id),
      members: group.rows.map((row) => ({
        row,
        keep: row.id === keeper.id,
        reason: row.id === keeper.id ? reason : "itaunganishwa",
      })),
    };
  });
}

/** How many rows a plan would remove, for the confirmation sentence. */
export function dedupeTotals(groups: DedupeGroup<StudentRow>[]): {
  groups: number;
  removals: number;
} {
  return {
    groups: groups.length,
    removals: groups.reduce((n, g) => n + g.removals.length, 0),
  };
}

/** The tidy shape to write back onto the keeper, so the next scan finds nothing. */
export function normalisedKeeper<T extends StudentRow>(
  keeper: T,
  display: (raw: string) => string,
): T {
  return { ...keeper, reg_no: display(keeper.reg_no) };
}

/**
 * Rows in `table` that belong to a removed student and must be moved.
 *
 * Two dependents can collide when they are moved: `submissions` is unique per
 * (exam, student) and `attendance` per (student, day). A row that the keeper
 * already has for the same key cannot be moved, and it must not be dropped
 * either — the mark is real. So it is reported as a `collision` and the caller
 * decides: the keeper's own row wins, and the duplicate is removed, because two
 * submissions for one exam by one student is the duplicate the merge exists to
 * collapse.
 */
export type MovePlan<D> = {
  /** Rows to re-point at the keeper. */
  move: D[];
  /** Rows that collide with one the keeper already has, and so are dropped. */
  collisions: D[];
};

export function planMove<D>(
  dependents: D[],
  keyOf: (d: D) => string,
  keeperKeys: Set<string>,
): MovePlan<D> {
  const move: D[] = [];
  const collisions: D[] = [];
  for (const d of dependents) {
    if (keeperKeys.has(keyOf(d))) collisions.push(d);
    else move.push(d);
  }
  return { move, collisions };
}

/**
 * The values to write onto a dependent row so it points at the keeper and reads
 * as the keeper's.
 *
 * `denorm` names only the columns the table really has: `group_messages` has no
 * `reg_no`, and `profile_update_requests` calls its copies `current_reg_no`.
 * Writing a column a table lacks would fail the whole merge, so the caller
 * passes the table's own list.
 */
export function denormPayload(
  denorm: string[],
  keeper: StudentRow,
  display: (raw: string) => string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { student_id: keeper.id };
  for (const column of denorm) {
    if (column === "reg_no" || column === "current_reg_no")
      payload[column] = display(keeper.reg_no);
    else if (column === "full_name" || column === "current_full_name")
      payload[column] = keeper.full_name;
    else if (column === "semina") payload[column] = keeper.semina;
    else if (column === "student_group") payload[column] = keeper.student_group;
  }
  return payload;
}

/**
 * How much a dependent row is worth keeping, so a collision does not throw away
 * the better copy.
 *
 * Two rows for the same (exam, student) are not identical: one may be a blank
 * start, the other the finished answers. Of the 56 such collisions in the live
 * data, 55 have answers on both rows, and on some the *duplicate* carries the
 * higher mark. Dropping it on the grounds that "the keeper already has a row"
 * would silently lose a student's exam, so the row with the real work wins.
 *
 * The comparison is deliberately coarse: answered questions first, then the
 * score, then whether it was submitted at all. A blank row never beats a
 * finished one, whatever the numbers say.
 */
export function submissionQuality(row: Record<string, unknown>): number {
  const answers = row.answers;
  const answered = answers && typeof answers === "object" ? Object.keys(answers).length : 0;
  const score = Number(row.score ?? -1);
  const submitted = row.submitted_at ? 1 : 0;
  return answered * 1_000_000 + (Number.isFinite(score) ? score : -1) * 100 + submitted;
}

/** Attendance rows for one day are equivalent; one with GPS data is richer. */
export function attendanceQuality(row: Record<string, unknown>): number {
  return row.gps_lat != null && row.gps_lng != null ? 1 : 0;
}

/**
 * Which of the two colliding rows to keep, judged by `quality`.
 *
 * Returns the *row* rather than a flag, so the caller can copy its content onto
 * the keeper's own row and keep the keeper's identity.
 */
export function richerRow<D>(keeperRow: D, dupRow: D, quality: (row: D) => number): D {
  return quality(dupRow) > quality(keeperRow) ? dupRow : keeperRow;
}

/** A row's content columns, without the identity that must not be overwritten. */
export function contentColumns(
  row: Record<string, unknown>,
  drop: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!drop.includes(k)) out[k] = v;
  }
  return out;
}

/**
 * A one-line description of a duplicate group, for the admin list.
 *
 * It names the keeper by registration number and says how many rows fold into
 * it, so the admin can read the whole plan without opening anything.
 */
export function describeGroup(group: DedupeGroup<StudentRow>): string {
  const name = String(group.keeper.full_name ?? "").trim();
  return `${group.keeper.reg_no} — ${name || "bila jina"} (+${group.removals.length} ya kuunganishwa)`;
}
