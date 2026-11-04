import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUPS_PER_SEMINAR,
  GROUP_NAMES,
  GROUP_SIZE,
  SEMINARS,
  assignGroups,
  assignSeminar,
  buildSeminarReports,
  isInCohort,
  openGroupNamesFor,
  openSeatsAsReports,
  openSeatsForCohort,
  findMyGroup,
  formatGroupLabel,
  normalizeGender,
  normalizeGroupName,
  normalizeSeminar,
  planAssignments,
  planMoves,
  regKey,
  searchMembers,
  type RosterEntry,
} from "./groupAssignment.ts";

/** Builds `n` students for one seminar and gender, with Reg Namba in order. */
const cohort = (
  semina: string,
  gender: string,
  n: number,
  opts: { group?: string; prefix?: string } = {},
): RosterEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${semina}-${gender}-${opts.prefix ?? ""}${i}`,
    reg_no: `REG-${opts.prefix ?? ""}${String(i).padStart(4, "0")}`,
    full_name: `Student ${i}`,
    semina,
    gender,
    student_group: opts.group ?? null,
  }));

test("the cohort shape is 15 seminars, 11 groups, 8 seats", () => {
  assert.equal(SEMINARS.length, 15);
  assert.equal(GROUP_NAMES.length, 11);
  assert.equal(GROUP_SIZE, 8);
  assert.equal(SEMINARS[0], "SEMINA 1");
  assert.equal(SEMINARS.at(-1), "SEMINA 15");
  assert.equal(GROUP_NAMES.at(-1), "GROUP 11");
});

test("gender is read from whole words, not the first letter", () => {
  // The bug this guards: "Mwanamke" and "Mwanaume" both start with M.
  assert.equal(normalizeGender("Mwanamke"), "female");
  assert.equal(normalizeGender("Mwanaume"), "male");
  assert.equal(normalizeGender("ME"), "male");
  assert.equal(normalizeGender("M"), "male");
  assert.equal(normalizeGender("F"), "female");
  assert.equal(normalizeGender("KE"), "female");
  assert.equal(normalizeGender("wanawake"), "female");
  assert.equal(normalizeGender("female"), "female");
  assert.equal(normalizeGender(""), "unknown");
  assert.equal(normalizeGender(null), "unknown");
  assert.equal(normalizeGender("  "), "unknown");
  // A name is not a gender.
  assert.equal(normalizeGender("Mwanamke Mwema"), "female");
  assert.equal(normalizeGender("N"), "unknown");
});

test("seminar and group names are normalised from the values really stored", () => {
  assert.equal(normalizeSeminar("SEMINA 3"), "SEMINA 3");
  assert.equal(normalizeSeminar("Semina 3"), "SEMINA 3");
  assert.equal(normalizeSeminar("S1"), "SEMINA 1");
  assert.equal(normalizeSeminar("SEMINA 16"), "SEMINA 16");
  assert.equal(normalizeSeminar("TEST"), null);
  assert.equal(normalizeSeminar(""), null);

  assert.equal(normalizeGroupName("GROUP 7"), "GROUP 7");
  // The imported cohort has a double space.
  assert.equal(normalizeGroupName("GROUP  7"), "GROUP 7");
  assert.equal(normalizeGroupName("group 11"), "GROUP 11");
  assert.equal(normalizeGroupName("GROUP 12"), null);
  assert.equal(normalizeGroupName("ASSIGMENT 1"), null);
  assert.equal(normalizeGroupName(null), null);
});

test("a seminar already on the student is kept, never moved", () => {
  const roster = [...cohort("SEMINA 4", "Mwanaume", 3), ...cohort("SEMINA 9", "Mwanamke", 2)];
  const out = assignSeminar(roster);
  for (const s of roster) assert.equal(out[s.id], normalizeSeminar(s.semina));
});

test("a stray seminar past the target 15 is preserved, not silently moved", () => {
  const roster: RosterEntry[] = [
    { id: "a", reg_no: "R1", semina: "SEMINA 16", gender: "Mwanaume" },
    { id: "b", reg_no: "R2", semina: "TEST", gender: "Mwanaume" },
  ];
  const out = assignSeminar(roster);
  assert.equal(out["a"], "SEMINA 16");
  assert.ok(SEMINARS.includes(out["b"]));
});

test("students with no usable seminar are spread across the 15, smallest first", () => {
  const roster = Array.from({ length: 40 }, (_, i) => ({
    id: `n${i}`,
    reg_no: `R${String(i).padStart(4, "0")}`,
    semina: null,
    gender: "Mwanaume",
  }));
  const out = assignSeminar(roster);
  const counts = new Map<string, number>();
  for (const v of Object.values(out)) counts.set(v, (counts.get(v) ?? 0) + 1);
  assert.equal(counts.size, 15);
  // 40 over 15 seminars: 10 get 3 and 5 get 2.
  const sizes = [...counts.values()].sort((a, b) => a - b);
  assert.deepEqual(sizes, [2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
});

test("a group name is never shared across genders: capacity is per (seminar, gender, group)", () => {
  // GROUP 1 exists for both men and women in a seminar by design — they are two
  // different groups (WANAUME GROUP 1 vs WANAWKE GROUP 1). What must hold is that
  // each side's 11 groups are counted separately and none exceeds 8.
  const roster = [...cohort("SEMINA 1", "Mwanaume", 20), ...cohort("SEMINA 1", "Mwanamke", 20)];
  const { groups } = assignGroups(roster);
  const counts = new Map<string, number>();
  for (const s of roster) {
    const key = `${s.semina}||${normalizeGender(s.gender)}||${groups[s.id]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Both sides start at GROUP 1, and neither steals the other's seats.
  assert.equal(counts.get("SEMINA 1||male||GROUP 1"), 8);
  assert.equal(counts.get("SEMINA 1||female||GROUP 1"), 8);
  assert.equal(counts.get("SEMINA 1||male||GROUP 3"), 4);
  assert.equal(counts.get("SEMINA 1||female||GROUP 3"), 4);
  // Every bucket is within capacity, and every student sits on their own side.
  for (const n of counts.values()) assert.ok(n <= GROUP_SIZE, `bucket held ${n}`);
  for (const s of roster) {
    assert.ok(
      GROUP_NAMES.includes(groups[s.id]),
      `${s.id} landed in ${groups[s.id]}, not a real group`,
    );
  }
});

test("a group fills to 8 before the next one opens", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 20);
  const { groups } = assignGroups(roster);
  const counts = new Map<string, number>();
  for (const g of Object.values(groups)) counts.set(g, (counts.get(g) ?? 0) + 1);
  assert.equal(counts.get("GROUP 1"), 8);
  assert.equal(counts.get("GROUP 2"), 8);
  assert.equal(counts.get("GROUP 3"), 4);
  assert.equal(counts.size, 3);
});

test("11 full groups of 8 hold exactly 88; the 89th has no seat", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 89);
  const { groups, unassigned } = assignGroups(roster);
  assert.equal(Object.keys(groups).length, 88);
  assert.equal(unassigned.length, 1);
  const counts = new Map<string, number>();
  for (const g of Object.values(groups)) counts.set(g, (counts.get(g) ?? 0) + 1);
  assert.equal(counts.size, 11);
  for (const n of counts.values()) assert.equal(n, 8);
});

test("an existing group is kept when it still has room", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 3, { group: "GROUP 5" });
  const { groups } = assignGroups(roster);
  for (const g of Object.values(groups)) assert.equal(g, "GROUP 5");
});

test("a student in a non-group value is placed into a real group", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 3, { group: "ASSIGMENT 1 KUBADILISHA" });
  const { groups } = assignGroups(roster);
  for (const g of Object.values(groups)) assert.ok(GROUP_NAMES.includes(g));
});

test("one student updating never reshuffles classmates", () => {
  const base = cohort("SEMINA 1", "Mwanaume", 20);
  const first = assignGroups(base).groups;
  // Simulate the writes landing, then re-plan the same roster.
  const settled = base.map((s) => ({ ...s, student_group: first[s.id] }));
  const second = assignGroups(settled).groups;
  assert.deepEqual(second, first);
});

test("a missing gender is reported, not guessed into a men's group", () => {
  const roster = [
    ...cohort("SEMINA 1", "Mwanaume", 2),
    { id: "x", reg_no: "RX", semina: "SEMINA 1", gender: "" },
    { id: "y", reg_no: "RY", semina: "SEMINA 1", gender: "N" },
  ];
  const { groups, unknownGender } = assignGroups(roster);
  assert.deepEqual(unknownGender.sort(), ["x", "y"]);
  assert.equal(groups["x"], undefined);
  assert.equal(groups["y"], undefined);
});

test("the two genders never share seats", () => {
  // 88 men fill the men's side; women still start at GROUP 1.
  const roster = [...cohort("SEMINA 1", "Mwanaume", 88), ...cohort("SEMINA 1", "Mwanamke", 3)];
  const { groups } = assignGroups(roster);
  const women = roster.filter((s) => normalizeGender(s.gender) === "female");
  for (const w of women) assert.equal(groups[w.id], "GROUP 1");
  const counts = new Map<string, number>();
  for (const [id, g] of Object.entries(groups)) {
    const s = roster.find((r) => r.id === id)!;
    const key = `${normalizeGender(s.gender)}||${g}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.get("female||GROUP 1"), 3);
  assert.equal(counts.get("male||GROUP 11"), 8);
});

test("planAssignments resolves the seminar before placing the group", () => {
  const roster = Array.from({ length: 16 }, (_, i) => ({
    id: `p${i}`,
    reg_no: `R${i}`,
    semina: null,
    gender: "Mwanaume",
  }));
  const plan = planAssignments(roster);
  for (const s of roster) assert.ok(SEMINARS.includes(plan.seminars[s.id]));
  for (const s of roster) assert.ok(GROUP_NAMES.includes(plan.groups[s.id]));
});

test("buildSeminarReports always lists 11 groups for each gender", () => {
  const reports = buildSeminarReports(cohort("SEMINA 2", "Mwanamke", 9));
  assert.equal(reports.length, 1);
  const r = reports[0];
  assert.equal(r.male.length, GROUPS_PER_SEMINAR);
  assert.equal(r.female.length, GROUPS_PER_SEMINAR);
  assert.equal(r.femaleCount, 9);
  assert.equal(r.maleCount, 0);
  assert.equal(r.totalGroups, 22);
});

test("a group of exactly 8 is complete; 7 is not", () => {
  const full = buildSeminarReports(cohort("SEMINA 3", "Mwanaume", 8))[0];
  assert.equal(full.male[0].count, 8);
  assert.equal(full.male[0].complete, true);
  assert.equal(full.male[0].free, 0);
  assert.equal(full.completeGroups, 1);

  const short = buildSeminarReports(cohort("SEMINA 3", "Mwanaume", 7))[0];
  assert.equal(short.male[0].count, 7);
  assert.equal(short.male[0].complete, false);
  assert.equal(short.male[0].free, 1);
  assert.equal(short.completeGroups, 0);
});

test("reports are ordered by seminar number, not alphabetically", () => {
  const roster = [
    ...cohort("SEMINA 10", "Mwanaume", 1),
    ...cohort("SEMINA 2", "Mwanaume", 1),
    ...cohort("SEMINA 1", "Mwanaume", 1),
  ];
  assert.deepEqual(
    buildSeminarReports(roster).map((r) => r.semina),
    ["SEMINA 1", "SEMINA 2", "SEMINA 10"],
  );
});

test("findMyGroup returns the student's own group and classmates", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 20);
  const me = roster[0];
  const mine = findMyGroup(roster, me.reg_no!);
  assert.ok(mine);
  assert.equal(mine.semina, "SEMINA 1");
  assert.equal(mine.gender, "male");
  assert.equal(mine.group, "GROUP 1");
  assert.equal(mine.members.length, 8);
  assert.equal(mine.complete, true);
  assert.ok(mine.members.some((m) => m.reg_no === me.reg_no));
});

test("findMyGroup is case- and space-insensitive on the Reg Namba", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 2);
  const target = roster[0];
  target.reg_no = "  mum2025-04-14106  ";
  assert.ok(findMyGroup(roster, "MUM2025-04-14106"));
  assert.ok(findMyGroup(roster, "mum2025-04-14106"));
});

test("one Reg Namba written several ways is still one key", () => {
  // The imported cohort really stores all of these spellings.
  assert.equal(regKey("MUM2025-04-14106"), "MUM20250414106");
  assert.equal(regKey("  MUM2025-04-14106 "), "MUM20250414106");
  assert.equal(regKey("MUM 2025-04-14106"), "MUM20250414106");
  assert.equal(regKey("MUM2025_04_14106"), "MUM20250414106");
  assert.equal(regKey("mum2025-04-14106"), "MUM20250414106");
  assert.equal(regKey(null), "");
  assert.equal(regKey("  "), "");
});

test("a student whose row stores spaces or underscores can still find themselves", () => {
  const roster: RosterEntry[] = [
    {
      id: "1",
      reg_no: "MUM 2025-04-13988",
      full_name: "A",
      semina: "SEMINA 1",
      gender: "Mwanaume",
    },
    {
      id: "2",
      reg_no: "MUM2025_04_15550",
      full_name: "B",
      semina: "SEMINA 1",
      gender: "Mwanamke",
    },
  ];
  assert.ok(findMyGroup(roster, "MUM2025-04-13988"));
  assert.ok(findMyGroup(roster, "MUM 2025-04-13988"));
  assert.ok(findMyGroup(roster, "mum2025_04_15550"));
  assert.equal(searchMembers(roster, "MUM2025-04-13988").length, 1);
});

test("findMyGroup explains a missing gender instead of inventing a group", () => {
  const roster: RosterEntry[] = [
    { id: "z", reg_no: "RZ", full_name: "Z", semina: "SEMINA 1", gender: "" },
  ];
  const mine = findMyGroup(roster, "RZ");
  assert.ok(mine);
  assert.equal(mine.group, null);
  assert.match(mine.note!, /Jinsia/);
});

test("findMyGroup returns null for a Reg Namba that is not enrolled", () => {
  assert.equal(findMyGroup(cohort("SEMINA 1", "Mwanaume", 2), "NOPE"), null);
  assert.equal(findMyGroup(cohort("SEMINA 1", "Mwanaume", 2), "  "), null);
});

test("searchMembers matches a name or a Reg Namba and is capped", () => {
  const roster: RosterEntry[] = [
    { id: "1", reg_no: "MUM2025-04-14106", full_name: "Amina Hassan" },
    { id: "2", reg_no: "MUM2025-04-14107", full_name: "Bilal Omar" },
    { id: "3", reg_no: "MUM2025-04-14108", full_name: "Amina Yusuf" },
  ];
  assert.equal(searchMembers(roster, "Amina").length, 2);
  assert.equal(searchMembers(roster, "14107").length, 1);
  assert.equal(searchMembers(roster, "").length, 0);
  assert.equal(searchMembers(roster, "1410").length, 3);
  assert.equal(searchMembers(roster, "MUM", 2).length, 2);
});

test("formatGroupLabel reads as a place a student can recognise", () => {
  assert.equal(formatGroupLabel("SEMINA 1", "male", "GROUP 3"), "SEMINA 1 · WANAUME · GROUP 3");
  assert.equal(formatGroupLabel("SEMINA 9", "female", "GROUP 2"), "SEMINA 9 · WANAWAKE · GROUP 2");
});

// --- confirmation and phone numbers ----------------------------------------

test("a member carries the number they registered with", () => {
  const roster: RosterEntry[] = [
    {
      id: "1",
      reg_no: "R1",
      full_name: "Amina",
      semina: "SEMINA 1",
      gender: "Mwanamke",
      student_group: "GROUP 1",
      phone: " 0712 345 678 ",
    },
    {
      id: "2",
      reg_no: "R2",
      full_name: "Bilal",
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: "GROUP 1",
      phone: null,
    },
  ];
  const reports = buildSeminarReports(roster);
  const amina = reports[0].female[0].members.find((m) => m.id === "1");
  const bilal = reports[0].male[0].members.find((m) => m.id === "2");
  assert.equal(amina?.phone, "0712 345 678");
  // A missing number reads as an empty string, not "null", so the card can test it.
  assert.equal(bilal?.phone, "");
});

test("a group counts how many of its members confirmed", () => {
  const roster: RosterEntry[] = [
    {
      id: "1",
      reg_no: "R1",
      full_name: "A",
      semina: "SEMINA 1",
      gender: "Mwanamke",
      student_group: "GROUP 1",
      group_confirmed_at: "2026-11-01T10:00:00Z",
    },
    {
      id: "2",
      reg_no: "R2",
      full_name: "B",
      semina: "SEMINA 1",
      gender: "Mwanamke",
      student_group: "GROUP 1",
    },
  ];
  const cell = buildSeminarReports(roster)[0].female[0];
  assert.equal(cell.count, 2);
  assert.equal(cell.confirmed, 1);
  // One of the two is still open, so the group is not fully confirmed.
  assert.equal(cell.allConfirmed, false);
});

test("a group is fully confirmed only when every member confirmed", () => {
  const roster: RosterEntry[] = [
    {
      id: "1",
      reg_no: "R1",
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: "GROUP 3",
      group_confirmed_at: "2026-11-01T10:00:00Z",
    },
    {
      id: "2",
      reg_no: "R2",
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: "GROUP 3",
      group_confirmed_at: "2026-11-02T10:00:00Z",
    },
  ];
  const report = buildSeminarReports(roster)[0];
  const cell = report.male[2];
  assert.equal(cell.confirmed, 2);
  assert.equal(cell.allConfirmed, true);
  assert.equal(report.confirmedGroups, 1);
  assert.equal(report.confirmedStudents, 2);
});

test("an empty group is never reported as all confirmed", () => {
  const report = buildSeminarReports([
    { id: "1", reg_no: "R1", semina: "SEMINA 1", gender: "Mwanaume", student_group: "GROUP 2" },
  ])[0];
  assert.equal(report.male[0].allConfirmed, false);
  assert.equal(report.male[0].confirmed, 0);
  // GROUP 1 is empty: nobody to confirm, so it is not "all confirmed".
  assert.equal(report.male[1].allConfirmed, false);
});

test("a confirmed seat is not moved when the plan is recomputed", () => {
  // The confirmed student sits in GROUP 9, far from where a fresh plan would put them.
  // Confirming must keep them there even though the planner would otherwise move them.
  const roster: RosterEntry[] = [
    {
      id: "locked",
      reg_no: "R1",
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: "GROUP 9",
      group_confirmed_at: "2026-11-01T10:00:00Z",
    },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `new${i}`,
      reg_no: `RN${i}`,
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: null,
    })),
  ];
  const plan = planAssignments(roster);
  const moves = planMoves(roster, plan);
  assert.equal(plan.groups["locked"], "GROUP 9");
  assert.equal(moves.has("locked"), false);
  // The eight newcomers still get seated; the lock costs nobody a place.
  assert.equal(moves.size, 8);
});

test("a confirmed seat is left alone even when its stored group is unusable", () => {
  // A real group name is kept as it stands, so the case worth pinning is a junk value:
  // the planner would correct it, but a confirmed seat is frozen regardless.
  const roster: RosterEntry[] = [
    {
      id: "free",
      reg_no: "R1",
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: "ASSIGMENT 1 KUBADILISHA",
    },
    {
      id: "locked",
      reg_no: "R2",
      semina: "SEMINA 1",
      gender: "Mwanaume",
      student_group: "ASSIGMENT 1 KUBADILISHA",
      group_confirmed_at: "2026-11-01T10:00:00Z",
    },
  ];
  const plan = planAssignments(roster);
  const moves = planMoves(roster, plan);
  // Nothing is confirmed about the first seat, so the plan is free to place it.
  assert.ok(GROUP_NAMES.includes(moves.get("free")?.student_group ?? ""));
  // The second is confirmed, so it stays exactly where the student left it.
  assert.equal(moves.has("locked"), false);
});

test("findMyGroup reports whether the student's own seat is confirmed", () => {
  const roster: RosterEntry[] = [
    {
      id: "1",
      reg_no: "MUM2025-04-13988",
      full_name: "A",
      semina: "SEMINA 1",
      gender: "Mwanamke",
      student_group: "GROUP 1",
    },
    {
      id: "2",
      reg_no: "MUM2025-04-15550",
      full_name: "B",
      semina: "SEMINA 1",
      gender: "Mwanamke",
      student_group: "GROUP 1",
      group_confirmed_at: "2026-11-01T10:00:00Z",
    },
  ];
  assert.equal(findMyGroup(roster, "MUM2025-04-13988")?.confirmed, false);
  assert.equal(findMyGroup(roster, "MUM2025-04-15550")?.confirmed, true);
});

/* --- open seats for one cohort --------------------------------------------- */

const year2 = (n: number, semina: string, gender: string, opts: { group?: string } = {}) =>
  cohort(semina, gender, n, opts).map((s, i) => ({
    ...s,
    id: `y2-${semina}-${gender}-${i}`,
    study_year: 2,
    academic_year: "2026/2027",
  }));

test("a group that fills its eight seats is dropped from the open list", () => {
  const roster = year2(8, "SEMINA 1", "Mwanaume");
  const seats = openSeatsForCohort(roster, { studyYear: 2, academicYear: "2026/2027" });
  const seminar = seats.find((s) => s.semina === "SEMINA 1");
  assert.equal(seminar, undefined, "the only group is full, so no seminar is offered");
});

test("a group with room is offered, with the free count", () => {
  const roster = year2(5, "SEMINA 1", "Mwanaume");
  const seats = openSeatsForCohort(roster, { studyYear: 2, academicYear: "2026/2027" });
  const seminar = seats.find((s) => s.semina === "SEMINA 1");
  assert.ok(seminar);
  assert.equal(seminar.male[0].free, 3);
  assert.equal(seminar.female.length, 0);
});

test("a missing academic year is not a mismatch", () => {
  const roster = year2(3, "SEMINA 1", "Mwanaume").map((s) => ({ ...s, academic_year: null }));
  assert.equal(isInCohort(roster[0], { studyYear: 2, academicYear: "2026/2027" }), true);
});

test("a different academic year is a mismatch", () => {
  const roster = year2(3, "SEMINA 1", "Mwanaume").map((s) => ({
    ...s,
    academic_year: "2025/2026",
  }));
  assert.equal(isInCohort(roster[0], { studyYear: 2, academicYear: "2026/2027" }), false);
});

test("a different study year is a mismatch", () => {
  const roster = year2(3, "SEMINA 1", "Mwanaume").map((s) => ({ ...s, study_year: 3 }));
  assert.equal(isInCohort(roster[0], { studyYear: 2 }), false);
});

test("fullness is measured against the whole roster, not the cohort", () => {
  // The group physically holds eight people across every year. Counting only year 2 would
  // offer a seat in a group that is already full.
  const otherYear = cohort("SEMINA 1", "Mwanaume", 5).map((s, i) => ({
    ...s,
    id: `y1-${i}`,
    study_year: 3,
  }));
  const mine = year2(3, "SEMINA 1", "Mwanaume").map((s, i) => ({ ...s, id: `mine-${i}` }));
  const seats = openSeatsForCohort([...otherYear, ...mine], { studyYear: 2 });
  const seminar = seats.find((s) => s.semina === "SEMINA 1");
  // All eight land in GROUP 1 through the planner, so nothing is open.
  assert.equal(seminar, undefined);
});

test("a seminar with no year-2 student is not offered", () => {
  const other = cohort("SEMINA 2", "Mwanaume", 2).map((s, i) => ({
    ...s,
    id: `o-${i}`,
    study_year: 3,
  }));
  const mine = year2(2, "SEMINA 1", "Mwanaume").map((s, i) => ({ ...s, id: `m-${i}` }));
  const seats = openSeatsForCohort([...other, ...mine], { studyYear: 2 });
  assert.deepEqual(
    seats.map((s) => s.semina),
    ["SEMINA 1"],
  );
});

test("an empty cohort yields no seats rather than every group", () => {
  const roster = cohort("SEMINA 1", "Mwanaume", 3).map((s, i) => ({
    ...s,
    id: `x-${i}`,
    study_year: 4,
  }));
  assert.deepEqual(openSeatsForCohort(roster, { studyYear: 2 }), []);
});

test("openGroupNamesFor answers for one seminar and gender, null when absent", () => {
  const roster = year2(2, "SEMINA 1", "Mwanaume");
  const seats = openSeatsForCohort(roster, { studyYear: 2 });
  const names = openGroupNamesFor(seats, "SEMINA 1", "male");
  assert.ok(names && names.length > 0);
  assert.equal(openGroupNamesFor(seats, "SEMINA 9", "male"), null);
  assert.equal(openGroupNamesFor(seats, null, "male"), null);
});

test("openSeatsAsReports keeps the cells the exporters read", () => {
  const roster = year2(2, "SEMINA 1", "Mwanaume");
  const reports = openSeatsAsReports(openSeatsForCohort(roster, { studyYear: 2 }));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].semina, "SEMINA 1");
  assert.equal(reports[0].male[0].free, 6);
  assert.equal(reports[0].totalGroups, reports[0].male.length + reports[0].female.length);
});
