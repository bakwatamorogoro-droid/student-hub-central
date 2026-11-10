/**
 * Deriving the model answer for a question the teacher wrote without one.
 *
 * The owner asked for this: "mwalimu anaweza kuandika swali tu, AI ikathibitishe
 * majibu… na kulinganisha na alichojibu na kumkadilia kwa haki". A teacher who
 * types only the question should still get a markable question, and the student
 * should be graded against something real.
 *
 * There are two ways to produce that answer, and this file is the first one:
 *
 *   1. **The knowledge bank.** `islamic-knowledge.ts` already knows 28 Islamic
 *      Studies topics, in Swahili, English and Arabic. When the question lands on
 *      one, the answer, the key ideas and the verse keys all come from that bank,
 *      offline, instantly, and with no quota. This is what runs for the great
 *      majority of real exam questions.
 *   2. **The AI.** `ai-answer` writes a reference answer for anything the bank
 *      cannot place. It costs one request from a shared daily quota of fifty, so
 *      it is the fallback rather than the default.
 *
 * The order matters and is not negotiable: the bank's material is grounded in
 * what the class is taught, a model's is not. `source` records which layer
 * produced the answer so the teacher and the page can say so honestly rather
 * than presenting a model's words as the bank's.
 *
 * What this file will *not* do is invent evidence. It carries `sura:aya` keys
 * for the page to resolve against `api.quran.com`, never verse text, because a
 * misquoted ayah in a graded Islamic Studies exam is a serious harm.
 */

import { clustersForQuestion, topicForQuestion } from "./islamic-knowledge.ts";
import { planTutorAnswer, tutorTopicLabel, tutorTopicSummary } from "./openTutor.ts";

/** Which layer produced the reference answer. */
export type ReferenceSource = "bank" | "ai" | "none";

export type ReferenceAnswer = {
  /** `true` when the bank could place the question and wrote the answer. */
  matched: boolean;
  /** The bank topic, when one matched. */
  topic: string | null;
  /** Display name of that topic. */
  topicName: { sw: string; en: string } | null;
  /** The model answer a student's answer is graded against. */
  answer: string;
  /** The plain-language explanation of what the answer means. */
  meaning: string;
  /**
   * The ideas a good answer must name, one string per idea.
   *
   * Each string is a whole cluster of synonyms joined by spaces — "ngawila malipo
   * kutoa" rather than just "ngawila". `ai-grader.ts` treats a concept as matched
   * when *any* word in it appears in the student's answer, so a joined cluster
   * keeps the bank's synonym breadth instead of collapsing to one word and
   * marking a correct paraphrase wrong.
   */
  concepts: string[];
  /** `sura:aya` keys for the page to fetch. Never verse text. */
  verseRefs: string[];
  source: ReferenceSource;
};

const EMPTY: ReferenceAnswer = {
  matched: false,
  topic: null,
  topicName: null,
  answer: "",
  meaning: "",
  concepts: [],
  verseRefs: [],
  source: "none",
};

/**
 * The bank's reference answer for a question, or an unmatched result.
 *
 * A `source: "none"` result is not a failure — it is the signal to the caller
 * that the AI layer should be tried instead.
 */
export function buildReferenceAnswer(question: string): ReferenceAnswer {
  const q = String(question ?? "").trim();
  if (!q) return EMPTY;

  const plan = planTutorAnswer(q);
  if (!plan.matched || !plan.topic) return EMPTY;

  const topic = plan.topic;
  const meaning = tutorTopicSummary(topic, "sw") ?? "";
  // The clusters are the bank's own rubric for this topic — the same words the
  // exam grader already marks against, so a teacher's manual marking and the
  // automatic one agree.
  const clusters = clustersForQuestion(q);
  const concepts = clusters.map((c) => c.join(" ")).filter(Boolean);

  return {
    matched: true,
    topic,
    topicName: { sw: tutorTopicLabel(topic, "sw"), en: tutorTopicLabel(topic, "en") },
    answer: meaning,
    meaning,
    concepts,
    verseRefs: plan.verseRefs,
    source: "bank",
  };
}

/**
 * Builds the reference answer for a question, preferring the bank and falling
 * back to `ai-answer`.
 *
 * The fallback is injected rather than imported so this module stays free of the
 * Supabase client and can be tested with `node --test`, and so a caller can pass
 * a stub when it wants no network at all.
 */
export async function resolveReferenceAnswer(
  question: string,
  opts: {
    context?: string;
    fetchAi?: (question: string, context: string) => Promise<string | null>;
  } = {},
): Promise<ReferenceAnswer> {
  const fromBank = buildReferenceAnswer(question);
  if (fromBank.matched) return fromBank;

  if (!opts.fetchAi) return fromBank;
  try {
    const ai = await opts.fetchAi(question, opts.context ?? "");
    if (!ai || !ai.trim()) return fromBank;
    return {
      ...EMPTY,
      // A model's answer is markable but it is not the bank's, and the page says
      // so. `matched` stays false so nothing downstream mistakes it for grounded.
      matched: false,
      answer: ai.trim(),
      meaning: ai.trim(),
      source: "ai",
    };
  } catch {
    return fromBank;
  }
}

/** The bank topic a question lands on, for callers that only need that. */
export function referenceTopicFor(question: string): string | null {
  return topicForQuestion(String(question ?? ""));
}
