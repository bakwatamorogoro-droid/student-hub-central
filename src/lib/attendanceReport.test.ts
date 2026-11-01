import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttendanceReport,
  reportToSheet,
  slugify,
  type ReportCheckIn,
  type ReportSession,
  type ReportStudent,
} from "./attendanceReport.ts";

function session(id: string, title: string, at: string, kind: "darasa" | "semina" = "darasa"): ReportSession {
  return { id, title, kind, semina: null, studentGroup: null, startedAt: at, radiusM: 200 };
}

function checkIn(sessionId: string, studentId: string, over: Partial<ReportCheckIn> = {}): ReportCheckIn {
  return {
    sessionId,
    studentId,
    regNo: `REG-${studentId}`,
    fullName: `Mwanafunzi ${studentId}`,
    method: "qr",
    distanceM: 12,
    at: "2026-10-27T08:00:00Z",
    ...over,
  };
}

function student(id: string, name = `Mwanafunzi ${id}`): ReportStudent {
  return { studentId: id, regNo: `REG-${id}`, fullName: name, studentGroup: "A", semina: "S1" };
}

const s1 = session("s1", "Quran", "2026-10-01T08:00:00Z");
const s2 = session("s2", "Hadith", "2026-10-08T08:00:00Z");
const s3 = session("s3", "Fiqh", "2026-10-15T08:00:00Z");

test("buildAttendanceReport orders sessions oldest first", () => {
  const r = buildAttendanceReport([s3, s1, s2], [], [student("1")]);
  assert.deepEqual(
    r.sessions.map((s) => s.id),
    ["s1", "s2", "s3"],
  );
});

test("buildAttendanceReport marks attendance in the right column", () => {
  const r = buildAttendanceReport([s1, s2, s3], [checkIn("s2", "1")], [student("1")]);
  const row = r.rows[0];
  assert.deepEqual(
    row.cells.map((c) => c.present),
    [false, true, false],
  );
  assert.equal(row.attended, 1);
  assert.equal(row.total, 3);
  assert.equal(row.percent, 33);
});

test("buildAttendanceReport gives a student who never came zero", () => {
  const r = buildAttendanceReport([s1, s2], [], [student("9")]);
  assert.equal(r.rows[0].attended, 0);
  assert.equal(r.rows[0].percent, 0);
  assert.equal(r.rows[0].avgDistanceM, null);
});

test("buildAttendanceReport averages distance over attended sessions only", () => {
  const r = buildAttendanceReport(
    [s1, s2],
    [checkIn("s1", "1", { distanceM: 10 }), checkIn("s2", "1", { distanceM: 30 })],
    [student("1")],
  );
  assert.equal(r.rows[0].avgDistanceM, 20);
});

test("buildAttendanceReport ignores a check-in with no distance in the average", () => {
  const r = buildAttendanceReport(
    [s1, s2],
    [checkIn("s1", "1", { distanceM: 10 }), checkIn("s2", "1", { distanceM: null })],
    [student("1")],
  );
  assert.equal(r.rows[0].avgDistanceM, 10);
  assert.equal(r.rows[0].attended, 2);
});

test("buildAttendanceReport keeps a duplicate check-in from exceeding one per session", () => {
  const r = buildAttendanceReport(
    [s1],
    [checkIn("s1", "1"), checkIn("s1", "1")],
    [student("1")],
  );
  assert.equal(r.rows[0].attended, 1);
  assert.equal(r.rows[0].percent, 100);
});

test("buildAttendanceReport includes a student who only exists in the check-ins", () => {
  const r = buildAttendanceReport([s1], [checkIn("s1", "ghost", { fullName: "Aliyefutwa" })], []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].fullName, "Aliyefutwa");
});

test("buildAttendanceReport skips a check-in for an unknown session", () => {
  const r = buildAttendanceReport([s1], [checkIn("nope", "1")], [student("1")]);
  assert.equal(r.rows[0].attended, 0);
});

test("buildAttendanceReport totals each session across the roster", () => {
  const roster = [student("1"), student("2"), student("3")];
  const r = buildAttendanceReport([s1, s2], [checkIn("s1", "1"), checkIn("s1", "2")], roster);
  assert.equal(r.sessionTotals[0].present, 2);
  assert.equal(r.sessionTotals[0].percent, 67);
  assert.equal(r.sessionTotals[1].present, 0);
  assert.equal(r.sessionTotals[1].percent, 0);
});

test("buildAttendanceReport summarises the term", () => {
  const roster = [student("1"), student("2")];
  const r = buildAttendanceReport(
    [s1, s2],
    [checkIn("s1", "1"), checkIn("s1", "2"), checkIn("s2", "1")],
    roster,
  );
  assert.equal(r.summary.students, 2);
  assert.equal(r.summary.sessions, 2);
  assert.equal(r.summary.checkIns, 3);
  assert.equal(r.summary.bestRate, 100);
  assert.equal(r.summary.worstRate, 50);
  assert.equal(r.summary.avgRate, 75);
});

test("buildAttendanceReport handles a term with no sessions", () => {
  const r = buildAttendanceReport([], [], [student("1")]);
  assert.equal(r.rows[0].total, 0);
  assert.equal(r.rows[0].percent, 0);
  assert.equal(r.summary.avgRate, 0);
});

test("buildAttendanceReport sorts students by name", () => {
  const r = buildAttendanceReport([s1], [], [student("1", "Zainab"), student("2", "Amina")]);
  assert.deepEqual(
    r.rows.map((x) => x.fullName),
    ["Amina", "Zainab"],
  );
});

test("reportToSheet carries the totals and the P markers", () => {
  const r = buildAttendanceReport(
    [s1, s2],
    [checkIn("s1", "1", { distanceM: 42 })],
    [student("1", "Amina")],
  );
  const sheet = reportToSheet(r);
  assert.equal(sheet.length, 1);
  const row = sheet[0];
  assert.equal(row.Reg, "REG-1");
  assert.equal(row.Jina, "Amina");
  assert.equal(row.Alizohudhuria, 1);
  assert.equal(row["Jumla ya Vipindi"], 2);
  assert.equal(row.Asilimia, "50%");
  const values = Object.values(row).map(String);
  assert.ok(values.includes("P (42m)"), `expected a distance marker in ${values.join("|")}`);
  assert.ok(values.includes("-"));
});

test("slugify makes a safe filename", () => {
  assert.equal(slugify("Quran / Hadith: Somo la 1"), "Quran_Hadith_Somo_la_1");
  assert.equal(slugify(""), "mahudhurio");
  assert.equal(slugify("///"), "mahudhurio");
});
