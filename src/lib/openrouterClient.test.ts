import assert from "node:assert/strict";
import test from "node:test";

import { extractJson, reconcileGrade } from "../../supabase/functions/_shared/openrouter.ts";

test("extractJson parses a bare JSON object", () => {
  assert.deepEqual(extractJson('{"score": 3}'), { score: 3 });
});

test("extractJson digs the object out of surrounding prose", () => {
  // Free models routinely open with a sentence before the JSON. A bare
  // JSON.parse would throw here and the mark would be lost.
  const text = 'Sure! Here is the grade:\n{"score": 4, "isCorrect": true}\nHope that helps.';
  assert.deepEqual(extractJson(text), { score: 4, isCorrect: true });
});

test("extractJson handles a fenced code block", () => {
  const text = '```json\n{"score": 2}\n```';
  assert.deepEqual(extractJson(text), { score: 2 });
});

test("extractJson keeps nested objects intact", () => {
  const text = '{"score": 5, "concepts": [{"concept": "zaka", "matched": true}]}';
  assert.deepEqual(extractJson(text), {
    score: 5,
    concepts: [{ concept: "zaka", matched: true }],
  });
});

test("extractJson is not confused by braces inside strings", () => {
  // A feedback sentence containing a brace must not end the scan early, or the
  // parse fails and the whole answer is dropped.
  const text = '{"feedback": "use {braces} carefully", "score": 1}';
  assert.deepEqual(extractJson(text), { feedback: "use {braces} carefully", score: 1 });
});

test("extractJson returns null when there is no object", () => {
  assert.equal(extractJson("I cannot help with that."), null);
});

test("extractJson returns null on malformed JSON", () => {
  assert.equal(extractJson('{"score": }'), null);
});

// ------------------------------------------------------------- reconcileGrade

test("reconcileGrade lifts a correct verdict that scored zero", () => {
  // The exact case seen in testing: every concept matched, isCorrect true, score
  // 0. A correct student must not be given nothing.
  const r = reconcileGrade(0, true, 5);
  assert.equal(r.isCorrect, true);
  assert.equal(r.score, 3); // the pass mark, 60% of 5
});

test("reconcileGrade keeps a genuinely correct high score untouched", () => {
  assert.deepEqual(reconcileGrade(5, true, 5), { score: 5, isCorrect: true });
});

test("reconcileGrade holds a wrong verdict below the pass mark", () => {
  // A model that says "wrong" but writes a passing number is contradicting
  // itself; the verdict wins so the student is not credited by accident.
  const r = reconcileGrade(5, false, 5);
  assert.equal(r.isCorrect, false);
  assert.ok(r.score < 3, `expected below pass mark, got ${r.score}`);
});

test("reconcileGrade lets the score decide when no verdict is given", () => {
  assert.deepEqual(reconcileGrade(4, null, 5), { score: 4, isCorrect: true });
  assert.deepEqual(reconcileGrade(1, null, 5), { score: 1, isCorrect: false });
});

test("reconcileGrade clamps a score outside the point range", () => {
  assert.equal(reconcileGrade(99, null, 5).score, 5);
  assert.equal(reconcileGrade(-4, null, 5).score, 0);
});

test("reconcileGrade survives a NaN score", () => {
  const r = reconcileGrade(Number.NaN, null, 5);
  assert.equal(r.score, 0);
  assert.equal(r.isCorrect, false);
});
