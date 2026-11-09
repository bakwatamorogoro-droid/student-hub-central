import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLessonQuiz,
  countQuizQuestions,
  lessonTopicLabel,
  lessonTopics,
  readLessonQuiz,
  resetLessonQuestionIds,
} from "./elessonQuiz.ts";

test("a lesson about zaka is recognised as being about zaka", () => {
  assert.ok(lessonTopics("Zaka na umuhimu wake").includes("zaka"));
});

test("a lesson about the pillars finds more than one topic", () => {
  const topics = lessonTopics("Nguzo tano za Uislamu: swala, zaka na saumu");
  assert.ok(topics.includes("sala"));
  assert.ok(topics.includes("zaka"));
  assert.ok(topics.includes("saumu"));
});

test("an unrelated title matches nothing", () => {
  assert.deepEqual(lessonTopics("Karibu kwenye channel yetu"), []);
});

test("the number of topics returned is capped", () => {
  const topics = lessonTopics("swala zaka saumu hajj tawhid iman", "", 2);
  assert.equal(topics.length, 2);
});

test("questions are produced for a recognised topic", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Somo la Zaka" });
  assert.ok(quiz.length >= 2);
  assert.equal(quiz[0].topic, "zaka");
  assert.ok(quiz[0].q.sw.length > 0);
  assert.ok(quiz[0].q.en.length > 0);
});

test("every question is bilingual", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Swala na nyakati zake" });
  for (const q of quiz) {
    assert.ok(q.q.sw.trim().length > 0, "swahili question missing");
    assert.ok(q.q.en.trim().length > 0, "english question missing");
  }
});

test("a recognised topic carries its key points", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Somo la Swala", max: 2 });
  assert.ok(quiz.some((q) => q.points.length > 0));
});

test("the English name is used in the English question", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Zaka" });
  const joined = quiz.map((q) => q.q.en).join(" ");
  assert.ok(/Zakah/i.test(joined), `expected an English topic name, got: ${joined}`);
});

test("an unrecognised lesson still gets two general questions", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Utangulizi wa channel" });
  assert.equal(quiz.length, 2);
  assert.equal(quiz[0].topic, "general");
  assert.ok(quiz[0].a.sw.includes("Utangulizi wa channel"));
});

test("an explicit topic overrides detection", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Utangulizi", topic: "hajj" });
  assert.equal(quiz[0].topic, "hajj");
});

test("max caps the question count", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "swala zaka saumu hajj", max: 3 });
  assert.equal(quiz.length, 3);
});

test("question ids are unique within a quiz", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "swala zaka saumu" });
  const ids = quiz.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the topic label is bilingual", () => {
  const label = lessonTopicLabel("Somo la Zaka");
  assert.ok(label?.sw.toLowerCase().includes("zaka"));
  assert.ok(label?.en.toLowerCase().includes("zakah"));
});

test("an unrecognised lesson has no topic label", () => {
  assert.equal(lessonTopicLabel("Habari za leo"), null);
});

test("countQuizQuestions survives a non-array", () => {
  assert.equal(countQuizQuestions(null), 0);
  assert.equal(countQuizQuestions({}), 0);
  assert.equal(countQuizQuestions([1, 2, 3]), 3);
});

test("a stored quiz round-trips through the reader", () => {
  resetLessonQuestionIds();
  const quiz = buildLessonQuiz({ title: "Somo la Zaka" });
  const read = readLessonQuiz(JSON.parse(JSON.stringify(quiz)));
  assert.equal(read.length, quiz.length);
  assert.equal(read[0].q.sw, quiz[0].q.sw);
  assert.deepEqual(read[0].points, quiz[0].points);
});

test("a damaged quiz row cannot crash the page", () => {
  assert.deepEqual(readLessonQuiz(null), []);
  assert.deepEqual(readLessonQuiz("nonsense"), []);
  assert.deepEqual(readLessonQuiz([1, null, "x"]), []);
});

test("a half-filled question falls back to the language it has", () => {
  const read = readLessonQuiz([{ id: "q1", q: { sw: "Swali" }, a: {} }]);
  assert.equal(read.length, 1);
  assert.equal(read[0].q.sw, "Swali");
  assert.equal(read[0].q.en, "Swali");
});

test("a question with no text at all is dropped", () => {
  assert.equal(readLessonQuiz([{ id: "q1", q: { sw: "  ", en: "" } }]).length, 0);
});
