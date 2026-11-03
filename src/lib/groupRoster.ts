import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import { retryWithoutMissingColumns, missingColumnFrom } from "@/lib/schema-retry";
import {
  GROUP_SIZE,
  buildSeminarReports,
  findMyGroup,
  normalizeGender,
  normalizeGroupName,
  normalizeSeminar,
  planAssignments,
  planMoves,
  searchMembers,
  type GroupMember,
  type MyGroup,
  type RosterEntry,
  type SeminarReport,
} from "@/lib/groupAssignment";

export type { MyGroup, SeminarReport };

/** The columns the group logic reads. */
export const ROSTER_COLUMNS =
  "id, reg_no, full_name, semina, gender, student_group, phone, group_confirmed_at";

/**
 * The roster columns, newest first. `group_confirmed_at` arrives with the confirmation
 * migration, so a database that has not run it yet rejects the whole select with a
 * missing-column error. Dropping the unknown names and retrying keeps every other page
 * working until the migration is applied.
 */
const ROSTER_FALLBACKS = [
  ROSTER_COLUMNS,
  "id, reg_no, full_name, semina, gender, student_group, phone",
  "id, reg_no, full_name, semina, gender, student_group",
];

export async function loadRoster(): Promise<RosterEntry[]> {
  let lastError: unknown = null;
  for (const columns of ROSTER_FALLBACKS) {
    try {
      return await fetchAllStudents<RosterEntry>(columns, { orderBy: "reg_no" });
    } catch (e) {
      lastError = e;
      if (!missingColumnFrom(e)) throw e;
    }
  }
  throw lastError;
}

export type AssignOutcome = {
  /** Rows actually written. */
  updated: number;
  /** Seminar and/or group, for the student who just saved. */
  me: { semina?: string; student_group?: string };
  unknownGender: string[];
  unassigned: string[];
  /** PostgREST could not find a column, so the caller should tell the admin. */
  dropped: string[];
};

/**
 * Writes one UPDATE per distinct target instead of one per student. Everyone
 * headed for `SEMINA 3 / GROUP 2` travels in a single `.in(ids)` call, which
 * turns ~1500 sequential requests into at most 16 seminars x 2 genders x 11
 * groups. A student saving their profile waits for this, so the difference is
 * the difference between a second and a stall.
 */
async function writeByTarget(
  wanted: Map<string, { semina: string; student_group: string }>,
): Promise<{ updated: number; dropped: string[] }> {
  const byTarget = new Map<string, { values: Record<string, unknown>; ids: string[] }>();
  for (const [id, values] of wanted) {
    const key = `${values.semina}||${values.student_group}`;
    const bucket = byTarget.get(key) ?? { values: { ...values }, ids: [] };
    bucket.ids.push(id);
    byTarget.set(key, bucket);
  }

  const dropped = new Set<string>();
  let updated = 0;
  for (const { values, ids } of byTarget.values()) {
    const { last, dropped: d } = await retryWithoutMissingColumns(values, (working) =>
      supabase
        .from("students")
        .update(working as any)
        .in("id", ids),
    );
    for (const col of d) dropped.add(col);
    if (!last.error) updated += ids.length;
  }
  return { updated, dropped: [...dropped] };
}

/**
 * Picks out the rows whose stored seminar/group differs from the plan, skipping any
 * confirmed seat. The rule itself lives in `planMoves` so it can be tested directly.
 */
function changedRows(
  roster: RosterEntry[],
  plan: ReturnType<typeof planAssignments>,
  onlySemina?: string,
): Map<string, { semina: string; student_group: string }> {
  return planMoves(roster, plan, onlySemina);
}

/**
 * Puts one student into their seminar and gender-pure group, and writes the
 * result. The plan covers the whole roster rather than the single row, because
 * the "keep the group you already sit in, otherwise take the next free seat"
 * rule is only correct if every classmate's current seat is visible at once.
 */
export async function assignStudentGroup(studentId: string): Promise<AssignOutcome> {
  const roster = await loadRoster();
  const plan = planAssignments(roster);
  const wanted = changedRows(roster, plan);
  const { updated, dropped } = await writeByTarget(wanted);

  return {
    updated,
    me: wanted.get(studentId) ?? {},
    unknownGender: plan.unknownGender,
    unassigned: plan.unassigned,
    dropped,
  };
}

/** Re-places a whole seminar's gender side, used after a manual member move. */
export async function reassignSeminar(semina: string): Promise<AssignOutcome> {
  const roster = await loadRoster();
  const plan = planAssignments(roster);
  const target = normalizeSeminar(semina) ?? "";
  const { updated, dropped } = await writeByTarget(changedRows(roster, plan, target));

  return {
    updated,
    me: {},
    unknownGender: plan.unknownGender,
    unassigned: plan.unassigned,
    dropped,
  };
}

export async function loadSeminarReports(): Promise<SeminarReport[]> {
  return buildSeminarReports(await loadRoster());
}

export async function loadMyGroup(regNo: string): Promise<MyGroup | null> {
  return findMyGroup(await loadRoster(), regNo);
}

export async function findGroupCandidates(query: string): Promise<RosterEntry[]> {
  return searchMembers(await loadRoster(), query);
}

/**
 * A student who left or finished, removed from the group they were holding a
 * seat in. Their row stays in `students`; only the group seat is given up.
 */
export async function removeMemberFromGroup(studentId: string): Promise<Error | null> {
  const { error } = await supabase
    .from("students")
    .update({ student_group: null } as any)
    .eq("id", studentId);
  return (error as unknown as Error) ?? null;
}

/**
 * Writes one student's seminar and group straight to their row.
 *
 * There is no window and no lock: the student owns their seat, so a later change always
 * takes effect. The older `confirm_student_group` RPC refused a second move, which left
 * a student who had already saved stuck in the wrong group with no way out short of an
 * admin. The `group_confirmed_at` stamp is still set on the first write, because the
 * planner reads it to leave a student where they put themselves.
 */
export async function saveStudentSeat(
  studentId: string,
  semina: string | null,
  group: string | null,
): Promise<Error | null> {
  const { error } = await supabase
    .from("students")
    .update({
      semina: semina || null,
      student_group: group || null,
      group_confirmed_at: new Date().toISOString(),
    } as any)
    .eq("id", studentId);
  return (error as unknown as Error) ?? null;
}

/** Releases a confirmed seat so the student can pick again. The admin page calls this. */
export async function unlockStudentGroup(studentId: string): Promise<Error | null> {
  const { error } = await (supabase as any).rpc("unlock_student_group", {
    p_student_id: studentId,
  });
  return (error as unknown as Error) ?? null;
}

/**
 * Opens one student's Update Taarifa form, even while the global switch is off, and
 * releases their seat so a wrong seminar or group can be fixed. The admin panel calls
 * this. A database without the migration answers PGRST202, so the caller can say which
 * migration to run rather than showing a raw PostgREST error.
 */
export async function grantStudentEdit(
  studentId: string,
): Promise<{ error: Error | null; needsMigration: boolean }> {
  const { error } = await (supabase as any).rpc("grant_student_edit", {
    p_student_id: studentId,
  });
  return { error: (error as unknown as Error) ?? null, needsMigration: isMissingRpc(error) };
}

/** Takes a grant back, leaving everything the student already saved alone. */
export async function revokeStudentEdit(
  studentId: string,
): Promise<{ error: Error | null; needsMigration: boolean }> {
  const { error } = await (supabase as any).rpc("revoke_student_edit", {
    p_student_id: studentId,
  });
  return { error: (error as unknown as Error) ?? null, needsMigration: isMissingRpc(error) };
}

/** Spends the grant after a save lands, so one grant buys one correction. */
export async function consumeStudentEdit(studentId: string): Promise<Error | null> {
  const { error } = await (supabase as any).rpc("consume_student_edit", {
    p_student_id: studentId,
  });
  return (error as unknown as Error) ?? null;
}

/** PostgREST reports a missing function as PGRST202 rather than a missing column. */
function isMissingRpc(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message || "")
  );
}

export type GroupReportPayload = {
  semina: string;
  gender: string;
  student_group: string;
  missing: GroupMember[];
  note?: string | null;
  reportedBy?: string | null;
};

/**
 * The CR's report for one group. `missing` is stored so the owner can see who
 * the CR said was away, not just the count.
 */
export async function saveGroupReport(
  payload: GroupReportPayload,
): Promise<{ error: Error | null; dropped: string[] }> {
  const body: Record<string, unknown> = {
    semina: payload.semina,
    gender: payload.gender,
    student_group: payload.student_group,
    missing: payload.missing,
    note: payload.note ?? null,
    reported_by: payload.reportedBy ?? null,
    created_at: new Date().toISOString(),
  };
  const { last, dropped } = await retryWithoutMissingColumns(body, async (working) => {
    const r = await (supabase as any).from("group_reports").insert(working);
    return r as { error: { message?: string } | null; data: unknown };
  });
  return { error: last.error ? (last.error as unknown as Error) : null, dropped };
}

export type GroupReport = {
  id: string;
  semina: string;
  gender: string;
  student_group: string;
  missing: GroupMember[];
  note: string | null;
  reported_by: string | null;
  created_at: string;
};

export async function loadGroupReports(): Promise<GroupReport[]> {
  const { data, error } = await (supabase as any)
    .from("group_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data || []) as GroupReport[];
}

export { GROUP_SIZE, normalizeGender, normalizeGroupName, normalizeSeminar };
