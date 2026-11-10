/**
 * The AI half of OpenTutor, for questions the knowledge bank does not know.
 *
 * `openTutor.ts` answers from a bank of 28 topics, offline and instantly. When
 * the bank recognises nothing, the page used to stop at "I could not place this
 * question". The owner asked for OpenTutor to actually answer those, so this
 * asks the `ai-tutor-answer` edge function and renders what comes back.
 *
 * Two rules shape this file:
 *
 *  - It is *only* reached when the bank failed. The bank's answers are grounded
 *    in material the class uses; a model's are not, so the bank must win whenever
 *    it can. The page shows the two differently for the same reason.
 *  - It never throws. A tutor that breaks the page because a free model is busy
 *    is worse than one that says it does not know, so every failure becomes
 *    `null` and the page keeps its honest "not found" message.
 */

import { supabase } from "@/integrations/supabase/client";
import { parseTutorSections, type TutorSections } from "@/lib/tutorAiParse";

export type { TutorSections };

/**
 * Asks the AI tutor about a question the bank could not place.
 *
 * Returns `null` on any failure — no key, every model busy, or a malformed
 * reply — so the caller can fall back to its own message without a try/catch.
 */
export async function askTutorAi(
  question: string,
  opts: { context?: string; keyPoints?: string[]; signal?: AbortSignal } = {},
): Promise<TutorSections | null> {
  const q = question.trim();
  if (!q) return null;

  try {
    const { data, error } = await supabase.functions.invoke("ai-tutor-answer", {
      body: { question: q, context: opts.context ?? "", keyPoints: opts.keyPoints ?? [] },
      signal: opts.signal,
    });
    if (error) return null;
    const text =
      typeof (data as { explanation?: unknown })?.explanation === "string"
        ? (data as { explanation: string }).explanation
        : "";
    const sections = parseTutorSections(text);
    // A reply with no explanation is not worth showing, even if it had points.
    return sections.explanation ? sections : null;
  } catch {
    return null;
  }
}
