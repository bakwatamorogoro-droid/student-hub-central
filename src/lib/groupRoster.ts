import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import { retryWithoutMissingColumns } from "@/lib/schema-retry";
import {
  GROUP_SIZE,
  buildSeminarReports,
  findMyGroup,
  normalizeGender,
  normalizeGroupName,
  normalizeSeminar,
  planAssignments,
  searchMembers,
  type GroupMember,
  type MyGroup,
  type RosterEntry,
  type SeminarReport,
} from "@/lib/groupAssignment";

export type { MyGroup, SeminarReport };

/** The columns the group logic reads. */
export const ROSTER_COLUMNS = "id, reg_no, full_name, semina, gender, student_group";

export async function loadRoster(): Promise<RosterEntry[]> {
  return fetchAllStudents<RosterEntry>(ROSTER_COLUMNS, { orderBy: "reg_no" });
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
 * Puts one student into their seminar and gender-pure group, and writes the
 * result. Runs over the whole roster rather than the single row, because the
 * "keep the group you already sit in, otherwise take the next free seat" rule
 * is only correct if every classmate's current seat is visible at once.
 *
 * Only rows whose value actually changes are written, so a student updating
 * their phone number does not stamp 1500 rows.
 */
export async function assignStudentGroup(studentId: string): Promise<AssignOutcome> {
  const roster = await loadRoster();
  const plan = planAssignments(roster);
  const me = roster.find((s) => s.id === studentId);

  const wanted = new Map<string, { semina: string; student_group: string }>();
  for (const s of roster) {
    const semina = plan.seminars[s.id] ?? normalizeSeminar(s.semina);
    const group = plan.groups[s.id];
    if (!semina || !group) continue;
    const currentSemina = normalizeSeminar(s.semina);
    const currentGroup = normalizeGroupName(s.student_group);
    if (currentSemina === semina && currentGroup === group) continue;
    wanted.set(s.id, { semina, student_group: group });
  }

  const dropped = new Set<string>();
  let updated = 0;

  for (const [id, values] of wanted) {
    const { last, dropped: d } = await retryWithoutMissingColumns(
      values as unknown as Record<string, unknown>,
      (working) =>
        supabase
          .from("students")
          .update(working as any)
          .eq("id", id),
    );
    for (const col of d) dropped.add(col);
    if (!last.error) updated++;
  }

  return {
    updated,
    me: wanted.get(studentId) ?? {},
    unknownGender: plan.unknownGender,
    unassigned: plan.unassigned,
    dropped: [...dropped],
  };
}

/** Re-places a whole seminar's gender side, used after a manual member move. */
export async function reassignSeminar(semina: string): Promise<AssignOutcome> {
  const roster = await loadRoster();
  const plan = planAssignments(roster);
  const target = normalizeSeminar(semina);
  const wanted = new Map<string, { semina: string; student_group: string }>();

  for (const s of roster) {
    if ((plan.seminars[s.id] ?? normalizeSeminar(s.semina)) !== target) continue;
    const group = plan.groups[s.id];
    if (!group) continue;
    if (normalizeSeminar(s.semina) === target && normalizeGroupName(s.student_group) === group)
      continue;
    wanted.set(s.id, { semina: target, student_group: group });
  }

  const dropped = new Set<string>();
  let updated = 0;
  for (const [id, values] of wanted) {
    const { last, dropped: d } = await retryWithoutMissingColumns(
      values as unknown as Record<string, unknown>,
      (working) =>
        supabase
          .from("students")
          .update(working as any)
          .eq("id", id),
    );
    for (const col of d) dropped.add(col);
    if (!last.error) updated++;
  }

  return {
    updated,
    me: {},
    unknownGender: plan.unknownGender,
    unassigned: plan.unassigned,
    dropped: [...dropped],
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
