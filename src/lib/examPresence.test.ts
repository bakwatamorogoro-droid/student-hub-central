import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPresence,
  EMPTY_PRESENCE,
  formatCount,
  presenceInitials,
  presenceJitter,
  presencePollDelay,
  PRESENCE_SAMPLE,
} from "./examPresence.ts";

test("the sample is capped but the count is not", () => {
  const names = Array.from({ length: 50 }, (_, i) => ({ regNo: `R${i}`, fullName: `S ${i}` }));
  const p = buildPresence(12000, 800, names);
  assert.equal(p.sample.length, PRESENCE_SAMPLE);
  assert.equal(p.writingCount, 12000);
  assert.equal(p.finishedCount, 800);
  assert.equal(p.truncated, true);
});

test("a short sample does not lower the count and is not truncated", () => {
  const p = buildPresence(2, 0, [
    { regNo: "R1", fullName: "Amina" },
    { regNo: "R2", fullName: "Yusuf" },
  ]);
  assert.equal(p.writingCount, 2);
  assert.equal(p.sample.length, 2);
  assert.equal(p.truncated, false);
});

test("nonsense counts collapse to zero rather than NaN", () => {
  const p = buildPresence(NaN, -5, []);
  assert.equal(p.writingCount, 0);
  assert.equal(p.finishedCount, 0);
  assert.deepEqual(buildPresence(0, 0, []), EMPTY_PRESENCE);
});

test("polling slows down as the cohort grows", () => {
  assert.equal(presencePollDelay(0), 5000);
  assert.equal(presencePollDelay(199), 5000);
  assert.equal(presencePollDelay(200), 15000);
  assert.equal(presencePollDelay(1000), 30000);
  assert.equal(presencePollDelay(10000), 60000);
});

test("jitter is stable per seed and stays inside its window", () => {
  const a = presenceJitter("exam-1");
  assert.equal(a, presenceJitter("exam-1"));
  assert.ok(a >= 0 && a < 3000);
  const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((i) => presenceJitter(`exam-${i}`)));
  assert.ok(seen.size > 1, "different papers should not all share one offset");
});

test("formatCount groups thousands with a space", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1000), "1 000");
  assert.equal(formatCount(1234567), "1 234 567");
  assert.equal(formatCount(-3), "0");
});

test("initials fall back to the reg number and then to a question mark", () => {
  assert.equal(presenceInitials("Amina Hassan"), "AH");
  assert.equal(presenceInitials("Amina"), "AM");
  assert.equal(presenceInitials("", "MUM2025-04-14106"), "MU");
  assert.equal(presenceInitials("", ""), "?");
});
