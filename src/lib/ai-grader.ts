/**
 * Injini ya kusahihisha majibu ya mwanafunzi kwa maana.
 *
 * Hii ndiyo "AI" ya mfumo pale ambapo huduma ya nje haipatikani. Inatambua
 * jibu sahihi kwa kutumia kanzi ya maarifa ya Islamic Studies, kwa hiyo
 * mwalimu hahitaji kuandika `correct_answer` kwa kila swali.
 *
 * Mchakato:
 *   1. Andika maandishi katika mfumo mmoja (herufi ndogo, hakuna alama).
 *   2. Panua visawe — "Mungu" na "Allah" ni kitu kimoja.
 *   3. Kata viambishi ili "kuabudu" na "abudu" vilingane.
 *   4. Pima: urari wa jibu la marejeo + ufunikaji wa dhana.
 *
 * Mfumo wa nje (Lovable AI Gateway) ukipatikana, `grading.functions.ts`
 * huutumia kwanza; hii ni uthibitisho kwamba alama zinatolewa hata bila key.
 */

import {
  clusterLabel,
  clustersForQuestion,
  normalizeArabic,
  synonymsOf,
} from "./islamic-knowledge.ts";

export type ConceptMatch = { concept: string; matched: boolean; reason?: string };

export type GradeResult = {
  score: number;
  feedback: string;
  isCorrect: boolean;
  concepts: ConceptMatch[];
  /** `true` wakati injini hii ya ndani ilitoa alama. */
  local: boolean;
};

const PREFIXES = ["ku", "kwa", "ma", "wa", "ni", "u", "i"];
const SUFFIXES = ["ni", "wa", "ya", "ao", "o"];

/** Maneno yasiyobeba maana — kuyatoa kabla ya kulinganisha. */
const STOPWORDS = new Set([
  // Kiswahili: viunganishi na viwakilishi
  "na",
  "ya",
  "wa",
  "kwa",
  "ni",
  "au",
  "hii",
  "hiyo",
  "hilo",
  "hili",
  "huyo",
  "wale",
  "hao",
  "kama",
  "pia",
  "lakini",
  "basi",
  "ndio",
  "ndiyo",
  "sio",
  "si",
  "hapo",
  "hapa",
  "kila",
  "katika",
  "hata",
  "yake",
  "wake",
  "lake",
  "zake",
  "vya",
  "vyake",
  "la",
  "cha",
  "vile",
  "huu",
  "huo",
  "huyu",
  "wewe",
  "mimi",
  "sisi",
  "nyinyi",
  "wao",
  "yeye",
  "kitu",
  "jambo",
  "bila",
  "ndani",
  "nje",
  "juu",
  "chini",
  "baada",
  "kabla",
  "sasa",
  "halafu",
  "tena",
  "kwamba",
  "kuwa",
  "ili",
  "kwa",
  "sababu",
  "jinsi",
  "namna",
  "hivyo",
  "vivyo",
  // Kiingereza: articles, prepositions, auxiliaries
  "the",
  "and",
  "of",
  "to",
  "is",
  "are",
  "was",
  "were",
  "a",
  "an",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "as",
  "that",
  "this",
  "it",
  "its",
  "be",
  "been",
  "from",
  "or",
  "but",
  "so",
  "which",
  "who",
  "whom",
  "whose",
  "what",
  "when",
  "where",
  "how",
  "why",
  "there",
  "their",
]);

/** Jibu lililo wazi kuwa mwanafunzi hajui. */
const REFUSALS =
  /^(sijui|si\s*jui|sijui\s*kabisa|no\s*idea|i\s*don'?t\s*know|idk|hakuna|none|nothing|nil|nada|-)+\s*[.!]?$/i;

/** Kata viambishi vya Kiswahili ili maumbo ya neno yalingane. */
function stem(word: string): string {
  let w = word;
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 4) {
      w = w.slice(p.length);
      break;
    }
  }
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 4) {
      w = w.slice(0, -s);
      break;
    }
  }
  return w;
}

/**
 * Neno moja kuwa mfumo mmoja unaolinganishwa: visawe vimeunganishwa, viambishi
 * vimekatwa. "Mungu", "Allah" na "Mola" wote hutoa kitu kimoja.
 */
function canon(word: string): string {
  const base = word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, "")
    .trim();
  if (!base) return "";
  const syn = synonymsOf(base);
  // Kundi la visawe linawakilishwa na neno fupi zaidi — kigezo thabiti.
  const representative = syn.size > 1 ? [...syn].sort((a, b) => a.length - b.length)[0] : base;
  return stem(representative);
}

/** Maneno muhimu ya maandishi, yamewekwa katika mfumo unaolinganishwa. */
export function tokenize(text: string): Set<string> {
  const cleaned = normalizeArabic(String(text || ""))
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ");
  const out = new Set<string>();
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    const c = canon(raw);
    if (!c || STOPWORDS.has(c) || STOPWORDS.has(raw) || c.length < 3) continue;
    out.add(c);
  }
  return out;
}

/** Kundi la dhana linapimwa kwa maneno yake yote, yakiwa na visawe. */
function matchCluster(cluster: string[], student: Set<string>): ConceptMatch {
  for (const term of cluster) {
    const want = tokenize(term);
    for (const w of want) {
      if (student.has(w)) return { concept: clusterLabel(cluster), matched: true, reason: term };
      for (const s of synonymsOf(w))
        if (student.has(stem(s))) {
          return { concept: clusterLabel(cluster), matched: true, reason: term };
        }
    }
  }
  return { concept: clusterLabel(cluster), matched: false };
}

/** Asilimia ya maneno ya jibu la marejeo yaliyotumika. */
function overlapRatio(
  reference: string,
  student: Set<string>,
): { ratio: number; hit: number; total: number } {
  const want = tokenize(reference);
  if (want.size === 0) return { ratio: 0, hit: 0, total: 0 };
  let hit = 0;
  for (const w of want) if (student.has(w)) hit++;
  return { ratio: hit / want.size, hit, total: want.size };
}

export type GradeOptions = {
  question: string;
  correctAnswer?: string;
  studentAnswer: string;
  points: number;
  concepts?: string[];
  /** Mwalimu amesema jibu ni sahihi / si sahihi — heshimu uamuzi huo. */
  knownCorrect?: boolean | null;
};

/**
 * Toa alama kwa jibu la mwanafunzi.
 *
 * Jibu la marejeo likiwepo, uzito mkubwa ni urari wa maneno yake. Lisipokuwepo,
 * alama zinatoka kwa dhana zinazotarajiwa kutoka kwa swali lenyewe — hivyo
 * swali lenye jibu lililoachwa wazi bado linapata alama za maana.
 */
export function gradeLocally(opts: GradeOptions): GradeResult {
  const points = Number(opts.points) || 1;
  const answer = String(opts.studentAnswer || "")
    .replace(/<[^>]+>/g, " ")
    .trim();

  if (opts.knownCorrect !== undefined && opts.knownCorrect !== null) {
    return {
      score: opts.knownCorrect ? points : 0,
      isCorrect: opts.knownCorrect,
      feedback: opts.knownCorrect ? "✅ Sahihi" : "❌ Si sahihi",
      concepts: [],
      local: true,
    };
  }

  if (!answer || REFUSALS.test(answer)) {
    return {
      score: 0,
      isCorrect: false,
      feedback: answer ? "❌ Jibu halikidhi swali — alama 0." : "❌ Hakuna jibu — alama 0.",
      concepts: [],
      local: true,
    };
  }

  const student = tokenize(answer);
  const reference = String(opts.correctAnswer || "").trim();
  const clusters = clustersForQuestion(opts.question, opts.concepts);
  const concepts = clusters.map((c) => matchCluster(c, student));
  const coverage = clusters.length ? concepts.filter((c) => c.matched).length / clusters.length : 0;
  const { ratio: refRatio } = reference ? overlapRatio(reference, student) : { ratio: 0 };

  let ratio: number;
  if (reference && clusters.length) ratio = 0.6 * refRatio + 0.4 * coverage;
  else if (reference) ratio = refRatio;
  else if (clusters.length) ratio = coverage;
  else ratio = 0;

  // Jibu refu lenye dhana chache bado halipasi: mwanafunzi anaweza kuandika
  // mengi bila kugusa jibu.
  const score = Number((Math.max(0, Math.min(1, ratio)) * points).toFixed(2));
  const isCorrect = score >= points * 0.6;

  const missed = concepts.filter((c) => !c.matched).map((c) => c.concept);
  const got = concepts.filter((c) => c.matched).map((c) => c.concept);
  const parts: string[] = [isCorrect ? "✅ Sahihi" : "❌ Si sahihi"];
  if (got.length) parts.push(`Umetaja: ${got.slice(0, 4).join(", ")}`);
  if (missed.length) parts.push(`Hukutaja: ${missed.slice(0, 4).join(", ")}`);
  if (!clusters.length && reference)
    parts.push(`Maneno yaliyolingana ${Math.round(refRatio * 100)}%`);

  return {
    score,
    isCorrect,
    feedback: parts.join(" — "),
    concepts,
    local: true,
  };
}
