// AI grading: kwanza inaita edge function `ai-grade-short` (Lovable AI Gateway)
// kuelewa MAANA ya jibu la mwanafunzi. Ikishindwa, hutumia fallback ya
// token-overlap ili kila mwanafunzi apate alama.

import { supabase } from "@/integrations/supabase/client";

type ConceptResult = { concept: string; matched: boolean; reason?: string };

export type GradeInput = {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  points: number;
  concepts?: string[];
};

// Simple deterministic fallback: token-overlap scoring so the AI ALWAYS
// produces an answer for every student, even when the LLM/API key is missing
// or the gateway returns an error. Avoids leaving submissions unconfirmed.
function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}
function fallbackGrade(
  correctAnswer: string,
  studentAnswer: string,
  points: number,
  conceptsList?: string[],
) {
  const studentTokens = new Set(normalize(studentAnswer));
  if (studentTokens.size === 0) {
    return {
      score: 0,
      feedback: "Hakuna jibu lililotolewa.",
      concepts: (conceptsList || []).map((c) => ({ concept: c, matched: false })),
    };
  }
  if (Array.isArray(conceptsList) && conceptsList.length > 0) {
    const results: ConceptResult[] = conceptsList.map((c) => {
      const tokens = normalize(c);
      const need = Math.max(1, Math.ceil(tokens.length / 2));
      const hit = tokens.filter((t) => studentTokens.has(t)).length;
      return { concept: c, matched: hit >= need, reason: `maneno ${hit}/${tokens.length}` };
    });
    const matched = results.filter((r) => r.matched).length;
    const score = Number(((matched / conceptsList.length) * points).toFixed(2));
    return {
      score,
      feedback: `Concepts ${matched}/${conceptsList.length} (alama za moja kwa moja, bila AI).`,
      concepts: results,
    };
  }
  const correctTokens = normalize(correctAnswer);
  if (correctTokens.length === 0) return { score: 0, feedback: "Hakuna jibu sahihi.", concepts: [] };
  const hit = correctTokens.filter((t) => studentTokens.has(t)).length;
  const ratio = hit / correctTokens.length;
  const score = Number((ratio * points).toFixed(2));
  return {
    score,
    feedback: `Maneno yaliyolingana ${hit}/${correctTokens.length} (alama za moja kwa moja, bila AI).`,
    concepts: [] as ConceptResult[],
  };
}

export async function gradeShortAnswer(input: GradeInput) {
  const studentAnswer = (input.studentAnswer || "").trim();
  if (!studentAnswer) {
    return fallbackGrade(input.correctAnswer, studentAnswer, input.points, input.concepts);
  }
  try {
    const { data, error } = await supabase.functions.invoke("ai-grade-short", {
      body: {
        question: input.question,
        correctAnswer: input.correctAnswer,
        studentAnswer,
        points: input.points,
        concepts: input.concepts || [],
      },
    });
    if (!error && data && typeof (data as any).score === "number") {
      const d: any = data;
      return {
        score: Number(d.score) || 0,
        feedback: String(d.feedback || ""),
        concepts: Array.isArray(d.concepts) ? d.concepts : [],
      };
    }
  } catch {
    /* fall through */
  }
  return fallbackGrade(input.correctAnswer, studentAnswer, input.points, input.concepts);
}
