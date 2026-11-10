import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TUTOR_VERSES,
  keywordsOf,
  planTutorAnswer,
  tutorTopicLabel,
  tutorTopicSummary,
} from "./openTutor.ts";
import { TOPIC_NAMES } from "./elessonQuiz.ts";
import { TOPIC_RUBRICS } from "./islamic-knowledge.ts";

test("a clear question is matched to its topic", () => {
  const p = planTutorAnswer("Eleza maana ya Zaka katika Uislamu");
  assert.equal(p.topic, "zaka");
  assert.equal(p.matched, true);
  assert.equal(p.topicName?.sw, "Zaka");
  assert.ok(p.summary?.sw.includes("malipo"), "the summary should describe zakah");
});

test("a question in English is matched too", () => {
  assert.equal(planTutorAnswer("What is the meaning of salah?").topic, "sala");
  assert.equal(planTutorAnswer("Explain the pillars of iman").topic, "iman");
});

test("an Arabic term is matched through the transliteration index", () => {
  assert.equal(planTutorAnswer("ما معنى الزكاة").topic, "zaka");
  assert.equal(planTutorAnswer("اشرح الحج").topic, "hajj");
});

test("an unmatched question says so instead of inventing an answer", () => {
  const p = planTutorAnswer("Nini maana ya kompyuta katika sayansi?");
  assert.equal(p.matched, false);
  assert.equal(p.topic, null);
  assert.equal(p.summary, null);
  assert.deepEqual(p.verseRefs, []);
  // It still offers the question's own words as search terms.
  assert.ok(p.searchTerms.length > 0);
});

test("an empty question is not matched and does not throw", () => {
  const p = planTutorAnswer("   ");
  assert.equal(p.matched, false);
  assert.deepEqual(p.searchTerms, []);
});

test("every matched topic carries key points from the bank", () => {
  for (const topic of Object.keys(TOPIC_RUBRICS)) {
    const p = planTutorAnswer(topic);
    assert.equal(p.topic, topic, `"${topic}" should match itself`);
    assert.ok(p.keyPoints.length > 0, `${topic} should have key points`);
    for (const point of p.keyPoints) {
      const cluster = TOPIC_RUBRICS[topic].find((c) => c.includes(point));
      assert.ok(cluster, `${topic}: "${point}" should come from its own rubric`);
    }
  }
});

test("every verse reference is a plausible sura:aya key", () => {
  for (const [topic, refs] of Object.entries(TUTOR_VERSES)) {
    assert.ok(TOPIC_RUBRICS[topic], `${topic} should be a real topic`);
    for (const ref of refs) {
      const m = /^(\d+):(\d+)$/.exec(ref);
      assert.ok(m, `${topic}: "${ref}" should look like sura:aya`);
      const sura = Number(m![1]);
      const aya = Number(m![2]);
      assert.ok(sura >= 1 && sura <= 114, `${ref}: sura out of range`);
      assert.ok(aya >= 1, `${ref}: aya must be positive`);
    }
  }
});

test("every topic has an explanation in both languages", () => {
  for (const topic of Object.keys(TOPIC_RUBRICS)) {
    assert.ok(tutorTopicSummary(topic, "sw"), `${topic} needs a Swahili summary`);
    assert.ok(tutorTopicSummary(topic, "en"), `${topic} needs an English summary`);
  }
});

test("topic labels fall back to the key rather than rendering undefined", () => {
  assert.equal(tutorTopicLabel("zaka", "sw"), "Zaka");
  assert.equal(tutorTopicLabel("zaka", "en"), "Zakah (almsgiving)");
  assert.equal(tutorTopicLabel("not_a_topic", "sw"), "not_a_topic");
  assert.equal(tutorTopicSummary("not_a_topic", "sw"), null);
});

test("the knowledge bank and the lesson names agree on every topic", () => {
  // The tutor shows TOPIC_NAMES and the lesson quiz shows the same names; a
  // topic in one and not the other would render a bare key to a student.
  for (const topic of Object.keys(TOPIC_RUBRICS)) {
    assert.ok(TOPIC_NAMES[topic], `${topic} is missing from TOPIC_NAMES`);
  }
  for (const topic of Object.keys(TOPIC_NAMES)) {
    assert.ok(TOPIC_RUBRICS[topic], `${topic} is in TOPIC_NAMES but not the bank`);
  }
});

test("keywords drop stopwords and keep the meaningful words, longest first", () => {
  const k = keywordsOf("Eleza maana ya Zaka na kwa nini ni muhimu katika Uislamu");
  assert.ok(!k.includes("na"), "stopword kept");
  assert.ok(!k.includes("ya"), "stopword kept");
  assert.ok(k.includes("zaka"), "the subject word was dropped");
  assert.ok(k.includes("uislamu"), "a meaningful word was dropped");
  for (let i = 1; i < k.length; i++) {
    assert.ok(k[i - 1].length >= k[i].length, "keywords should be longest first");
  }
});

test("keywords are de-duplicated", () => {
  const k = keywordsOf("zaka zaka ZAKA zaka");
  assert.deepEqual(k, ["zaka"]);
});

test("a topic mentioned twice in one question is not matched twice", () => {
  const p = planTutorAnswer("Zaka ni nini? Eleza zaka kwa ufupi.");
  assert.equal(p.topic, "zaka");
  assert.equal(p.searchTerms.filter((t) => t === "zaka").length, 1);
});

test("the search terms lead with the topic, so course material on it ranks first", () => {
  const p = planTutorAnswer("Eleza maana ya Saumu");
  assert.equal(p.searchTerms[0], "saumu");
});
