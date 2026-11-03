import { test } from "node:test";
import assert from "node:assert/strict";
import { GRACE_MS, canEditSeat, formatGrace, graceRemainingMs, seatState } from "./groupLock.ts";

const NOW = Date.parse("2026-11-03T10:00:00.000Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

test("a seat that was never confirmed is open", () => {
  assert.equal(seatState(null, NOW), "open");
  assert.equal(seatState(undefined, NOW), "open");
  assert.equal(canEditSeat(null, NOW), true);
});

test("an unparseable stamp is treated as open rather than locking the student out", () => {
  assert.equal(seatState("not-a-date", NOW), "open");
  assert.equal(canEditSeat("not-a-date", NOW), true);
});

test("just confirmed is inside the window", () => {
  assert.equal(seatState(at(0), NOW), "grace");
  assert.equal(canEditSeat(at(0), NOW), true);
});

test("59 minutes in is still inside the window", () => {
  assert.equal(seatState(at(59 * 60 * 1000), NOW), "grace");
});

test("exactly one hour in is locked", () => {
  // The database compares with `<= now() - interval '1 hour'`, so the boundary must
  // fall on the locked side here too, or the form would offer a dropdown the write
  // then refuses.
  assert.equal(seatState(at(GRACE_MS), NOW), "locked");
  assert.equal(canEditSeat(at(GRACE_MS), NOW), false);
});

test("long past the window is locked", () => {
  assert.equal(seatState(at(48 * 60 * 60 * 1000), NOW), "locked");
});

test("remaining time counts down and never goes negative", () => {
  assert.equal(graceRemainingMs(at(0), NOW), GRACE_MS);
  assert.equal(graceRemainingMs(at(30 * 60 * 1000), NOW), 30 * 60 * 1000);
  assert.equal(graceRemainingMs(at(GRACE_MS), NOW), 0);
  assert.equal(graceRemainingMs(at(2 * GRACE_MS), NOW), 0);
  assert.equal(graceRemainingMs(null, NOW), 0);
});

test("the countdown reads as minutes and seconds", () => {
  assert.equal(formatGrace(GRACE_MS), "60:00");
  assert.equal(formatGrace(59 * 60 * 1000 + 59 * 1000), "59:59");
  assert.equal(formatGrace(65 * 1000), "1:05");
  assert.equal(formatGrace(0), "0:00");
  assert.equal(formatGrace(-5000), "0:00");
});
