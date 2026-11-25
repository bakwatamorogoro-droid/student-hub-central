import assert from "node:assert/strict";
import test from "node:test";

import {
  describeSaveFailure,
  draftToRow,
  linesOf,
  pairsOf,
  rowToDraft,
  validateDraft,
} from "./questionDraft.ts";

test("linesOf trims, drops blanks and accepts both shapes", () => {
  assert.deepEqual(linesOf("  Tawhid \n\n Salat  \n"), ["Tawhid", "Salat"]);
  assert.deepEqual(linesOf(["a", " b ", ""]), ["a", "b"]);
  assert.deepEqual(linesOf(null), []);
  assert.deepEqual(linesOf(42), []);
});

test("pairsOf splits on the first = so answers may contain one", () => {
  assert.deepEqual(pairsOf("Quran=Kitabu cha Allah"), { Quran: "Kitabu cha Allah" });
  assert.deepEqual(pairsOf("Sum=1+1"), { Sum: "1+1" });
  assert.deepEqual(pairsOf("no separator\n=empty\nok=yes"), { ok: "yes" });
  assert.deepEqual(pairsOf({ a: 1 }), { a: "1" });
});

test("true/false needs an answer, because the column is NOT NULL", () => {
  // The form opened on this type with no answer set, which is exactly the bug:
  // the select showed "Kweli" while correct_answer stayed undefined.
  const missing = validateDraft({ question_type: "true_false", body: "Zakat ni nguzo?" });
  assert.equal(missing.correct_answer, "question_answer_required");

  const set = validateDraft({
    question_type: "true_false",
    body: "Zakat ni nguzo?",
    correct_answer: "true",
    points: 1,
  });
  assert.deepEqual(set, {});
});

test("true/false rejects an answer that is neither true nor false", () => {
  const errors = validateDraft({
    question_type: "true_false",
    body: "Q",
    correct_answer: "ndiyo",
    points: 1,
  });
  assert.equal(errors.correct_answer, "question_answer_required");
});

test("a question body is always required", () => {
  assert.equal(validateDraft({ question_type: "true_false" }).body, "question_body_required");
  assert.equal(
    validateDraft({ question_type: "true_false", body: "   " }).body,
    "question_body_required",
  );
});

test("points must be a positive number", () => {
  const base = { question_type: "true_false", body: "Q", correct_answer: "true" };
  assert.equal(validateDraft({ ...base, points: 0 }).points, "question_points_positive");
  assert.equal(validateDraft({ ...base, points: "abc" }).points, "question_points_positive");
  assert.equal(validateDraft({ ...base, points: 2 }).points, undefined);
});

test("multiple choice needs two choices and an answer among them", () => {
  const base = { question_type: "multiple_choice", body: "Q", points: 1 };
  assert.equal(validateDraft({ ...base, options: "Only one" }).options, "question_options_two");
  assert.equal(
    validateDraft({ ...base, options: "A\nB", correct_answer: "C" }).correct_answer,
    "question_answer_must_match_option",
  );
  assert.deepEqual(validateDraft({ ...base, options: "A\nB", correct_answer: "A" }), {});
});

test("duplicate choices are rejected, since one would be unselectable", () => {
  const errors = validateDraft({
    question_type: "multiple_choice",
    body: "Q",
    options: "Salat\nsalat",
    correct_answer: "Salat",
    points: 1,
  });
  assert.equal(errors.options, "question_options_duplicate");
});

test("multi select needs at least one correct pick, all among the choices", () => {
  const base = { question_type: "multi_select", body: "Q", options: "A\nB\nC", points: 1 };
  assert.equal(validateDraft(base).correct_answer, "question_answer_required");
  assert.equal(
    validateDraft({ ...base, correct_answer: "A\nD" }).correct_answer,
    "question_answer_must_match_option",
  );
  assert.deepEqual(validateDraft({ ...base, correct_answer: "A\nC" }), {});
});

test("matching needs two pairs and distinct right-hand values", () => {
  const base = { question_type: "matching", body: "Q", points: 1 };
  assert.equal(
    validateDraft({ ...base, correct_answer: "A=1" }).correct_answer,
    "question_pairs_two",
  );
  assert.equal(
    validateDraft({ ...base, correct_answer: "A=1\nB=1" }).correct_answer,
    "question_pairs_duplicate",
  );
  assert.deepEqual(validateDraft({ ...base, correct_answer: "A=1\nB=2" }), {});
});

test("ordering needs two items", () => {
  const base = { question_type: "ordering", body: "Q", points: 1 };
  assert.equal(
    validateDraft({ ...base, correct_answer: "One" }).correct_answer,
    "question_order_two",
  );
  assert.deepEqual(validateDraft({ ...base, correct_answer: "One\nTwo" }), {});
});

test("short answer needs a reference answer", () => {
  const base = { question_type: "short_answer", body: "Q", points: 1 };
  assert.equal(validateDraft(base).correct_answer, "question_answer_required");
  assert.deepEqual(validateDraft({ ...base, correct_answer: "Tawhid is..." }), {});
});

test("draftToRow stores true/false as a string and options as an array", () => {
  const result = draftToRow({
    question_type: "true_false",
    body: "  Zakat ni nguzo?  ",
    correct_answer: "true",
    points: "1",
  });
  assert.ok("row" in result);
  assert.equal(result.row.body, "Zakat ni nguzo?");
  assert.equal(result.row.correct_answer, "true");
  assert.equal(result.row.points, 1);
  assert.equal(result.row.options, null);
});

test("draftToRow converts each type to its stored shape", () => {
  const mc = draftToRow({
    question_type: "multiple_choice",
    body: "Q",
    options: "A\nB",
    correct_answer: "B",
    points: 1,
  });
  assert.ok("row" in mc);
  assert.deepEqual(mc.row.options, ["A", "B"]);
  assert.equal(mc.row.correct_answer, "B");

  const ms = draftToRow({
    question_type: "multi_select",
    body: "Q",
    options: "A\nB\nC",
    correct_answer: "A\nC",
    points: 1,
  });
  assert.ok("row" in ms);
  assert.deepEqual(ms.row.correct_answer, ["A", "C"]);

  const match = draftToRow({
    question_type: "matching",
    body: "Q",
    correct_answer: "Quran=Kitabu\nHadith=Maneno",
    points: 1,
  });
  assert.ok("row" in match);
  assert.deepEqual(match.row.correct_answer, { Quran: "Kitabu", Hadith: "Maneno" });

  const order = draftToRow({
    question_type: "ordering",
    body: "Q",
    correct_answer: "Kwanza\nPili",
    points: 1,
  });
  assert.ok("row" in order);
  assert.deepEqual(order.row.correct_answer, ["Kwanza", "Pili"]);
});

test("draftToRow refuses an invalid draft instead of writing a bad row", () => {
  const result = draftToRow({ question_type: "true_false", body: "" });
  assert.ok("error" in result);
  assert.equal(result.error, "question_body_required");
});

test("draftToRow never emits an undefined correct_answer", () => {
  // The insert failed on NOT NULL because the key was absent, not null.
  for (const type of ["true_false", "multiple_choice", "matching", "ordering", "short_answer"]) {
    const draft =
      type === "true_false"
        ? { question_type: type, body: "Q", correct_answer: "false", points: 1 }
        : type === "multiple_choice"
          ? { question_type: type, body: "Q", options: "A\nB", correct_answer: "A", points: 1 }
          : type === "matching"
            ? { question_type: type, body: "Q", correct_answer: "A=1\nB=2", points: 1 }
            : type === "ordering"
              ? { question_type: type, body: "Q", correct_answer: "A\nB", points: 1 }
              : { question_type: type, body: "Q", correct_answer: "Jibu", points: 1 };
    const result = draftToRow(draft);
    assert.ok("row" in result, `${type} should be valid`);
    assert.notEqual(result.row.correct_answer, undefined, `${type} lost its answer`);
    assert.notEqual(result.row.correct_answer, null, `${type} lost its answer`);
  }
});

test("a CHECK violation on question_type names the missing migration", () => {
  assert.equal(
    describeSaveFailure({
      code: "23514",
      message: 'violates check constraint "questions_question_type_check"',
    }),
    "question_type_not_enabled",
  );
});

test("other write failures are reported distinctly", () => {
  assert.equal(describeSaveFailure({ code: "23502" }), "question_answer_required");
  assert.equal(describeSaveFailure({ code: "42501" }), "question_save_forbidden");
  assert.equal(describeSaveFailure({ message: "boom" }), "question_save_failed");
  assert.equal(describeSaveFailure(null), "question_save_failed");
});

test("rowToDraft turns stored JSON back into the form's text", () => {
  const match = rowToDraft({
    id: "q1",
    question_type: "matching",
    body: "Unganisha",
    correct_answer: { Quran: "Kitabu cha Allah", Hadith: "Maneno ya Mtume" },
    points: 2,
  });
  assert.equal(match.correct_answer, "Quran=Kitabu cha Allah\nHadith=Maneno ya Mtume");
  assert.equal(match.id, "q1");
  assert.equal(match.points, 2);

  const order = rowToDraft({ question_type: "ordering", correct_answer: ["Kwanza", "Pili"] });
  assert.equal(order.correct_answer, "Kwanza\nPili");

  const mc = rowToDraft({
    question_type: "multiple_choice",
    options: ["A", "B"],
    correct_answer: "B",
  });
  assert.equal(mc.options, "A\nB");
  assert.equal(mc.correct_answer, "B");
});

test("a true/false row with no answer opens blank, not preselected", () => {
  // Showing "Kweli" for a question that has no answer is what let a teacher
  // save a draft the database then rejected.
  const draft = rowToDraft({ question_type: "true_false", body: "Q" });
  assert.equal(draft.correct_answer, "");
  assert.equal(validateDraft(draft).correct_answer, "question_answer_required");
});

test("a saved row round-trips back to the same row", () => {
  const original = {
    question_type: "matching",
    body: "Unganisha",
    correct_answer: "Quran=Kitabu\nHadith=Maneno",
    points: 1,
  };
  const first = draftToRow(original);
  assert.ok("row" in first);
  const back = draftToRow(rowToDraft({ ...first.row }));
  assert.ok("row" in back);
  assert.deepEqual(back.row, first.row);
});
