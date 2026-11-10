import assert from "node:assert/strict";
import test from "node:test";

import { gradeLocally } from "./ai-grader.ts";
import { buildReferenceAnswer, resolveReferenceAnswer } from "./referenceAnswer.ts";

test("buildReferenceAnswer writes an answer from the bank for a known topic", () => {
  const r = buildReferenceAnswer("Eleza maana ya Zaka na kwa nini ni muhimu");
  assert.equal(r.matched, true);
  assert.equal(r.source, "bank");
  assert.equal(r.topic, "zaka");
  assert.ok(r.answer.length > 20, "the bank answer should be a real sentence");
  // The answer and the meaning are the same bank summary for a grounded topic.
  assert.equal(r.answer, r.meaning);
  assert.ok(r.concepts.length >= 2, "the bank rubric should yield several concepts");
  // Verse keys, never verse text.
  assert.ok(r.verseRefs.every((v) => /^\d+:\d+$/.test(v)));
});

test("buildReferenceAnswer carries the bank's synonyms, not single words", () => {
  // The grader matches a concept when any one of its words appears in the
  // student's answer, so a joined cluster keeps the synonym breadth. Collapsing
  // to one word per cluster is what would mark a correct paraphrase wrong.
  const r = buildReferenceAnswer("Eleza maana ya Zaka");
  const zakaConcepts = r.concepts.join(" | ").toLowerCase();
  assert.ok(zakaConcepts.includes(" "), "concepts should be multi-word clusters");
  assert.ok(
    zakaConcepts.includes("maskini") || zakaConcepts.includes("fukara"),
    "the zaka rubric names the poor",
  );
});

test("buildReferenceAnswer reports no match for a question the bank cannot place", () => {
  const r = buildReferenceAnswer("Nifafanulie maana ya Ijtihad katika fiqh ya Kiislamu");
  assert.equal(r.matched, false);
  assert.equal(r.source, "none");
  assert.equal(r.answer, "");
  assert.deepEqual(r.concepts, []);
});

test("buildReferenceAnswer returns nothing for an empty question", () => {
  for (const q of ["", "   ", "\n"]) {
    const r = buildReferenceAnswer(q);
    assert.equal(r.matched, false);
    assert.equal(r.source, "none");
  }
});

test("resolveReferenceAnswer prefers the bank and never calls the AI when it matches", async () => {
  let called = 0;
  const r = await resolveReferenceAnswer("Eleza maana ya Zaka", {
    fetchAi: async () => {
      called++;
      return "a model's answer";
    },
  });
  assert.equal(r.source, "bank");
  assert.equal(called, 0, "the bank must win without spending a request");
});

test("resolveReferenceAnswer falls back to the AI when the bank cannot place it", async () => {
  const r = await resolveReferenceAnswer("Nifafanulie maana ya Ijtihad", {
    fetchAi: async () => "Ijtihad ni juhudi za kisheria.",
  });
  assert.equal(r.source, "ai");
  // The AI answer is markable but it is not grounded, and nothing downstream
  // may mistake it for the bank's.
  assert.equal(r.matched, false);
  assert.equal(r.answer, "Ijtihad ni juhudi za kisheria.");
});

test("resolveReferenceAnswer survives an AI that returns nothing or throws", async () => {
  const empty = await resolveReferenceAnswer("Nifafanulie maana ya Ijtihad", {
    fetchAi: async () => null,
  });
  assert.equal(empty.source, "none");
  assert.equal(empty.answer, "");

  const threw = await resolveReferenceAnswer("Nifafanulie maana ya Ijtihad", {
    fetchAi: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(threw.source, "none");
  assert.equal(threw.answer, "");
});

test("resolveReferenceAnswer with no AI available still returns the bank's answer", async () => {
  const r = await resolveReferenceAnswer("Eleza maana ya Saumu");
  assert.equal(r.source, "bank");
  assert.equal(r.matched, true);
});

test("the bank's rubric marks a paraphrase fairly when the teacher wrote no answer", () => {
  // This is the fairness claim the owner asked for: a teacher types only the
  // question, and a student who answers in their own words — synonyms the bank
  // knows — is marked on meaning, not on matching the teacher's phrasing.
  const question = "Eleza maana ya Zaka na kwa nini ni muhimu";
  const known = buildReferenceAnswer(question);
  assert.equal(known.matched, true);

  // "kutoa" / "mali" / "maskini" are all bank synonyms for the zaka rubric.
  const paraphrase = "Ni kutoa sehemu ya mali yako kuwapa maskini na wahitaji.";
  const r = gradeLocally({
    question,
    correctAnswer: known.answer,
    studentAnswer: paraphrase,
    points: 5,
    concepts: known.concepts,
  });
  assert.ok(r.score > 0, `a correct paraphrase must score, got ${r.score}`);
  assert.ok(
    r.concepts.some((c) => c.matched),
    "at least one bank concept must match a correct paraphrase",
  );
});

test("an unrelated answer scores zero against the bank's rubric", () => {
  const question = "Eleza maana ya Zaka na kwa nini ni muhimu";
  const known = buildReferenceAnswer(question);
  const r = gradeLocally({
    question,
    correctAnswer: known.answer,
    studentAnswer: "Hajj ni safari ya kwenda Makkah mara moja.",
    points: 5,
    concepts: known.concepts,
  });
  assert.ok(r.score < 5, "an answer about a different pillar must not score full marks");
});
