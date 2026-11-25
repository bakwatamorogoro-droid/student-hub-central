import assert from "node:assert/strict";
import test from "node:test";

import { countdownSeconds, URGENT_BELOW_SECONDS } from "./countdown.ts";

test("countdownSeconds renders hours, minutes and seconds", () => {
  assert.equal(countdownSeconds(0).clock, "00:00:00");
  assert.equal(countdownSeconds(59).clock, "00:00:59");
  assert.equal(countdownSeconds(60).clock, "00:01:00");
  assert.equal(countdownSeconds(3599).clock, "00:59:59");
  assert.equal(countdownSeconds(3600).clock, "01:00:00");
  assert.equal(countdownSeconds(7384).clock, "02:03:04");
});

test("an exam longer than a day still shows its hours", () => {
  assert.equal(countdownSeconds(25 * 3600).clock, "25:00:00");
});

test("the parts match the clock face", () => {
  const c = countdownSeconds(3661);
  assert.deepEqual([c.totalSeconds, c.hours, c.minutes, c.seconds], [3661, 1, 1, 1]);
});

test("the countdown never reports negative time", () => {
  assert.deepEqual(countdownSeconds(-5), {
    totalSeconds: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    clock: "00:00:00",
    urgent: false,
    expired: true,
  });
});

test("a non-finite count is treated as expired rather than NaN", () => {
  assert.equal(countdownSeconds(NaN).clock, "00:00:00");
  assert.equal(countdownSeconds(NaN).expired, true);
});

test("fractions floor, so the clock never reads a second the student has not got", () => {
  assert.equal(countdownSeconds(59.9).seconds, 59);
});

test("urgent covers the last five minutes but not the moment of expiry", () => {
  assert.equal(countdownSeconds(URGENT_BELOW_SECONDS + 1).urgent, false);
  assert.equal(countdownSeconds(URGENT_BELOW_SECONDS).urgent, true);
  assert.equal(countdownSeconds(1).urgent, true);
  assert.equal(countdownSeconds(0).urgent, false);
  assert.equal(countdownSeconds(0).expired, true);
});
