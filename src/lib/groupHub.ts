/**
 * The group hub: what a student is allowed to see, and who they may invite.
 *
 * Everything here is pure so `node --test` can hold the boundaries directly; the
 * Supabase reads and writes live in `groupHubApi.ts`.
 *
 * The rules the owner asked for, in one place:
 *
 *  - A student proves who they are with their Reg Namba **and** the phone number
 *    they registered with. The roster is readable by anyone holding the
 *    publishable key, so a Reg Namba alone is not proof — it is printed on every
 *    group list. Both must match the same row.
 *  - A group holds at most eight people. A group with fewer than five is
 *    "under-filled" and its members may be invited into another group.
 *  - Nobody is invited into a full group. The check is here as well as in the
 *    database, because the database cannot refuse a write it never sees.
 *  - An invitation is a request the invitee accepts; it never moves anybody on
 *    its own. Moving a student into a group is a seat change, and a seat change
 *    that happened without the student's word would be a way to unseat someone.
 */

import {
  GROUP_SIZE,
  normalizeGender,
  normalizeSeminar,
  type Gender,
  type GroupMember,
  type RosterEntry,
} from "./groupAssignment.ts";
import { normalizePhone } from "./pin-crypto.ts";

/** A group below this many members may be invited elsewhere. */
export const UNDER_FILLED_BELOW = 5;

/** What a verified student is shown about their own group. */
export type VerifiedGroup = {
  student: RosterEntry;
  semina: string;
  gender: Gender;
  group: string | null;
  members: GroupMember[];
  /** Members present, out of `GROUP_SIZE`. */
  size: number;
  free: number;
  /** At `GROUP_SIZE`: nobody may be invited in. */
  full: boolean;
  /** Below `UNDER_FILLED_BELOW`: this group may be invited into another. */
  underFilled: boolean;
  /** The invitation this student sent, if any, and the one they received. */
  sentInvite: GroupInvite | null;
  receivedInvite: GroupInvite | null;
};

export type GroupInviteStatus = "pending" | "accepted" | "declined" | "cancelled";

export type GroupInvite = {
  id: string;
  from_student_id: string;
  from_reg_no: string;
  from_name: string;
  from_semina: string;
  from_group: string;
  to_student_id: string;
  to_reg_no: string;
  to_name: string;
  to_semina: string;
  to_group: string;
  status: GroupInviteStatus;
  created_at: string;
};

/**
 * Why a verification failed, in words a student can act on. A bare `false`
 * leaves them guessing whether they mistyped the number or are not on the list.
 */
export type VerifyFailure = "no_reg" | "no_phone" | "no_match" | "no_phone_on_file";

export type VerifyResult =
  | { ok: true; student: RosterEntry }
  | { ok: false; reason: VerifyFailure };

/**
 * Matches a Reg Namba against the number the student registered with.
 *
 * Both must land on the same row. `normalizePhone` is the same function the
 * PIN flow uses, so `0699105527`, `+255699105527` and `255699105527` all verify
 * the same student rather than one of them silently failing.
 */
export function verifyStudent(roster: RosterEntry[], regNo: string, phone: string): VerifyResult {
  const reg = String(regNo ?? "").trim();
  if (!reg) return { ok: false, reason: "no_reg" };

  const student = findByRegNo(roster, reg);
  if (!student) return { ok: false, reason: "no_match" };

  const onFile = normalizePhone(student.phone ?? "");
  if (!onFile) return { ok: false, reason: "no_phone_on_file" };

  const offered = normalizePhone(phone);
  if (!offered) return { ok: false, reason: "no_phone" };

  if (offered !== onFile) return { ok: false, reason: "no_match" };
  return { ok: true, student };
}

/** Case, spaces and punctuation in a Reg Namba do not matter. */
export function findByRegNo(roster: RosterEntry[], regNo: string): RosterEntry | null {
  const key = regKey(regNo);
  if (!key) return null;
  return roster.find((s) => regKey(s.reg_no) === key) ?? null;
}

function regKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * The group a row belongs to, with the people in it and the two flags that
 * decide what the page offers.
 *
 * `group` is read off the student's own row rather than recomputed from the
 * planner. The planner fills empty seats for the whole cohort, so running it
 * here would answer "where would the system put you" — a question the student
 * did not ask, and one that can differ from the seat they actually hold.
 */
export function describeGroup(
  roster: RosterEntry[],
  student: RosterEntry,
  invites: GroupInvite[] = [],
): VerifiedGroup {
  const semina = normalizeSeminar(student.semina) ?? "";
  const gender = normalizeGender(student.gender);
  const group = String(student.student_group ?? "").trim() || null;

  const members = group
    ? roster
        .filter(
          (s) =>
            String(s.student_group ?? "").trim() === group &&
            (normalizeSeminar(s.semina) ?? "") === semina &&
            normalizeGender(s.gender) === gender,
        )
        .map(
          (s): GroupMember => ({
            id: s.id,
            reg_no: String(s.reg_no ?? "").trim(),
            full_name: String(s.full_name ?? "").trim(),
            phone: String(s.phone ?? "").trim(),
          }),
        )
        .sort((a, b) => a.reg_no.localeCompare(b.reg_no))
    : [];

  const pending = invites.filter((i) => i.status === "pending");
  return {
    student,
    semina,
    gender,
    group,
    members,
    size: members.length,
    free: Math.max(0, GROUP_SIZE - members.length),
    full: members.length >= GROUP_SIZE,
    underFilled: members.length < UNDER_FILLED_BELOW,
    sentInvite: pending.find((i) => i.from_student_id === student.id) ?? null,
    receivedInvite: pending.find((i) => i.to_student_id === student.id) ?? null,
  };
}

export type InviteRejection =
  | "no_group"
  | "self"
  | "unknown_target"
  | "different_seminar"
  | "different_gender"
  | "target_group_full"
  | "source_not_under_filled"
  | "already_pending"
  | "not_my_invite"
  | "target_not_updated";

/**
 * Whether `from` may invite `to` into `to`'s group.
 *
 * The invitation moves the *inviter* into the invitee's group, so the limit
 * that matters is the invitee's group: it must have a free seat. The inviter's
 * own group must be under-filled, because that is the situation the owner
 * wanted to relieve — a nearly empty group is the one that should merge into a
 * fuller one, not the other way round.
 *
 * A group is gender-pure, so a cross-gender invitation is refused rather than
 * quietly creating a mixed group.
 */
export function checkInvite(
  roster: RosterEntry[],
  from: RosterEntry,
  toStudentId: string,
  pendingInvites: GroupInvite[] = [],
): InviteRejection | null {
  const fromGroup = String(from.student_group ?? "").trim();
  if (!fromGroup) return "no_group";
  if (from.id === toStudentId) return "self";

  const to = roster.find((s) => s.id === toStudentId);
  if (!to) return "unknown_target";

  const fromSemina = normalizeSeminar(from.semina) ?? "";
  const toSemina = normalizeSeminar(to.semina) ?? "";
  if (!toSemina || fromSemina !== toSemina) return "different_seminar";

  if (normalizeGender(from.gender) !== normalizeGender(to.gender)) return "different_gender";

  const toGroup = String(to.student_group ?? "").trim();
  if (!toGroup) return "unknown_target";

  // The owner's rule: only invite someone who has already updated their details.
  // A student who never opened the form has not confirmed the phone number the
  // roster shows, so an invitation to them is an invitation to a row, not a person.
  if (!isUpdated(to)) return "target_not_updated";

  const toSize = countGroup(roster, toSemina, toGroup, normalizeGender(to.gender));
  if (toSize >= GROUP_SIZE) return "target_group_full";

  const fromSize = countGroup(roster, fromSemina, fromGroup, normalizeGender(from.gender));
  if (fromSize >= UNDER_FILLED_BELOW) return "source_not_under_filled";

  const already = pendingInvites.some(
    (i) => i.from_student_id === from.id && i.to_student_id === to.id && i.status === "pending",
  );
  if (already) return "already_pending";

  return null;
}

/**
 * Whether a student has been through the Update Taarifa form. `group_confirmed_at`
 * is stamped by the save, so it is the one column that distinguishes a student who
 * has confirmed their details from a row that was merely imported.
 */
export function isUpdated(s: Pick<RosterEntry, "group_confirmed_at">): boolean {
  return !!s.group_confirmed_at;
}

/** How many students hold a seat in one group. */
export function countGroup(
  roster: RosterEntry[],
  semina: string,
  group: string,
  gender?: Gender,
): number {
  const wantSemina = normalizeSeminar(semina) ?? "";
  const wantGroup = String(group ?? "").trim();
  if (!wantSemina || !wantGroup) return 0;
  return roster.filter(
    (s) =>
      String(s.student_group ?? "").trim() === wantGroup &&
      (normalizeSeminar(s.semina) ?? "") === wantSemina &&
      (gender === undefined || normalizeGender(s.gender) === gender),
  ).length;
}

/**
 * The groups a student in an under-filled group may ask to join: same seminar,
 * same gender, at least one free seat, and not the group they are already in.
 * Sorted by how full they are, so the fullest first — that is the merge that
 * leaves the fewest half-empty groups behind.
 */
export function joinableGroups(
  roster: RosterEntry[],
  student: RosterEntry,
): { group: string; size: number; free: number }[] {
  const semina = normalizeSeminar(student.semina) ?? "";
  const gender = normalizeGender(student.gender);
  const mine = String(student.student_group ?? "").trim();
  if (!semina || gender === "unknown") return [];

  // Only groups that actually exist in *this* seminar. Deriving the names from
  // the whole roster would offer a group that only exists elsewhere, and it
  // would look empty here because its members sit in another seminar.
  const names = [
    ...new Set(
      roster
        .filter((s) => (normalizeSeminar(s.semina) ?? "") === semina)
        .map((s) => String(s.student_group ?? "").trim()),
    ),
  ].filter(Boolean);

  return names
    .filter((group) => group !== mine)
    .map((group) => {
      const size = countGroup(roster, semina, group, gender);
      return { group, size, free: Math.max(0, GROUP_SIZE - size) };
    })
    .filter((g) => g.free > 0)
    .sort((a, b) => b.size - a.size || a.group.localeCompare(b.group));
}

/** The phone number as it should read on screen, or a dash when there is none. */
export function phoneOrDash(phone: string | null | undefined): string {
  const raw = String(phone ?? "").trim();
  return raw || "—";
}

/** The words for each refusal, so the page never invents its own. */
export const INVITE_REJECTION_TEXT: Record<InviteRejection, string> = {
  no_group: "Wewe huna group bado. Mwone mwalimu au admin akupange kwenye group.",
  self: "Huwezi kujialika mwenyewe.",
  unknown_target: "Mwanafunzi huyo hajapatikana au hana group.",
  different_seminar: "Hamko semina moja, kwa hivyo hamwezi kuwa group moja.",
  different_gender: "Group ni la jinsia moja. Mwaliko huu hauwezekani.",
  target_group_full: `Group la mwenzako limejaa (watu ${GROUP_SIZE}). Hakuna nafasi ya kuingia.`,
  source_not_under_filled: `Group lako lina watu ${UNDER_FILLED_BELOW} au zaidi, kwa hivyo haliingii kwenye group lingine.`,
  already_pending: "Tayari umemwalika mwanafunzi huyu. Subiri ajibu.",
  not_my_invite: "Mwaliko huu si wako, kwa hivyo hauwezi kuujibu.",
  target_not_updated:
    "Mwanafunzi huyu haja-update taarifa zake bado, kwa hivyo hamwezi kualikwa. Mwambie aanze na Update Taarifa.",
};

/**
 * The RPC raises its messages in Swahili, so an English reader would see the wrong
 * language. Known failures are mapped back to dictionary keys; anything else falls
 * through to the raw message.
 */
export function inviteErrorKey(error: unknown): string | null {
  const e = error as { code?: string; message?: string } | null;
  const message = e?.message ?? "";
  if (e?.code === "no_data_found" || /Mwaliko huu haupo/.test(message)) return "gh_err_gone";
  if (/si wako/.test(message)) return "gh_err_not_yours";
  if (/tayari umejibiwa/.test(message)) return "gh_err_answered";
  if (/Umekwisha hamia/.test(message)) return "gh_err_moved";
  if (/limejaa sasa hivi/.test(message)) return "gh_err_full_now";
  if (/limejaa|Hakuna nafasi/.test(message)) return "gh_err_target_full";
  if (/jinsia moja/.test(message)) return "gh_err_gender";
  if (/haja-update/.test(message)) return "gh_err_not_updated";
  if (/watu 5 au zaidi/.test(message)) return "gh_err_source_full";
  return null;
}

/**
 * What to tell the invitee after the database answered. Kept here rather than
 * inline in the page so the wording decision is testable: "cancelled" is not a
 * success — it means the mover had already left, so the invitation is void.
 */
export function answerToast(
  outcome: string | null,
  accept: boolean,
): { kind: "success" | "info"; key: string } {
  if (outcome === "cancelled") return { kind: "info", key: "gh_err_moved" };
  return { kind: "success", key: accept ? "gh_accepted" : "gh_declined" };
}
