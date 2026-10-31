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

// Kesi halisi kutoka hifadhidata ya uzalishaji: tahajia za Kiarabu zinatofautiana
// kati ya jibu la mwalimu na la mwanafunzi.
test("Arabic transliteration variants count as the same word", () => {
  const r = gradeLocally({
    question: "Mention four classifications of Hadith based on the reliability of reporters",
    correctAnswer:
      "Sahih (authentic), Hasan (good), Dha\u2018if (weak), and Maudhu\u2018 (fabricated).",
    studentAnswer: "Sahih, Hasan, Dhaif, and Maudu (fabricated).",
    points: 1,
  });
  assert.ok(r.isCorrect, `alama ${r.score} — tahajia tofauti zilikataliwa`);
});

test("an answer echoing the question is not treated as a reference", () => {
  const q = "Mention five (5) methods that can be used to preserve the Qur\u2019an and Sunnah";
  const r = gradeLocally({
    question: q,
    correctAnswer: q,
    studentAnswer:
      "Memorisation, writing, recitation, teaching, and review of the Qur'an and Sunnah.",
    points: 3,
  });
  assert.ok(r.isCorrect, `alama ${r.score} — rubric ya mada haikutosha`);
});

test("a long reference answer does not demand full word overlap", () => {
  const r = gradeLocally({
    question: "Discuss the challenges facing contemporary Muslim societies.",
    correctAnswer:
      "INTRODUCTION One of the defining features of Islamic civilization is the integration of " +
      "knowledge and faith. Social change, economic inequality and globalisation each shape how " +
      "Muslim communities respond today. This essay examines three challenges and proposes solutions.",
    studentAnswer:
      "Social change and economic inequality are major challenges, and globalisation makes them worse.",
    points: 15,
  });
  assert.ok(r.isCorrect, `alama ${r.score}/15 — insha fupi lakini sahihi ilikataliwa`);
});

test("a wrong answer still scores nothing", () => {
  const r = gradeLocally({
    question: "What mainly determines the final classification of a Hadith?",
    correctAnswer: "the reliability and memory of the reporters",
    studentAnswer: "The colour of the paper it was written on.",
    points: 1,
  });
  assert.ok(!r.isCorrect, `alama ${r.score} — jibu baya limepita`);
});
