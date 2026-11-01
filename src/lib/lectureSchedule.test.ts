import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eatDateKey,
  eatWeekday,
  formatCountdown,
  isLectureOpen,
  lectureDateKey,
  lectureWindow,
  msUntilLecture,
  nextLectureWindow,
} from "./lectureSchedule.ts";

/** 2026-10-30 ni Ijumaa. 07:00 EAT = 04:00Z, 10:00 EAT = 07:00Z. */
const FRI = "2026-10-30";
const at = (iso: string) => new Date(iso);

test("EAT is a flat UTC+3, so the date key does not depend on the host timezone", () => {
  // 22:30Z is already 01:30 the next day in EAT.
  assert.equal(eatDateKey(at("2026-10-29T22:30:00Z")), "2026-10-30");
  assert.equal(eatDateKey(at("2026-10-29T20:59:00Z")), "2026-10-29");
});

test("2026-10-30 really is a Friday, and the window is 07:00–10:00 EAT", () => {
  assert.equal(eatWeekday(at(`${FRI}T09:00:00+03:00`)), 5);
  const w = lectureWindow(at(`${FRI}T09:00:00+03:00`));
  assert.equal(w.dateKey, FRI);
  assert.equal(w.opensAt, `${FRI}T04:00:00.000Z`);
  assert.equal(w.closesAt, `${FRI}T07:00:00.000Z`);
});

test("the lecture is open from 07:00 up to but not including 10:00", () => {
  assert.equal(isLectureOpen(at(`${FRI}T06:59:59+03:00`)), false);
  assert.equal(isLectureOpen(at(`${FRI}T07:00:00+03:00`)), true);
  assert.equal(isLectureOpen(at(`${FRI}T09:59:59+03:00`)), true);
  // The close is exclusive, so 10:00 sharp is over.
  assert.equal(isLectureOpen(at(`${FRI}T10:00:00+03:00`)), false);
});

test("any day of the week resolves to the Friday that owns it", () => {
  // Monday and Wednesday point forward to the same Friday.
  assert.equal(lectureDateKey(at("2026-10-26T12:00:00+03:00")), FRI);
  assert.equal(lectureDateKey(at("2026-10-28T12:00:00+03:00")), FRI);
  // Saturday and Sunday both belong to the coming Friday. A lecture that has
  // closed is behind us, so the next one is what a caller is asking about.
  assert.equal(lectureDateKey(at("2026-10-31T12:00:00+03:00")), "2026-11-06");
  assert.equal(lectureDateKey(at("2026-11-01T12:00:00+03:00")), "2026-11-06");
});

test("Friday resolves to itself, before, during and after the lecture", () => {
  for (const h of ["05:00", "08:00", "23:00"]) {
    assert.equal(lectureDateKey(at(`${FRI}T${h}:00+03:00`)), FRI);
  }
});

test("a Friday lecture is never open on any other day", () => {
  const others = [
    "2026-10-26T08:00:00+03:00", // Monday
    "2026-10-27T08:00:00+03:00", // Tuesday
    "2026-10-28T08:00:00+03:00", // Wednesday
    "2026-10-29T08:00:00+03:00", // Thursday
    "2026-10-31T08:00:00+03:00", // Saturday
    "2026-11-01T08:00:00+03:00", // Sunday
  ];
  for (const iso of others) assert.equal(isLectureOpen(at(iso)), false, iso);
});

test("once Friday's lecture closes, the next one is a week out", () => {
  const afterClose = at(`${FRI}T11:00:00+03:00`);
  const next = nextLectureWindow(afterClose);
  assert.equal(next.dateKey, "2026-11-06");
  assert.equal(msUntilLecture(afterClose), next.opensAtMs - afterClose.getTime());
});

test("msUntilLecture is zero while a lecture is open", () => {
  assert.equal(msUntilLecture(at(`${FRI}T08:30:00+03:00`)), 0);
});

test("the countdown never reports negative time", () => {
  assert.equal(formatCountdown(-5000), "sasa hivi");
  assert.equal(formatCountdown(0), "sasa hivi");
  assert.match(formatCountdown(3 * 3600_000 + 12 * 60_000), /saa 3/);
  assert.match(formatCountdown(45_000), /sekunde 45/);
});

test("a Monday counts down to that same week's Friday, not one a week later", () => {
  const monday = at("2026-10-26T09:00:00+03:00");
  const ms = msUntilLecture(monday);
  // Monday 09:00 EAT -> Friday 07:00 EAT is 3 days 22 hours.
  assert.equal(ms, (3 * 24 + 22) * 3600_000);
});
