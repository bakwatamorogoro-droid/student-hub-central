import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UNDER_FILLED_BELOW,
  checkInvite,
  isUpdated,
  countGroup,
  describeGroup,
  findByRegNo,
  answerToast,
  inviteErrorKey,
  joinableGroups,
  phoneOrDash,
  verifyStudent,
  type GroupInvite,
} from "./groupHub.ts";
import type { RosterEntry } from "./groupAssignment.ts";

function student(over: Partial<RosterEntry> & { id: string }): RosterEntry {
  return {
    reg_no: `MUM2025-04-${over.id}`,
    full_name: `Mwanafunzi ${over.id}`,
    semina: "SEMINA 1",
    gender: "male",
    student_group: "GROUP 1",
    phone: "0699105527",
    // Updated by default: most tests are about capacity, not about the update
    // rule, which gets its own cases below.
    group_confirmed_at: "2026-11-01T00:00:00Z",
    ...over,
  };
}

function invite(over: Partial<GroupInvite>): GroupInvite {
  return {
    id: "inv-1",
    from_student_id: "a",
    from_reg_no: "MUM2025-04-a",
    from_name: "A",
    from_semina: "SEMINA 1",
    from_group: "GROUP 1",
    to_student_id: "b",
    to_reg_no: "MUM2025-04-b",
    to_name: "B",
    to_semina: "SEMINA 1",
    to_group: "GROUP 2",
    status: "pending",
    created_at: "2026-11-03T00:00:00Z",
    ...over,
  };
}

// --- verification ---------------------------------------------------------

test("the registered phone verifies the student, in every spelling", () => {
  const roster = [student({ id: "1", reg_no: "MUM2025-04-14106", phone: "0699105527" })];
  for (const phone of ["0699105527", "+255699105527", "255699105527", "699105527"]) {
    const r = verifyStudent(roster, "MUM2025-04-14106", phone);
    assert.equal(r.ok, true, `should verify with ${phone}`);
  }
});

test("the Reg Namba is matched regardless of case, spaces and dashes", () => {
  const roster = [student({ id: "1", reg_no: "MUM2025-04-14106" })];
  for (const reg of ["mum2025-04-14106", "MUM 2025 04 14106", "MUM20250414106"]) {
    assert.equal(verifyStudent(roster, reg, "0699105527").ok, true, reg);
  }
});

test("a wrong phone does not verify, even with the right Reg Namba", () => {
  const roster = [student({ id: "1", phone: "0699105527" })];
  const r = verifyStudent(roster, "MUM2025-04-1", "0712345678");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "no_match");
});

test("the right phone with someone else's Reg Namba does not verify", () => {
  const roster = [
    student({ id: "1", reg_no: "MUM2025-04-1", phone: "0699105527" }),
    student({ id: "2", reg_no: "MUM2025-04-2", phone: "0712345678" }),
  ];
  assert.equal(verifyStudent(roster, "MUM2025-04-2", "0699105527").ok, false);
});

test("each failure names what is actually wrong", () => {
  const roster = [student({ id: "1", phone: "0699105527" }), student({ id: "2", phone: "" })];
  const reason = (r: ReturnType<typeof verifyStudent>) => (r.ok ? "ok" : r.reason);
  assert.equal(reason(verifyStudent(roster, "", "0699105527")), "no_reg");
  assert.equal(reason(verifyStudent(roster, "NOPE-1", "0699105527")), "no_match");
  assert.equal(reason(verifyStudent(roster, "MUM2025-04-2", "0699105527")), "no_phone_on_file");
  assert.equal(reason(verifyStudent(roster, "MUM2025-04-1", "")), "no_phone");
});

test("findByRegNo tolerates formatting and finds nothing for an empty query", () => {
  const roster = [student({ id: "1", reg_no: "MUM2025-04-14106" })];
  assert.equal(findByRegNo(roster, " mum20250414106 ")?.id, "1");
  assert.equal(findByRegNo(roster, "   "), null);
});

// --- the group view -------------------------------------------------------

test("the group lists exactly the classmates in the same seminar, group and gender", () => {
  const roster = [
    student({ id: "1", student_group: "GROUP 1" }),
    student({ id: "2", student_group: "GROUP 1" }),
    student({ id: "3", student_group: "GROUP 2" }),
    student({ id: "4", student_group: "GROUP 1", semina: "SEMINA 2" }),
    student({ id: "5", student_group: "GROUP 1", gender: "female" }),
  ];
  const mine = describeGroup(roster, roster[0]);
  assert.deepEqual(
    mine.members.map((m) => m.id),
    ["1", "2"],
  );
  assert.equal(mine.size, 2);
  assert.equal(mine.free, 6);
});

test("every member carries the phone they registered", () => {
  const roster = [
    student({ id: "1", phone: "0699105527" }),
    student({ id: "2", phone: "0712345678" }),
  ];
  const mine = describeGroup(roster, roster[0]);
  assert.deepEqual(
    mine.members.map((m) => m.phone),
    ["0699105527", "0712345678"],
  );
});

test("a group of eight is full and may not be joined", () => {
  const roster = Array.from({ length: 8 }, (_, i) => student({ id: String(i + 1) }));
  const mine = describeGroup(roster, roster[0]);
  assert.equal(mine.size, 8);
  assert.equal(mine.full, true);
  assert.equal(mine.free, 0);
  assert.equal(mine.underFilled, false);
});

test("four is under-filled, five is not", () => {
  const four = Array.from({ length: UNDER_FILLED_BELOW - 1 }, (_, i) =>
    student({ id: String(i + 1) }),
  );
  assert.equal(describeGroup(four, four[0]).underFilled, true);

  const five = Array.from({ length: UNDER_FILLED_BELOW }, (_, i) => student({ id: String(i + 1) }));
  assert.equal(describeGroup(five, five[0]).underFilled, false);
});

test("a student with no group is described without inventing one", () => {
  const roster = [student({ id: "1", student_group: null })];
  const mine = describeGroup(roster, roster[0]);
  assert.equal(mine.group, null);
  assert.deepEqual(mine.members, []);
  assert.equal(mine.size, 0);
  assert.equal(mine.underFilled, true);
});

test("a pending invite is reported as sent and received", () => {
  const roster = [student({ id: "a" }), student({ id: "b" })];
  const mine = describeGroup(roster, roster[0], [invite({})]);
  assert.equal(mine.sentInvite?.id, "inv-1");
  assert.equal(mine.receivedInvite, null);

  const theirs = describeGroup(roster, roster[1], [invite({})]);
  assert.equal(theirs.receivedInvite?.id, "inv-1");
  assert.equal(theirs.sentInvite, null);
});

test("a settled invite is not offered again", () => {
  const roster = [student({ id: "a" }), student({ id: "b" })];
  for (const status of ["accepted", "declined", "cancelled"] as const) {
    const mine = describeGroup(roster, roster[0], [invite({ status })]);
    assert.equal(mine.sentInvite, null, status);
  }
});

// --- invitations ----------------------------------------------------------

/** `from` in a group of `fromSize`, `to` in a group of `toSize`. */
function pair(fromSize: number, toSize: number) {
  const from = student({ id: "from", student_group: "GROUP 1" });
  const to = student({ id: "to", student_group: "GROUP 2" });
  const roster = [from, to];
  for (let i = 0; i < fromSize - 1; i++) {
    roster.push(student({ id: `f${i}`, student_group: "GROUP 1" }));
  }
  for (let i = 0; i < toSize - 1; i++) {
    roster.push(student({ id: `t${i}`, student_group: "GROUP 2" }));
  }
  return { roster, from, to };
}

test("an under-filled group may ask to join a group with a free seat", () => {
  const { roster, from, to } = pair(3, 6);
  assert.equal(checkInvite(roster, from, to.id), null);
});

test("a full target group refuses the invitation", () => {
  const { roster, from, to } = pair(3, 8);
  assert.equal(checkInvite(roster, from, to.id), "target_group_full");
});

test("a source group of five or more may not move", () => {
  const { roster, from, to } = pair(5, 2);
  assert.equal(checkInvite(roster, from, to.id), "source_not_under_filled");
});

test("a source group of four may still move", () => {
  const { roster, from, to } = pair(4, 2);
  assert.equal(checkInvite(roster, from, to.id), null);
});

test("an invitation across seminars or genders is refused", () => {
  const { roster, from, to } = pair(2, 2);
  to.semina = "SEMINA 2";
  assert.equal(checkInvite(roster, from, to.id), "different_seminar");

  to.semina = "SEMINA 1";
  to.gender = "female";
  assert.equal(checkInvite(roster, from, to.id), "different_gender");
});

test("you cannot invite yourself, and an unknown target is refused", () => {
  const { roster, from } = pair(2, 2);
  assert.equal(checkInvite(roster, from, from.id), "self");
  assert.equal(checkInvite(roster, from, "nobody"), "unknown_target");
});

test("a student with no group cannot invite", () => {
  const { roster, from, to } = pair(2, 2);
  from.student_group = null;
  assert.equal(checkInvite(roster, from, to.id), "no_group");
});

test("the same invitation is not sent twice", () => {
  const { roster, from, to } = pair(2, 2);
  const pending = [invite({ from_student_id: from.id, to_student_id: to.id })];
  assert.equal(checkInvite(roster, from, to.id, pending), "already_pending");
});

test("a settled invitation does not block a fresh one", () => {
  const { roster, from, to } = pair(2, 2);
  const settled = [invite({ from_student_id: from.id, to_student_id: to.id, status: "declined" })];
  assert.equal(checkInvite(roster, from, to.id, settled), null);
});

test("a student who has not updated their details cannot be invited", () => {
  const { roster, from, to } = pair(2, 2);
  to.group_confirmed_at = null;
  assert.equal(checkInvite(roster, from, to.id), "target_not_updated");
});

test("everyone in a group can be invited only once they have updated", () => {
  const from = student({ id: "from", student_group: "GROUP 1" });
  const updated = student({ id: "u", student_group: "GROUP 2" });
  const notUpdated = student({ id: "n", student_group: "GROUP 2", group_confirmed_at: null });
  const roster = [from, updated, notUpdated];
  assert.equal(checkInvite(roster, from, updated.id), null);
  assert.equal(checkInvite(roster, from, notUpdated.id), "target_not_updated");
});

test("the update rule does not block the inviter, only the invitee", () => {
  const from = student({ id: "from", student_group: "GROUP 1", group_confirmed_at: null });
  const to = student({ id: "to", student_group: "GROUP 2" });
  assert.equal(checkInvite([from, to], from, to.id), null);
});

test("isUpdated reads the confirmation stamp and nothing else", () => {
  assert.equal(isUpdated({ group_confirmed_at: "2026-11-01T00:00:00Z" }), true);
  assert.equal(isUpdated({ group_confirmed_at: null }), false);
  assert.equal(isUpdated({}), false);
});

test("countGroup counts one seminar and one gender only", () => {
  const roster = [
    student({ id: "1", student_group: "GROUP 1" }),
    student({ id: "2", student_group: "GROUP 1" }),
    student({ id: "3", student_group: "GROUP 1", gender: "female" }),
    student({ id: "4", student_group: "GROUP 1", semina: "SEMINA 2" }),
    student({ id: "5", student_group: "GROUP 2" }),
  ];
  assert.equal(countGroup(roster, "SEMINA 1", "GROUP 1", "male"), 2);
  assert.equal(countGroup(roster, "SEMINA 1", "GROUP 1"), 3);
  assert.equal(countGroup(roster, "SEMINA 1", "GROUP 9"), 0);
  assert.equal(countGroup(roster, "", "GROUP 1"), 0);
});

// --- where a student may go ----------------------------------------------

test("joinable groups are open seats in the same seminar and gender, fullest first", () => {
  const me = student({ id: "me", student_group: "GROUP 1" });
  const roster = [me];
  // GROUP 2: 1 other. GROUP 3: 6 others. GROUP 4: full. GROUP 5: other seminar.
  roster.push(student({ id: "g2", student_group: "GROUP 2" }));
  for (let i = 0; i < 6; i++) roster.push(student({ id: `g3-${i}`, student_group: "GROUP 3" }));
  for (let i = 0; i < 8; i++) roster.push(student({ id: `g4-${i}`, student_group: "GROUP 4" }));
  roster.push(student({ id: "g5", student_group: "GROUP 5", semina: "SEMINA 2" }));

  const groups = joinableGroups(roster, me);
  assert.deepEqual(
    groups.map((g) => g.group),
    ["GROUP 3", "GROUP 2"],
  );
  assert.equal(groups[0].size, 6);
  assert.equal(groups[0].free, 2);
});

test("a student with no group or no gender is offered nothing", () => {
  const me = student({ id: "me", student_group: null });
  assert.deepEqual(joinableGroups([me], me), []);
  const unknown = student({ id: "me2", gender: "unknown" });
  assert.deepEqual(joinableGroups([unknown], unknown), []);
});

test("the group you are already in is not offered", () => {
  const me = student({ id: "me", student_group: "GROUP 1" });
  const roster = [me, student({ id: "x", student_group: "GROUP 1" })];
  assert.deepEqual(joinableGroups(roster, me), []);
});

test("a missing phone reads as a dash rather than the word undefined", () => {
  assert.equal(phoneOrDash("0699105527"), "0699105527");
  assert.equal(phoneOrDash("  "), "—");
  assert.equal(phoneOrDash(null), "—");
  assert.equal(phoneOrDash(undefined), "—");
});

test("each database refusal is named, so the toast can speak both languages", () => {
  const raised = (message: string, code = "P0001") => ({ message, code });
  assert.equal(
    inviteErrorKey(raised("Group limejaa sasa hivi (watu 8). Mwaliko hauwezi kukubaliwa.")),
    "gh_err_full_now",
  );
  assert.equal(
    inviteErrorKey(raised("Group la mwenzako limejaa (watu 8). Hakuna nafasi ya kuingia.")),
    "gh_err_target_full",
  );
  assert.equal(
    inviteErrorKey(raised("Mwaliko huu tayari umejibiwa.", "check_violation")),
    "gh_err_answered",
  );
  assert.equal(inviteErrorKey(raised("Mwaliko huu haupo.", "no_data_found")), "gh_err_gone");
  assert.equal(
    inviteErrorKey(raised("Mwaliko huu si wako, kwa hivyo hauwezi kuujibu.")),
    "gh_err_not_yours",
  );
  assert.equal(
    inviteErrorKey(raised("Group ni la jinsia moja; mwaliko huu hauwezekani.")),
    "gh_err_gender",
  );
  assert.equal(
    inviteErrorKey(
      raised("Mwanafunzi huyu haja-update taarifa zake bado, kwa hivyo hawezi kualikwa."),
    ),
    "gh_err_not_updated",
  );
  assert.equal(
    inviteErrorKey(raised("Umekwisha hamia group lingine, kwa hivyo mwaliko huu umefutwa.")),
    "gh_err_moved",
  );
  assert.equal(
    inviteErrorKey(
      raised("Group lako lina watu 5 au zaidi, kwa hivyo haliingii kwenye group lingine."),
    ),
    "gh_err_source_full",
  );
});

test("an unknown failure keeps the raw message instead of pretending to know it", () => {
  assert.equal(inviteErrorKey({ message: "connection reset", code: "08006" }), null);
  assert.equal(inviteErrorKey(null), null);
  assert.equal(inviteErrorKey(undefined), null);
});

test("a void invitation is reported as such, not as an acceptance", () => {
  assert.deepEqual(answerToast("accepted", true), { kind: "success", key: "gh_accepted" });
  assert.deepEqual(answerToast("declined", false), { kind: "success", key: "gh_declined" });
  assert.deepEqual(answerToast("cancelled", true), { kind: "info", key: "gh_err_moved" });
  // A reply the browser does not recognise still falls back to the plain answer.
  assert.deepEqual(answerToast(null, true), { kind: "success", key: "gh_accepted" });
});
