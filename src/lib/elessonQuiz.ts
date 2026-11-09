/**
 * Study questions for a lesson.
 *
 * The owner asked for questions "the system works out from the link". What is
 * honest here is this: the app cannot watch the video. YouTube, TikTok and
 * Facebook give a title, an author and nothing else without a paid transcript
 * API, and this project has no AI key at runtime (`LOVABLE_API_KEY` is unset on
 * the live project and the edge functions are not deployed). Pretending to have
 * understood the video would produce confident nonsense in front of a class.
 *
 * So the questions are built from what the lesson actually declares — its title
 * and its description — matched against the Islamic Studies knowledge bank that
 * already grades the exams (`islamic-knowledge.ts`). That bank knows 28 topics
 * and the words that mean each of them in Swahili, English and Arabic, so a
 * lesson called "Nguzo tano za Uislamu" reliably yields questions about the
 * pillars, in both languages, with the key points a student should be able to
 * name. It is a study aid derived from the lesson's own words, and the admin
 * edits it before it is published.
 *
 * Kept free of imports beyond the knowledge bank so `node --test` covers it.
 */

import { clustersForQuestion, synonymsOf, TOPIC_RUBRICS } from "./islamic-knowledge.ts";

export type LessonQuestion = {
  id: string;
  /** The question, both languages. */
  q: { sw: string; en: string };
  /** A model answer, both languages. */
  a: { sw: string; en: string };
  /** The ideas a good answer should mention — the markable part. */
  points: string[];
  /** Which knowledge-bank topic produced it. */
  topic: string;
};

/** Swahili and English names for each topic in the knowledge bank. */
const TOPIC_NAMES: Record<string, { sw: string; en: string }> = {
  preserve: { sw: "Kuhifadhi Qur'an na Sunnah", en: "Preserving the Qur'an and Sunnah" },
  hadith: { sw: "Hadith", en: "Hadith" },
  quran: { sw: "Qur'an", en: "The Qur'an" },
  sunnah: { sw: "Sunnah", en: "The Sunnah" },
  sala: { sw: "Swala", en: "Salah (prayer)" },
  zaka: { sw: "Zaka", en: "Zakah (almsgiving)" },
  saumu: { sw: "Saumu", en: "Fasting (Sawm)" },
  hajj: { sw: "Hajj", en: "Hajj (pilgrimage)" },
  tawhid: { sw: "Tawhid", en: "Tawhid (the oneness of Allah)" },
  iman: { sw: "Imani", en: "Iman (faith)" },
  nikah: { sw: "Nikah", en: "Nikah (marriage)" },
  talaq: { sw: "Talaq", en: "Talaq (divorce)" },
  mirath: { sw: "Mirath", en: "Mirath (inheritance)" },
  sharia: { sw: "Sharia", en: "Sharia (Islamic law)" },
  wudu: { sw: "Wudu", en: "Wudu (ablution)" },
  malaika: { sw: "Malaika", en: "Angels" },
  jannah: { sw: "Jannah", en: "Jannah (paradise)" },
  jahannam: { sw: "Jahannam", en: "Jahannam (hellfire)" },
  qiyama: { sw: "Qiyama", en: "The Day of Judgement" },
  hijra: { sw: "Hijra", en: "The Hijra" },
  khulafa: { sw: "Khulafa", en: "The rightly-guided caliphs" },
  adabu: { sw: "Adabu", en: "Adabu (good manners)" },
  elimu: { sw: "Elimu", en: "Knowledge and learning" },
  ibada: { sw: "Ibada", en: "Ibada (worship)" },
  toba: { sw: "Toba", en: "Toba (repentance)" },
  dua: { sw: "Dua", en: "Dua (supplication)" },
  shukrani: { sw: "Shukrani", en: "Shukrani (gratitude)" },
  saburi: { sw: "Saburi", en: "Saburi (patience)" },
};

/** The English name of a topic, or the key itself when the bank gains one. */
function topicName(topic: string): string {
  return TOPIC_NAMES[topic]?.en || topic;
}

function topicNameSw(topic: string): string {
  return TOPIC_NAMES[topic]?.sw || topic;
}

/**
 * The topics a lesson is about, best match first.
 *
 * Uses the same rule the grader uses — longest matching term wins — but keeps
 * every topic that matched rather than only the best, because a lesson can
 * legitimately cover two ("Nguzo tano: swala na zaka").
 */
export function lessonTopics(title: string, description = "", max = 3): string[] {
  const haystack = `${title} ${description}`.toLowerCase();
  if (!haystack.trim()) return [];

  const scored: { topic: string; score: number }[] = [];
  for (const topic of Object.keys(TOPIC_RUBRICS)) {
    const terms = new Set([topic, ...synonymsOf(topic)]);
    let best = 0;
    for (const t of terms) {
      if (t.length >= 3 && haystack.includes(t)) best = Math.max(best, t.length);
    }
    if (best > 0) scored.push({ topic, score: best });
  }
  scored.sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic));
  return scored.slice(0, max).map((s) => s.topic);
}

/** The key points of a topic, taken from the bank's own rubric clusters. */
function keyPoints(topic: string, limit = 5): string[] {
  const rubric = TOPIC_RUBRICS[topic] || [];
  const out: string[] = [];
  for (const cluster of rubric) {
    const term = cluster.find((t) => t.trim().length > 1) || cluster[0];
    if (term && !out.includes(term)) out.push(term);
    if (out.length >= limit) break;
  }
  return out;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `q${counter}`;
}

/** Reset the id sequence — only so tests produce stable ids. */
export function resetLessonQuestionIds(): void {
  counter = 0;
}

/**
 * The questions for one topic: what it is, what it rests on, and what it asks
 * of a Muslim. Written once per topic rather than per lesson, so two lessons on
 * zaka ask the same solid questions.
 */
function questionsForTopic(topic: string): LessonQuestion[] {
  const sw = topicNameSw(topic);
  const en = topicName(topic);
  const points = keyPoints(topic);

  const base: { q: { sw: string; en: string }; a: { sw: string; en: string } }[] = [
    {
      q: { sw: `Eleza maana ya ${sw} kwa ufupi.`, en: `Explain briefly what ${en} means.` },
      a: {
        sw: `${sw} ni mojawapo ya mada kuu za Islamic Studies. Mwanafunzi anatakiwa kuieleza kwa ufupi na kwa usahihi.`,
        en: `${en} is one of the main topics of Islamic Studies. A student should explain it briefly and correctly.`,
      },
    },
    {
      q: {
        sw: `Taja mambo muhimu yanayohusiana na ${sw}.`,
        en: `Name the key points that relate to ${en}.`,
      },
      a: {
        sw: `Mambo muhimu ni pamoja na: ${points.join(", ")}.`,
        en: `The key points include: ${points.join(", ")}.`,
      },
    },
  ];

  if (points.length > 0) {
    base.push({
      q: {
        sw: `Kwa nini ${points[0]} ni muhimu katika ${sw}?`,
        en: `Why is ${points[0]} important in ${en}?`,
      },
      a: {
        sw: `${points[0]} ni muhimu kwa sababu inaonyesha uelewa wa ${sw} na jinsi inavyotumika katika maisha ya Mwislamu.`,
        en: `${points[0]} matters because it shows an understanding of ${en} and how it applies in a Muslim's life.`,
      },
    });
  }

  return base.map((b) => ({ id: nextId(), ...b, points, topic }));
}

/**
 * Build the study questions for a lesson.
 *
 * Falls back to two general questions about the lesson itself when nothing in
 * the title matches the bank, so a lesson always has something beside the
 * player — and the admin can rewrite it. The returned list is what is stored,
 * so the admin's edits survive.
 */
export function buildLessonQuiz(input: {
  title: string;
  description?: string;
  /** Force a topic, e.g. from the admin's category choice. */
  topic?: string;
  /** Cap the number of questions. */
  max?: number;
}): LessonQuestion[] {
  const max = input.max ?? 6;
  const topics = input.topic ? [input.topic] : lessonTopics(input.title, input.description || "");

  if (topics.length === 0) {
    const title = input.title.trim() || "somo hili";
    return [
      {
        id: nextId(),
        q: {
          sw: `Somo hili linahusu nini? Eleza kwa ufupi.`,
          en: `What is this lesson about? Explain briefly.`,
        },
        a: {
          sw: `Somo linaitwa "${title}". Mwanafunzi aeleze kwa ufupi mada kuu aliyoisikia.`,
          en: `The lesson is called "${title}". The student should briefly state the main topic covered.`,
        },
        points: [],
        topic: "general",
      },
      {
        id: nextId(),
        q: {
          sw: `Ni masomo gani mawili uliyojifunza kutoka kwenye somo hili?`,
          en: `Which two lessons did you take from this lesson?`,
        },
        a: {
          sw: `Mwanafunzi ataje masomo mawili aliyojifunza na kueleza jinsi yanavyohusiana na maisha yake.`,
          en: `The student should name two lessons learned and explain how they relate to their own life.`,
        },
        points: [],
        topic: "general",
      },
    ].slice(0, max);
  }

  const out: LessonQuestion[] = [];
  for (const topic of topics) {
    for (const q of questionsForTopic(topic)) {
      if (out.length >= max) break;
      out.push(q);
    }
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The lesson's subject, for the card and the heading: the best topic's name,
 * or null when the title matched nothing in the bank.
 */
export function lessonTopicLabel(
  title: string,
  description = "",
): { sw: string; en: string } | null {
  const [topic] = lessonTopics(title, description, 1);
  if (!topic) return null;
  return { sw: topicNameSw(topic), en: topicName(topic) };
}

/** Total questions in a stored quiz blob, for a badge. */
export function countQuizQuestions(quiz: unknown): number {
  return Array.isArray(quiz) ? quiz.length : 0;
}

/**
 * Read a stored `quiz` blob into the typed shape.
 *
 * The column is free-form JSON written by the admin page, so a hand-edited row
 * must not be able to crash the student's page: anything that is not a question
 * is dropped rather than trusted.
 */
export function readLessonQuiz(raw: unknown): LessonQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: LessonQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const q = r.q as { sw?: unknown; en?: unknown } | undefined;
    const a = r.a as { sw?: unknown; en?: unknown } | undefined;
    const swQ = String(q?.sw ?? "").trim();
    const enQ = String(q?.en ?? "").trim();
    if (!swQ && !enQ) continue;
    out.push({
      id: String(r.id ?? `q${out.length + 1}`),
      q: { sw: swQ || enQ, en: enQ || swQ },
      a: { sw: String(a?.sw ?? "").trim(), en: String(a?.en ?? "").trim() },
      points: Array.isArray(r.points) ? r.points.map((p) => String(p)) : [],
      topic: String(r.topic ?? "general"),
    });
  }
  return out;
}
