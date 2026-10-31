// AI grading: hii ni safu ya 1 — injini ya ndani inayojua Islamic Studies, kwa
// hiyo mwalimu hahitaji kuandika jibu sahihi kwa kila swali. Safu ya 2 ni edge
// function `ai-grade-short` (Lovable AI Gateway) pale key inapatikana.

import { supabase } from "@/integrations/supabase/client";
import { gradeLocally, type GradeResult } from "@/lib/ai-grader";

export type GradeInput = {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  points: number;
  concepts?: string[];
};

export async function gradeShortAnswer(input: GradeInput): Promise<GradeResult> {
  const studentAnswer = (input.studentAnswer || "").trim();

  // Safu ya 1: injini ya ndani. Inatoa alama mara moja, bila mtandao, na
  // inajua dhana za Islamic Studies hata mwalimu akiacha jibu wazi.
  const local = gradeLocally({
    question: input.question,
    correctAnswer: input.correctAnswer,
    studentAnswer,
    points: input.points,
    concepts: input.concepts,
  });

  if (!studentAnswer) return local;

  // Safu ya 2: mfumo wa nje, pale key ipo. Linaboresha lugha ya maelezo lakini
  // halipindui uamuzi wa ndani kwa kiasi kikubwa.
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
        feedback: String(d.feedback || local.feedback),
        concepts: Array.isArray(d.concepts) ? d.concepts : local.concepts,
        isCorrect: typeof d.isCorrect === "boolean" ? d.isCorrect : local.isCorrect,
        local: false,
      };
    }
  } catch {
    /* endelea na alama za ndani */
  }

  return local;
}

// Eleza kwa nini jibu la MCQ / Kweli-Si kweli / matching ni sahihi au si sahihi.
export async function explainAnswer(input: {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
}): Promise<string> {
  const local = gradeLocally({
    question: input.question,
    correctAnswer: input.correctAnswer,
    studentAnswer: input.studentAnswer,
    points: 1,
    knownCorrect: input.isCorrect,
  });
  if (!String(input.studentAnswer || "").trim()) return local.feedback;

  try {
    const { data, error } = await supabase.functions.invoke("ai-grade-short", {
      body: { ...input, knownCorrect: input.isCorrect, points: 1 },
    });
    if (!error && (data as any)?.feedback) return String((data as any).feedback);
  } catch {
    /* endelea na maelezo ya ndani */
  }
  return local.feedback;
}
