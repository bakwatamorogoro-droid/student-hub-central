import assert from "node:assert/strict";
import test from "node:test";

import {
  budgetFor,
  cacheKey,
  DAILY_REQUEST_LIMIT,
  RESERVED_REQUESTS,
} from "../../supabase/functions/_shared/aiCache.ts";

test("budgetFor allows a request when nothing has been spent", () => {
  const b = budgetFor(0);
  assert.equal(b.allowed, true);
  assert.equal(b.used, 0);
  assert.equal(b.remaining, DAILY_REQUEST_LIMIT - RESERVED_REQUESTS);
});

test("budgetFor stops at the reserve, not at the raw limit", () => {
  // The reserve exists so a failed request (which still counts) cannot eat the
  // last of the quota. Spending up to `limit - reserved` is fine; one more is not.
  const spendable = DAILY_REQUEST_LIMIT - RESERVED_REQUESTS;
  assert.equal(budgetFor(spendable - 1).allowed, true);
  assert.equal(budgetFor(spendable).allowed, false);
  assert.equal(budgetFor(spendable).remaining, 0);
});

test("budgetFor never reports a negative remaining", () => {
  const b = budgetFor(DAILY_REQUEST_LIMIT * 2);
  assert.equal(b.allowed, false);
  assert.equal(b.remaining, 0);
});

test("cacheKey is stable for identical inputs", async () => {
  const parts = { question: "Zaka ni nini?", studentAnswer: "Malipo ya lazima", points: 5 };
  assert.equal(await cacheKey("grade-short", parts), await cacheKey("grade-short", parts));
});

test("cacheKey separates different kinds and different answers", async () => {
  const a = await cacheKey("grade-short", { question: "Q", studentAnswer: "A" });
  const b = await cacheKey("grade-short", { question: "Q", studentAnswer: "B" });
  const c = await cacheKey("grade-assignment", { question: "Q", studentAnswer: "A" });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("cacheKey ignores key order, so a rebuilt body still hits", async () => {
  // The two functions build the same body with different key order; a hash that
  // cared would miss every time and waste the budget.
  const a = await cacheKey("grade-short", { question: "Q", studentAnswer: "A", points: 5 });
  const b = await cacheKey("grade-short", { points: 5, studentAnswer: "A", question: "Q" });
  assert.equal(a, b);
});

test("cacheKey is a hex sha256", async () => {
  const key = await cacheKey("tutor", { question: "Q" });
  assert.match(key, /^[0-9a-f]{64}$/);
});
