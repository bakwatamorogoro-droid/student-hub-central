import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canGoBack,
  canGoNext,
  clampStep,
  progressPct,
  stepCounterLabel,
  stepStates,
} from "./stepWizard.ts";

test("the current step is active, the ones before it are done", () => {
  assert.deepEqual(stepStates(3, 0), ["active", "todo", "todo"]);
  assert.deepEqual(stepStates(3, 1), ["done", "active", "todo"]);
  assert.deepEqual(stepStates(3, 2), ["done", "done", "active"]);
});

test("a two-step form never reports a third step", () => {
  assert.deepEqual(stepStates(2, 1), ["done", "active"]);
});

test("a step index outside the range is clamped, not rendered blank", () => {
  assert.equal(clampStep(9, 3), 2);
  assert.equal(clampStep(-4, 3), 0);
  assert.equal(clampStep(NaN, 3), 0);
  assert.deepEqual(stepStates(3, 9), ["done", "done", "active"]);
});

test("an empty form sits at step zero without dividing by zero", () => {
  assert.equal(clampStep(0, 0), 0);
  assert.deepEqual(stepStates(0, 0), []);
  assert.equal(progressPct(0, 0), 0);
});

test("progress runs 0 to 100 across the steps", () => {
  assert.equal(progressPct(0, 3), 0);
  assert.equal(progressPct(1, 3), 50);
  assert.equal(progressPct(2, 3), 100);
  // A single-step form is complete the moment it opens.
  assert.equal(progressPct(0, 1), 100);
});

test("the counter reads one-based", () => {
  assert.equal(stepCounterLabel(0, 3), "Hatua 1 kati ya 3");
  assert.equal(stepCounterLabel(2, 3), "Hatua 3 kati ya 3");
  assert.equal(stepCounterLabel(1, 2), "Hatua 2 kati ya 2");
});

test("back and next stop at the ends", () => {
  assert.equal(canGoBack(0, 3), false);
  assert.equal(canGoBack(1, 3), true);
  assert.equal(canGoNext(2, 3), false);
  assert.equal(canGoNext(1, 3), true);
  // Two steps: step 1 has next, step 2 does not.
  assert.equal(canGoNext(0, 2), true);
  assert.equal(canGoNext(1, 2), false);
});
