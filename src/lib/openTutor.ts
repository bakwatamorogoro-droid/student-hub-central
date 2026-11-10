/**
 * OpenTutor — the planning half.
 *
 * The owner asked for a tutor that "answers meaningful questions, explaining
 * according to books and various sources". This file is the honest version of
 * that: it works out *what* the question is about, and assembles the material
 * the page then shows. It does no network work at all, so `node --test` covers
 * it without a browser or a key.
 *
 * The division of labour matters, because this is an Islamic Studies app and a
 * wrong citation is not a cosmetic bug — attributing a sentence to the Qur'an
 * that is not in it, or to the Prophet a hadith he did not say, is a serious
 * harm in front of a class. So:
 *
 *   - Explanations come from the knowledge bank (`islamic-knowledge.ts`), which
 *     holds the words that mean each of the 28 topics in Swahili, English and
 *     Arabic. Nothing here is invented; the prose describes what the topic
 *     covers.
 *   - Scripture is *never* written by this file. It returns verse *keys* only,
 *     and `quranApi.ts` fetches the actual text from api.quran.com. A verse that
 *     cannot be fetched is shown as a link and nothing more — see the note on
 *     `TUTOR_VERSES` below.
 *   - There is no hadith citation anywhere in this file. The two large hadith
 *     collections could not be verified against a source at the time this was
 *     written, and an unverifiable hadith reference is worse than none. The
 *     Qur'an references here were each checked against the API.
 *
 * The AI layer is deliberately optional and lives outside this file: when a
 * gateway key is configured the page asks it to *phrase* an answer from the
 * material gathered here, but the material itself is retrieved first. That is
 * the same two-layer shape `grading.functions.ts` already uses.
 */

import { TOPIC_NAMES } from "./elessonQuiz.ts";
import { clustersForQuestion, normalizeArabic, topicsForQuestion } from "./islamic-knowledge.ts";

/**
 * Qur'an references per topic, as `sura:aya` keys.
 *
 * Every key was fetched from `api.quran.com` and confirmed to return text
 * before being listed. That check is the point of keeping this as bare keys:
 * if a key were wrong the page would fall back to a link, not to a made-up
 * translation. Add a key only after doing the same check.
 */
export const TUTOR_VERSES: Record<string, string[]> = {
  preserve: ["15:9"],
  hadith: ["59:7"],
  quran: ["2:2"],
  sunnah: ["33:21", "4:59"],
  sala: ["2:238", "4:103"],
  zaka: ["9:60"],
  saumu: ["2:183", "2:185"],
  hajj: ["2:196", "3:97"],
  tawhid: ["112:1", "2:163"],
  iman: ["2:177", "4:136"],
  nikah: ["30:21", "4:3"],
  talaq: ["65:1", "2:229"],
  mirath: ["4:11", "4:12"],
  sharia: ["5:48"],
  wudu: ["5:6"],
  malaika: ["2:98", "66:6"],
  jannah: ["47:15"],
  jahannam: ["4:145"],
  qiyama: ["99:1", "75:1"],
  hijra: ["4:100", "9:20"],
  khulafa: ["24:55"],
  adabu: ["17:23", "49:13"],
  elimu: ["96:1", "20:114"],
  ibada: ["51:56"],
  toba: ["39:53"],
  dua: ["2:186", "40:60"],
  shukrani: ["2:152", "14:7"],
  saburi: ["2:153"],
};

/** A one-line explanation of each topic, in both languages. */
const TOPIC_SUMMARY: Record<string, { sw: string; en: string }> = {
  preserve: {
    sw: "Kuhifadhi Qur'an na Sunnah ni jinsi Qur'an na mafundisho ya Mtume zilivyokaririwa, zikaandikwa, zikafundishwa na kukusanywa vizazi kwa vizazi.",
    en: "Preserving the Qur'an and Sunnah is how the revelation and the Prophet's teaching were memorised, written down, taught and compiled from one generation to the next.",
  },
  hadith: {
    sw: "Hadith ni ripoti za maneno, matendo na kukiri za Mtume Muhammad, zikipitishwa kwa mfululizo wa wapokeaji.",
    en: "Hadith are reports of the words, actions and approvals of the Prophet Muhammad, handed down through a chain of narrators.",
  },
  quran: {
    sw: "Qur'an ni ufunuo wa Allah kwa Mtume Muhammad kupitia malaika Jibril, katika sura 114 na aya nyingi.",
    en: "The Qur'an is the revelation of Allah to the Prophet Muhammad through the angel Jibril, in 114 suras.",
  },
  sunnah: {
    sw: "Sunnah ni maneno, matendo na mifano ya Mtume inayofuatwa na Waislamu, ikiwa ni chanzo cha pili cha sheria baada ya Qur'an.",
    en: "The Sunnah is the Prophet's words, actions and example, followed by Muslims and the second source of law after the Qur'an.",
  },
  sala: {
    sw: "Swala ni ibada ya nyakati tano kwa siku, ikifanywa baada ya udhu, kuelekea Qibla.",
    en: "Salah is the five daily prayers, performed after wudu and facing the qibla.",
  },
  zaka: {
    sw: "Zaka ni malipo ya lazima kutoka mali inayozidi nisabu, yakitolewa kwa makundi yaliyotajwa.",
    en: "Zakah is the obligatory payment from wealth above the nisab, given to the categories named in the Qur'an.",
  },
  saumu: {
    sw: "Saumu ni kujizuia kula na kunywa kuanzia alfajiri hadi magharibi, hasa katika mwezi wa Ramadan.",
    en: "Sawm is abstaining from food and drink from dawn until sunset, chiefly in the month of Ramadan.",
  },
  hajj: {
    sw: "Hajj ni safari ya ibada kwenda Makkah, inayofanywa mara moja katika maisha kwa anayeweza.",
    en: "Hajj is the pilgrimage to Makkah, performed once in a lifetime by those who are able.",
  },
  tawhid: {
    sw: "Tawhid ni kuamini umoja wa Allah — kwamba Yeye ni mmoja, wa pekee, na hakuna anayeshiriki naye.",
    en: "Tawhid is belief in the oneness of Allah — that He is one, alone, with no partner.",
  },
  iman: {
    sw: "Imani ni kuamini misingi sita: Allah, malaika, vitabu, mitume, Siku ya Mwisho na qadr.",
    en: "Iman is belief in the six articles: Allah, the angels, the books, the messengers, the Last Day and divine decree.",
  },
  nikah: {
    sw: "Nikah ni ndoa ya Kiislamu inayohitaji ridhaa, wali, mahari na mashahidi.",
    en: "Nikah is the Islamic marriage contract, requiring consent, a guardian, a dowry and witnesses.",
  },
  talaq: {
    sw: "Talaq ni kutengana kwa ndoa kwa masharti yaliyowekwa, ikifuatiwa na iddah ya kungoja.",
    en: "Talaq is divorce under the conditions the law sets, followed by the waiting period of iddah.",
  },
  mirath: {
    sw: "Mirath ni mgawanyo wa urithi kwa sehemu zilizoainishwa katika Qur'an, baada ya wasiya na madeni.",
    en: "Mirath is the distribution of inheritance in the shares fixed in the Qur'an, after any bequest and debts.",
  },
  sharia: {
    sw: "Sharia ni sheria ya Kiislamu inayotokana na Qur'an, Sunnah, ijma na qiyas.",
    en: "Sharia is Islamic law, derived from the Qur'an, the Sunnah, consensus and analogical reasoning.",
  },
  wudu: {
    sw: "Wudu ni kujisafisha kwa maji kabla ya swala: uso, mikono, kichwa na miguu.",
    en: "Wudu is ablution with water before prayer: the face, the arms, the head and the feet.",
  },
  malaika: {
    sw: "Malaika ni viumbe vilivyoumbwa kwa nur, wasioasi, wanaotekeleza amri za Allah.",
    en: "Angels are beings created from light who do not disobey, and who carry out the commands of Allah.",
  },
  jannah: {
    sw: "Jannah ni bustani ya pepo, malipo ya wema yenye mito na furaha ya milele.",
    en: "Jannah is paradise, the reward of the righteous, with rivers and eternal joy.",
  },
  jahannam: {
    sw: "Jahannam ni moto wa adhabu kwa waovu na wale waliokataa amri za Allah.",
    en: "Jahannam is the fire of punishment for the wicked and those who rejected the commands of Allah.",
  },
  qiyama: {
    sw: "Qiyama ni Siku ya Mwisho: kufufuliwa, kuhesabiwa na malipo ya thawabu au adhabu.",
    en: "Qiyama is the Day of Judgement: resurrection, reckoning, and the reward or punishment that follows.",
  },
  hijra: {
    sw: "Hijra ni kuhama kwa Mtume na Maswahaba kutoka Makkah kwenda Madinah, mwaka 622.",
    en: "The Hijra is the migration of the Prophet and his Companions from Makkah to Madinah in 622 CE.",
  },
  khulafa: {
    sw: "Khulafa ni makhalifa wanne walioongoza baada ya Mtume: Abubakar, Umar, Uthman na Ali.",
    en: "The Khulafa are the four caliphs who led after the Prophet: Abu Bakr, Umar, Uthman and Ali.",
  },
  adabu: {
    sw: "Adabu ni maadili mema — heshima kwa wazazi, walimu na watu wote.",
    en: "Adabu is good conduct — respect for parents, teachers and all people.",
  },
  elimu: {
    sw: "Elimu ni kujifunza na kufundisha, na ni wajibu kwa kila Mwislamu.",
    en: "Elimu is learning and teaching, and it is an obligation on every Muslim.",
  },
  ibada: {
    sw: "Ibada ni kumwabudu Allah peke yake, kwa unyenyekevu na ikhlasi.",
    en: "Ibada is worshipping Allah alone, with humility and sincerity.",
  },
  toba: {
    sw: "Toba ni kurejea kwa Allah: kuacha dhambi, kujuta, na kuazimia kutokurudia.",
    en: "Toba is turning back to Allah: leaving the sin, regretting it, and resolving not to return to it.",
  },
  dua: {
    sw: "Dua ni kumwomba Allah, na Yeye ameahidi kujibu anayeomba.",
    en: "Dua is supplication to Allah, who has promised to answer the one who asks.",
  },
  shukrani: {
    sw: "Shukrani ni kutambua na kuthamini neema za Allah kwa maneno na matendo.",
    en: "Shukrani is acknowledging and appreciating the blessings of Allah in word and deed.",
  },
  saburi: {
    sw: "Saburi ni uvumilivu katika shida na majaribio, ukimtegemea Allah.",
    en: "Saburi is patience in hardship and trial, trusting in Allah.",
  },
};

export type TutorLang = "sw" | "en";

export type TutorPlan = {
  question: string;
  /** The knowledge-bank topic that matched, or null. */
  topic: string | null;
  /** Display name of the topic, when one matched. */
  topicName: { sw: string; en: string } | null;
  /** The one-line explanation, when a topic matched. */
  summary: { sw: string; en: string } | null;
  /** The ideas a good answer should name — the bank's own rubric words. */
  keyPoints: string[];
  /** Verse keys for the page to resolve. Never verse text. */
  verseRefs: string[];
  /** Search terms for the course material, best first. */
  searchTerms: string[];
  /** Self-check questions. */
  followUps: { sw: string; en: string }[];
  /** `false` when the bank recognised nothing — the page says so plainly. */
  matched: boolean;
};

/** Words too common to be useful when searching the course material. */
const STOPWORDS = new Set([
  "na",
  "ya",
  "kwa",
  "wa",
  "ni",
  "katika",
  "kuhusu",
  "nini",
  "eleza",
  "taja",
  "the",
  "of",
  "and",
  "is",
  "in",
  "what",
  "explain",
  "about",
  "a",
  "an",
  "to",
  "maana",
  "meaning",
  "kati",
  "kama",
  "vipi",
  "how",
  "why",
  "kwanini",
]);

/** The question's own meaningful words, longest first. */
export function keywordsOf(question: string, limit = 8): string[] {
  const words = normalizeArabic(question)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  // Longest first: a long Swahili noun is far more selective than a short one.
  const seen = new Set<string>();
  return [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .slice(0, limit)
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
}

/** The key points of a topic, from the bank's rubric clusters. */
function keyPointsFor(topic: string, limit = 5): string[] {
  const out: string[] = [];
  for (const cluster of clustersForQuestion(topic)) {
    const term = cluster.find((t) => t.trim().length > 1) || cluster[0];
    if (term && !out.includes(term)) out.push(term);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Work out what a question is about and gather the material to answer it.
 *
 * When the bank recognises nothing, `matched` is false and the plan carries
 * only the question's own keywords — the page tells the student it could not
 * place the question rather than bluffing an answer. That is the behaviour
 * `elessonQuiz.ts` chose for the same reason.
 */
export function planTutorAnswer(question: string): TutorPlan {
  const q = question.trim();
  const topics = topicsForQuestion(q, 3);
  const topic = topics[0] ?? null;

  if (!topic) {
    return {
      question: q,
      topic: null,
      topicName: null,
      summary: null,
      keyPoints: [],
      verseRefs: [],
      searchTerms: keywordsOf(q),
      followUps: [
        {
          sw: "Ni mada gani ya Islamic Studies unayouliza? Mfano: swala, zaka, tawhid.",
          en: "Which Islamic Studies topic are you asking about? For example: salah, zakah, tawhid.",
        },
      ],
      matched: false,
    };
  }

  const name = TOPIC_NAMES[topic] ?? { sw: topic, en: topic };
  const related = topics.slice(1);

  return {
    question: q,
    topic,
    topicName: name,
    summary: TOPIC_SUMMARY[topic] ?? null,
    keyPoints: keyPointsFor(topic),
    verseRefs: TUTOR_VERSES[topic] ?? [],
    // The topic's own names first, then the question's words, then the other
    // topics the question touched — so a lesson on the same subject ranks high.
    searchTerms: [...new Set([topic, name.sw.toLowerCase(), ...keywordsOf(q), ...related])],
    followUps: [
      {
        sw: `Eleza maana ya ${name.sw} na mambo yake muhimu.`,
        en: `Explain what ${name.en} means and its key points.`,
      },
      {
        sw: `Ni ushahidi gani wa Qur'an kuhusu ${name.sw}?`,
        en: `What is the evidence from the Qur'an about ${name.en}?`,
      },
      {
        sw: `${name.sw} inahusiana vipi na maisha ya kila siku ya Mwislamu?`,
        en: `How does ${name.en} relate to the daily life of a Muslim?`,
      },
    ],
    matched: true,
  };
}

/** The topic's display name, for a card heading. */
export function tutorTopicLabel(topic: string, lang: TutorLang): string {
  return TOPIC_NAMES[topic]?.[lang] ?? topic;
}

/** The one-line explanation of a topic, for the summary card. */
export function tutorTopicSummary(topic: string, lang: TutorLang): string | null {
  return TOPIC_SUMMARY[topic]?.[lang] ?? null;
}

/** The shape of a course lesson this file needs. Kept structural so the search
 *  stays testable without importing the Supabase client. */
export type TutorLesson = {
  id: string;
  title: string;
  titleEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
};

export type LessonMatch = {
  lesson: TutorLesson;
  /** How many of the plan's terms the lesson mentions. */
  score: number;
  /** The terms it did mention, for showing *why* it matched. */
  hits: string[];
};

/**
 * Rank the course lessons against a plan's search terms.
 *
 * A lesson scores on how many distinct terms it mentions, counting its title
 * twice because a title is a stronger statement of subject than a description.
 * This is the "according to books" half of the request: the tutor points at the
 * material the class actually has, rather than at a passage it invented.
 */
export function rankLessons(plan: TutorPlan, lessons: TutorLesson[], limit = 4): LessonMatch[] {
  if (plan.searchTerms.length === 0) return [];

  const out: LessonMatch[] = [];
  for (const lesson of lessons) {
    const title = `${lesson.title} ${lesson.titleEn ?? ""}`.toLowerCase();
    const body = `${lesson.description ?? ""} ${lesson.descriptionEn ?? ""}`.toLowerCase();
    const hits = plan.searchTerms.filter((t) => {
      const term = t.toLowerCase();
      return title.includes(term) || body.includes(term);
    });
    if (hits.length === 0) continue;

    const inTitle = hits.filter((t) => title.includes(t.toLowerCase())).length;
    out.push({ lesson, score: hits.length + inTitle, hits });
  }

  out.sort((a, b) => b.score - a.score || a.lesson.title.localeCompare(b.lesson.title));
  return out.slice(0, Math.max(0, limit));
}
