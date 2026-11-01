/**
 * Pure helpers shared by the exam-taking page and the exam builder.
 *
 * These live apart from the React components so they can be unit-tested under
 * `node --test`, and so the student's page and the teacher's editor agree on how a
 * stored question is read.
 *
 * The answer shapes are deliberate:
 *   true_false / multiple_choice  string
 *   multi_select                  string[]  (choose all that apply)
 *   matching                      Record<left, right>
 *   ordering                      string[]  (the student's arrangement)
 *   short_answer                  string    (may be HTML, graded by AI)
 */

export type QuestionLike = {
  id: string;
  question_type: string;
  body: string;
  points: number;
  options?: unknown;
  correct_answer?: unknown;
  concepts?: unknown;
};

/** Choices, tolerating the two shapes the builder has produced over time. */
export function readOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options.map(String).filter((s) => s.trim() !== "");
  if (typeof options === "string") {
    return options
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** The left→right pairs of a matching question. */
export function readPairs(correct: unknown): Array<[string, string]> {
  if (correct && typeof correct === "object" && !Array.isArray(correct)) {
    return Object.entries(correct as Record<string, string>).map(([k, v]) => [k, String(v)]);
  }
  if (typeof correct === "string") {
    return correct
      .split("\n")
      .map((line) => line.split("="))
      .filter((p) => p.length >= 2)
      .map((p) => [p[0].trim(), p.slice(1).join("=").trim()]);
  }
  return [];
}

/** The items of an ordering question, in the order they should end up. */
export function readOrder(correct: unknown): string[] {
  if (Array.isArray(correct)) return correct.map(String);
  if (typeof correct === "string") {
    return correct
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * A deterministic shuffle.
 *
 * Seeded by the question id so the arrangement is stable across re-renders — a
 * list that reshuffles while a student is reading it is unusable — and so every
 * student sees the same order, which keeps marking consistent.
 */
export function shuffleStable<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return Math.abs(h) / 2147483647;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How much of an answer is right, as a 0–1 ratio.
 *
 * Partial credit is the point: a matching question with three of four pairs right
 * should not score the same as one with none. `short_answer` returns 0 here
 * because the AI grader owns it.
 */
export function answerRatio(q: QuestionLike, value: unknown): number {
  switch (q.question_type) {
    case "true_false":
    case "multiple_choice":
      return String(value) === String(q.correct_answer) ? 1 : 0;

    case "multi_select": {
      const correct = new Set(readOptions(q.correct_answer));
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      if (correct.size === 0) return 0;
      let hits = 0;
      let wrong = 0;
      for (const c of chosen) {
        if (correct.has(c)) hits++;
        else wrong++;
      }
      // A wrong pick cancels a right one, so ticking every box scores nothing.
      return Math.max(0, (hits - wrong) / correct.size);
    }

    case "matching": {
      const pairs = readPairs(q.correct_answer);
      if (pairs.length === 0) return 0;
      const given = (value as Record<string, string>) || {};
      return pairs.filter(([l, r]) => given[l] === r).length / pairs.length;
    }

    case "ordering": {
      const correct = readOrder(q.correct_answer);
      const given = Array.isArray(value) ? (value as string[]) : [];
      if (correct.length === 0) return 0;
      return correct.filter((c, i) => given[i] === c).length / correct.length;
    }

    default:
      return 0;
  }
}

/** True when a question type can be marked without the AI grader. */
export function isAutoGraded(type: string): boolean {
  return ["true_false", "multiple_choice", "multi_select", "matching", "ordering"].includes(type);
}

/** The label a teacher sees for a type. */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  true_false: "Kweli / Sikweli",
  multiple_choice: "Chagua moja",
  multi_select: "Chagua zote zinazofaa",
  matching: "Unganisha (match)",
  ordering: "Panga mpangilio",
  short_answer: "Jibu la maandishi (AI)",
};

export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS);

/** A one-line hint under each type in the builder. */
export const QUESTION_TYPE_HINTS: Record<string, string> = {
  true_false: "Mwanafunzi huchagua Kweli au Sikweli.",
  multiple_choice: "Chaguzi kadhaa, jibu moja sahihi.",
  multi_select: "Chaguzi kadhaa, majibu zaidi ya moja yanawezekana.",
  matching: "Orodha ya kushoto inaunganishwa na maelezo upande wa kulia.",
  ordering: "Vipengele vinapangwa kwa mpangilio sahihi.",
  short_answer: "Jibu la maandishi — AI hulinganisha maana na jibu la mwalimu.",
};
