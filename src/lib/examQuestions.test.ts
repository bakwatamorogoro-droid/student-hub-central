import assert from "node:assert/strict";
import test from "node:test";

import {
  answerRatio,
  isAutoGraded,
  QUESTION_TYPES,
  readOptions,
  readOrder,
  readPairs,
  shuffleStable,
  type QuestionLike,
} from "./examQuestions.ts";

function q(over: Partial<QuestionLike> = {}): QuestionLike {
  return { id: "q1", question_type: "true_false", body: "Q", points: 1, ...over };
}

test("readOptions accepts an array and a newline string", () => {
  assert.deepEqual(readOptions(["a", "b"]), ["a", "b"]);
  assert.deepEqual(readOptions("a\n b \n\nc"), ["a", "b", "c"]);
  assert.deepEqual(readOptions(null), []);
});

test("readPairs accepts an object and an equals string", () => {
  assert.deepEqual(readPairs({ Quran: "Kitabu" }), [["Quran", "Kitabu"]]);
  assert.deepEqual(readPairs("Quran=Kitabu cha Allah\nHadith=Maneno"), [
    ["Quran", "Kitabu cha Allah"],
    ["Hadith", "Maneno"],
  ]);
  assert.deepEqual(readPairs(null), []);
});

test("readPairs keeps a value that itself contains an equals sign", () => {
  assert.deepEqual(readPairs("x = a = b"), [["x", "a = b"]]);
});

test("readOrder accepts an array and a newline string", () => {
  assert.deepEqual(readOrder(["a", "b"]), ["a", "b"]);
  assert.deepEqual(readOrder("a\nb"), ["a", "b"]);
});

test("shuffleStable is deterministic for a seed", () => {
  const items = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(shuffleStable(items, "q1"), shuffleStable(items, "q1"));
  assert.notDeepEqual(shuffleStable(items, "q1"), shuffleStable(items, "q2"));
});

test("shuffleStable keeps every item and does not mutate the input", () => {
  const items = ["a", "b", "c", "d"];
  const copy = [...items];
  const out = shuffleStable(items, "seed");
  assert.deepEqual(items, copy);
  assert.deepEqual([...out].sort(), [...items].sort());
});

test("answerRatio scores true/false and single choice all or nothing", () => {
  assert.equal(answerRatio(q({ correct_answer: "true" }), "true"), 1);
  assert.equal(answerRatio(q({ correct_answer: "true" }), "false"), 0);
  assert.equal(answerRatio(q({ question_type: "multiple_choice", correct_answer: "B" }), "B"), 1);
});

test("answerRatio gives partial credit for matching", () => {
  const question = q({
    question_type: "matching",
    correct_answer: { a: "1", b: "2", c: "3", d: "4" },
  });
  assert.equal(answerRatio(question, { a: "1", b: "2", c: "3", d: "4" }), 1);
  assert.equal(answerRatio(question, { a: "1", b: "2", c: "x", d: "y" }), 0.5);
  assert.equal(answerRatio(question, {}), 0);
});

test("answerRatio gives partial credit for ordering", () => {
  const question = q({ question_type: "ordering", correct_answer: ["1", "2", "3", "4"] });
  assert.equal(answerRatio(question, ["1", "2", "3", "4"]), 1);
  assert.equal(answerRatio(question, ["1", "2", "9", "9"]), 0.5);
  assert.equal(answerRatio(question, ["9", "9", "9", "9"]), 0);
});

test("answerRatio punishes ticking every box in multi_select", () => {
  const question = q({
    question_type: "multi_select",
    correct_answer: ["a", "b"],
  });
  assert.equal(answerRatio(question, ["a", "b"]), 1);
  assert.equal(answerRatio(question, ["a"]), 0.5);
  assert.equal(answerRatio(question, ["a", "b", "c", "d"]), 0);
  assert.equal(answerRatio(question, []), 0);
});

test("answerRatio never goes below zero for multi_select", () => {
  const question = q({ question_type: "multi_select", correct_answer: ["a"] });
  assert.equal(answerRatio(question, ["x", "y", "z"]), 0);
});

test("answerRatio leaves short_answer to the AI grader", () => {
  assert.equal(answerRatio(q({ question_type: "short_answer", correct_answer: "x" }), "x"), 0);
});

test("isAutoGraded covers every machine-markable type", () => {
  for (const t of ["true_false", "multiple_choice", "multi_select", "matching", "ordering"]) {
    assert.equal(isAutoGraded(t), true, t);
  }
  assert.equal(isAutoGraded("short_answer"), false);
});

test("QUESTION_TYPES lists every type the answer field renders", () => {
  assert.deepEqual(QUESTION_TYPES, [
    "true_false",
    "multiple_choice",
    "multi_select",
    "matching",
    "ordering",
    "short_answer",
  ]);
});
