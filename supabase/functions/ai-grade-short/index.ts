/**
 * Semantic short-answer grading, on OpenRouter.
 *
 * The owner asked for AI that "understands the *meaning* of a question and
 * grades the student from what they answered". That is exactly what this
 * function does, and it is the reason it exists at all: the on-device grader in
 * `src/lib/ai-grader.ts` compares the student's words against the rubric's, which
 * is fast, private and offline but cannot tell that "Mungu" and "Allah" are the
 * same answer. A language model can.
 *
 * It is the *second* layer. The client calls the local grader first and only
 * asks this function to refine the result, so when every model here is busy the
 * student still gets a mark. This function never returns "error" for that case —
 * it returns the same shape with `ai: false` so the client can keep its own
 * verdict instead of losing it.
 *
 * Two modes, matching the two callers in `src/lib/grading.functions.ts`:
 *   - default: grade a free-text answer, return score/feedback/concepts;
 *   - `knownCorrect` set: the answer is already judged right or wrong (a
 *     multiple-choice or matching item) and the model only explains *why*.
 */

import {
  chat,
  chatJson,
  json,
  preflight,
  readBody,
  reconcileGrade,
} from "../_shared/openrouter.ts";
import { cacheKey, noteCacheHit, readCache, spend, writeCache } from "../_shared/aiCache.ts";

const SYSTEM = `Wewe ni mwalimu mtaalamu wa Islamic Studies anayetathmini majibu ya wanafunzi.

KANUNI ZAKO:
1. Tathmini kwa MAANA, sio kwa maneno yanayofanana. Mwanafunzi anaweza kutumia maneno tofauti lakini akamaanisha kitu kilekile sahihi.
2. Visawe vinavyokubalika: "Mungu"="Allah"="Mola"; "Mtume"="Nabii"="Rasuli"; "Qur'an"="Kurani"; "swala"="salah"; "zaka"="zakah"; "saumu"="swaum"; "kuhiji"="hajj".
3. Usahihi wa KISWAHILI au KIINGEREZA haujadiliwi — angalia maana, sio lugha.
4. Jibu lisilo na maana yoyote sahihi linapata 0, hata likiwa na maneno yanayofanana.
5. Usibuni ushahidi. Usitaje aya ya Qur'an au hadith ambayo hujui kwa hakika.
6. Kuwa mkali lakini wa haki: jibu lenye maana sahihi lakini pungufu linapata alama ya kati.

JIBU TU kwa JSON sahihi, bila maandishi mengine:
{ "score": number, "feedback": string, "isCorrect": boolean, "concepts": [{"concept": string, "matched": boolean}] }

feedback: sentensi 1-2 kwa Kiswahili.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const question = String(body.question ?? "").trim();
  const correctAnswer = String(body.correctAnswer ?? "").trim();
  const studentAnswer = String(body.studentAnswer ?? "").trim();
  const points = Number(body.points ?? 1);
  const knownCorrect = typeof body.knownCorrect === "boolean" ? body.knownCorrect : null;
  const concepts: string[] = Array.isArray(body.concepts)
    ? body.concepts.map((c) => String(c))
    : [];

  // An empty answer is decided here, not by a model: spending a request from a
  // shared daily quota to be told "nothing was written" would be wasteful.
  if (!studentAnswer) {
    return json({
      score: 0,
      feedback: "Hakuna jibu lililotolewa.",
      isCorrect: false,
      concepts: concepts.map((c) => ({ concept: c, matched: false })),
      ai: false,
    });
  }

  // Mode 2: the verdict is already known; explain it.
  if (knownCorrect !== null) {
    const r = await chat(
      [
        { role: "system", content: "Wewe ni mwalimu wa Islamic Studies." },
        {
          role: "user",
          content: `Swali: ${question}
Jibu sahihi: ${correctAnswer}
Jibu la mwanafunzi: ${studentAnswer}

Jibu hili ni ${knownCorrect ? "SAHIHI" : "SI SAHIHI"}. Eleza kwa Kiswahili kwa sentensi 1-2 KWA NINI ni ${knownCorrect ? "sahihi" : "si sahihi"}${knownCorrect ? "" : ", na jibu sahihi ni lipi"}. Toa maelezo tu, bila JSON.`,
        },
      ],
      { maxTokens: 300 },
    );

    const reason = r.ok ? r.text.slice(0, 1000) : "";
    return json({
      score: knownCorrect ? points : 0,
      isCorrect: knownCorrect,
      feedback: `${knownCorrect ? "✅ Sahihi" : "❌ Si sahihi"}${reason ? " — " + reason : ""}`,
      concepts: [],
      ai: r.ok,
    });
  }

  // Mode 1: grade the answer by meaning.
  const conceptsBlock = concepts.length
    ? `\nDhana muhimu zinazotakiwa: ${JSON.stringify(concepts)} (kagua kila moja kama mwanafunzi ameielezea kwa maana yoyote ile).`
    : "";

  const userPrompt = `Swali: ${question}

Jibu sahihi linalotarajiwa: ${correctAnswer || "(halijatolewa — tumia ujuzi wako wa Islamic Studies)"}
${conceptsBlock}

Jibu la mwanafunzi: ${studentAnswer}

Alama za juu: ${points}

Toa alama (0 hadi ${points}) kulingana na asilimia ya usahihi wa MAANA. isCorrect=true ikiwa alama >= ${(points * 0.6).toFixed(2)}.`;

  // Cache first. Two students who write the same answer, or one who resubmits
  // unchanged, hash the same and cost the daily budget one request between them.
  const key = await cacheKey("grade-short", {
    question,
    correctAnswer,
    studentAnswer,
    points,
    concepts,
  });
  const hit = await readCache(key);
  if (hit) {
    void noteCacheHit();
    return json({ ...hit, cached: true });
  }

  // Then the budget. Running out is not an error: the caller keeps the mark the
  // local grader already gave, and the teacher is the one who sees the queue.
  const budget = await spend();
  if (!budget.allowed) {
    return json(
      { error: "ai_quota_exhausted", detail: "Daily free-tier request limit reached", ai: false },
      429,
    );
  }

  const r = await chatJson(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
    ],
    { maxTokens: 900 },
  );

  if (!r.ok) {
    // Every model busy, or nothing parseable. Say so plainly and let the client
    // keep the mark it already has from the local grader.
    return json(
      { error: "ai_unavailable", detail: r.detail, ai: false },
      r.status === 502 ? 502 : 503,
    );
  }

  const parsed = r.data;
  const { score, isCorrect } = reconcileGrade(
    Number(parsed.score) || 0,
    typeof parsed.isCorrect === "boolean" ? parsed.isCorrect : null,
    points,
  );
  const rawFb = String(parsed.feedback ?? "").slice(0, 1000);
  const conceptsOut = Array.isArray(parsed.concepts)
    ? parsed.concepts
    : concepts.map((c) => ({ concept: c, matched: false }));

  const response = {
    score: Number(score.toFixed(2)),
    feedback: `${isCorrect ? "✅ Sahihi" : "❌ Si sahihi"}${rawFb ? " — " + rawFb : ""}`,
    isCorrect,
    concepts: conceptsOut,
    ai: true,
    model: r.model,
  };

  // Store only what the model actually produced, so a later hit is a real
  // grading rather than a re-run of a fallback.
  void writeCache(key, response, "grade-short", r.model);
  return json(response);
});
