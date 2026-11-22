import { supabase } from "@/integrations/supabase/client";
import type { GroupInvite, GroupInviteStatus } from "@/lib/groupHub";

/**
 * The invitation table, and nothing else. The rules live in `groupHub.ts` and in
 * the `group_invites` triggers; this file only moves rows.
 */

const TABLE = "group_invites";

/**
 * The generated Supabase types predate this table, so the client does not know
 * it. Rather than cast to `any` and lose checking on the payloads, this is the
 * shape of the calls made below.
 */
type InviteRow = Omit<GroupInvite, "id" | "created_at" | "answered_at"> & {
  note?: string | null;
};
type InviteQuery = {
  select: (columns: string) => InviteQuery;
  or: (filter: string) => InviteQuery;
  order: (column: string, opts: { ascending: boolean }) => InviteQuery;
  limit: (n: number) => Promise<{ data: GroupInvite[] | null; error: unknown }>;
  insert: (row: InviteRow) => Promise<{ error: unknown }>;
  update: (row: { status: GroupInviteStatus; answered_at: string }) => {
    eq: (
      column: string,
      value: string,
    ) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};
type InvitesClient = {
  from: (table: string) => InviteQuery;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error: unknown }>;
};

const invites = supabase as unknown as InvitesClient;

/** True when the table has not been created yet, so the page can say so instead of showing an error. */
export function isMissingInvitesTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return /relation .*group_invites.* does not exist|could not find the table/i.test(
    e.message || "",
  );
}

/**
 * The invitations that name this student, in either direction.
 *
 * `null` means the table is not there yet, which is different from "no
 * invitations": the page shows a migration notice for the first and an empty
 * inbox for the second.
 */
export async function loadInvitesFor(studentId: string): Promise<GroupInvite[] | null> {
  const { data, error } = await invites
    .from(TABLE)
    .select("*")
    .or(`from_student_id.eq.${studentId},to_student_id.eq.${studentId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingInvitesTable(error)) return null;
    return [];
  }
  return (data || []) as GroupInvite[];
}

export type InviteDraft = {
  from: {
    id: string;
    reg_no?: string | null;
    full_name?: string | null;
    semina?: string | null;
    student_group?: string | null;
  };
  to: {
    id: string;
    reg_no?: string | null;
    full_name?: string | null;
    semina?: string | null;
    student_group?: string | null;
  };
  note?: string | null;
};

/** Sends one invitation. The capacity triggers are the real guard; this is the write. */
export async function sendInvite(draft: InviteDraft): Promise<Error | null> {
  const { error } = await invites.from(TABLE).insert({
    from_student_id: draft.from.id,
    from_reg_no: String(draft.from.reg_no ?? "").trim(),
    from_name: String(draft.from.full_name ?? "").trim(),
    from_semina: String(draft.from.semina ?? "").trim(),
    from_group: String(draft.from.student_group ?? "").trim(),
    to_student_id: draft.to.id,
    to_reg_no: String(draft.to.reg_no ?? "").trim(),
    to_name: String(draft.to.full_name ?? "").trim(),
    to_semina: String(draft.to.semina ?? "").trim(),
    to_group: String(draft.to.student_group ?? "").trim(),
    status: "pending",
    note: draft.note ?? null,
  });
  return (error as unknown as Error) ?? null;
}

/**
 * Answers an invitation. Accepting moves the inviter into the invitee's group in
 * the same transaction, so the two cannot disagree; the RPC is the only path.
 */
export async function answerInvite(
  inviteId: string,
  studentId: string,
  accept: boolean,
): Promise<{ error: Error | null; needsMigration: boolean; outcome: string | null }> {
  const { data, error } = await invites.rpc("answer_group_invite", {
    p_invite_id: inviteId,
    p_student_id: studentId,
    p_accept: accept,
  });
  if (!error) {
    // The function answers with what it did: accepted, declined, or cancelled
    // because the mover had already left the group the invitation named.
    return { error: null, needsMigration: false, outcome: typeof data === "string" ? data : null };
  }
  if (isMissingRpc(error)) {
    // Without the RPC the status can still be recorded, so the invitee is not
    // stuck, but the seat cannot be moved — say so rather than half-applying.
    return { error: error as unknown as Error, needsMigration: true, outcome: null };
  }
  return { error: error as unknown as Error, needsMigration: false, outcome: null };
}

export async function cancelInvite(inviteId: string): Promise<Error | null> {
  const { error } = await invites
    .from(TABLE)
    .update({ status: "cancelled" as GroupInviteStatus, answered_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("status", "pending");
  return (error as unknown as Error) ?? null;
}

function isMissingRpc(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message || "")
  );
}
