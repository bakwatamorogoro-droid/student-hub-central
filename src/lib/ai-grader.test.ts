import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeLocally, tokenize } from "./ai-grader.ts";
import { clustersForQuestion, normalizeArabic, synonymsOf } from "./islamic-knowledge.ts";

test("tokenize treats synonyms as one word", () => {
  // "Mungu", "Allah" na "Mola" ni kitu kimoja, kwa hiyo hutoa token moja.
  assert.deepEqual([...tokenize("Allah")], [...tokenize("Mungu")]);
  assert.deepEqual([...tokenize("Mola")], [...tokenize("Allah")]);
  assert.deepEqual([...tokenize("Mtume")], [...tokenize("Nabii")]);
});

test("tokenize drops stopwords and short noise", () => {
  const t = tokenize("na ya kwa wa ni katika");
  assert.equal(t.size, 0);
});

test("a short word is not merged into a longer unrelated one", () => {
  // "na" ni kituo, "iman" ni neno la maana. Haviunganishwi.
  assert.notDeepEqual([...tokenize("na")], [...tokenize("iman")]);
  assert.equal(tokenize("na").size, 0);
});

test("tokenize stems Swahili verb forms", () => {
  // "kuabudu" na "abudu" ni kitendo kimoja.
  assert.deepEqual([...tokenize("kuabudu")], [...tokenize("abudu")]);
});

test("normalizeArabic maps Arabic script to a known term", () => {
  assert.match(normalizeArabic("الله"), /allah/);
  assert.match(normalizeArabic("الصلاة"), /sala/);
});

test("synonymsOf finds the whole group for a known term", () => {
  const s = synonymsOf("allah");
  assert.ok(s.has("mungu"));
  assert.ok(s.has("mola"));
});

test("clustersForQuestion infers concepts from the question text alone", () => {
  // Mwalimu hajaweka dhana; mfumo unazipata kutoka kwa mada ya swali.
  const c = clustersForQuestion("Eleza maana ya Hadith katika Uislamu.");
  assert.ok(c.length > 0, "inapaswa kupata makundi");
  assert.ok(c.some((cluster) => cluster.includes("maneno") || cluster.includes("mtume")));
});

test("clustersForQuestion prefers explicit concepts when given", () => {
  assert.deepEqual(clustersForQuestion("swali lolote", ["A", "B"]), [["A"], ["B"]]);
});

test("a correct answer in different words still scores full marks", () => {
  // Swali la Hadith; mwanafunzi anasema "maneno na matendo ya Mtume" — sahihi.
  const r = gradeLocally({
    question: "Hadith ni nini?",
    correctAnswer: "",
    studentAnswer: "Ni maneno na matendo ya Mtume Muhammad.",
    points: 10,
  });
  assert.ok(r.score >= 6, `alama ${r.score} zilipaswa kupita 6`);
  assert.equal(r.isCorrect, true);
  assert.equal(r.local, true);
});

test("an answer that misses the topic scores low", () => {
  const r = gradeLocally({
    question: "Hadith ni nini?",
    correctAnswer: "",
    studentAnswer: "Ni kuhusu mpira wa miguu na mashindano ya nje.",
    points: 10,
  });
  assert.ok(r.score < 6, `alama ${r.score} zilipaswa kuwa chini ya 6`);
  assert.equal(r.isCorrect, false);
});

test("an empty answer scores zero and says so", () => {
  const r = gradeLocally({
    question: "Zaka ni nini?",
    correctAnswer: "Ngawila ya mali",
    studentAnswer: "   ",
    points: 5,
  });
  assert.equal(r.score, 0);
  assert.match(r.feedback, /Hakuna jibu/);
});

test("an explicit refusal scores zero", () => {
  const r = gradeLocally({
    question: "Zaka ni nini?",
    correctAnswer: "Ngawila ya mali",
    studentAnswer: "sijui",
    points: 5,
  });
  assert.equal(r.score, 0);
});

test("a reference answer raises the score for matching wording", () => {
  const withoutRef = gradeLocally({
    question: "Zaka ni nini?",
    correctAnswer: "",
    studentAnswer: "Ngawila ya mali kwa maskini",
    points: 10,
  });
  const withRef = gradeLocally({
    question: "Zaka ni nini?",
    correctAnswer: "Ngawila ya mali kwa maskini na fukara",
    studentAnswer: "Ngawila ya mali kwa maskini",
    points: 10,
  });
  assert.ok(withRef.score >= withoutRef.score);
  assert.equal(withRef.isCorrect, true);
});

test("a known-correct flag is honoured exactly", () => {
  const yes = gradeLocally({
    question: "q",
    correctAnswer: "a",
    studentAnswer: "jibu lolote",
    points: 4,
    knownCorrect: true,
  });
  const no = gradeLocally({
    question: "q",
    correctAnswer: "a",
    studentAnswer: "jibu lolote",
    points: 4,
    knownCorrect: false,
  });
  assert.equal(yes.score, 4);
  assert.equal(no.score, 0);
});

test("the score never leaves the 0..points range", () => {
  const r = gradeLocally({
    question: "Hadith ni nini?",
    correctAnswer: "maneno matendo ya mtume muhammad",
    studentAnswer:
      "maneno matendo ya mtume muhammad mtume nabii rasuli hadith sunnah mila maneno matendo",
    points: 7,
  });
  assert.ok(r.score >= 0 && r.score <= 7, `alama ${r.score} ilitoka nje ya 0..7`);
});
