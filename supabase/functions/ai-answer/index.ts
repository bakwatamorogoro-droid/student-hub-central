/**
 * Model-reference answers and study help, on OpenRouter.
 *
 * Two jobs, both about *understanding a question* rather than matching words:
 *
 *  - `question` alone: write the model answer for an exam question the teacher
 *    left without a reference answer. The exam page calls this when a
 *    short-answer question has no `correct_answer`, then grades the student
 *    against the answer this returns. Without it, such a question has nothing to
 *    grade against but the student's own words.
 *  - `question` + `studentAnswer`: help a student who is stuck, without writing
 *    their answer for them. This is the AI-assist half of the request.
 *
 * The assist mode is deliberately constrained. This is a graded exam, so the
 * prompt refuses to produce a finished answer and instead explains the idea and
 * asks a leading question — the same thing a teacher does when a hand goes up.
 * A model that simply writes the answer would make the exam meaningless.
 */

import { chat, json, preflight, readBody } from "../_shared/openrouter.ts";
import { cacheKey, noteCacheHit, readCache, spend, writeCache } from "../_shared/aiCache.ts";

const SYSTEM_REFERENCE = `Wewe ni mwalimu wa Islamic Studies. Andika jibu la marejeo kwa swali lifuatalo, ambalo mwalimu hakuacha jibu sahihi.

KANUNI:
1. Jibu kwa Kiswahili, sentensi 1-3, sahihi na kamili.
2. Jibu liwe la kiwango cha mtihani: mambo muhimu yote yaliyoulizwa, bila kuongeza mengi yasiyoulizwa.
3. Kama nimekupa "Mambo muhimu", hakikisha jibu lako linashughulikia KILA moja — ni rubriki ya mada hii.
4. Usibuni ushahidi. Usitaje aya ya Qur'an au hadith ambayo hujui kwa hakika.
5. Toa jibu tu, bila utangulizi kama "Jibu ni..."`;

const SYSTEM_ASSIST = `Wewe ni mwalimu msaidizi wa Islamic Studies. Mwanafunzi amekwama kwenye swali la mtihani.

KANUNI KALI:
1. USIANDIKE jibu kamili la mwanafunzi. Hii ni mtihani — kumwandikia ni kumdhulumu.
2. Eleza DHANA au kanuni inayohitajika, kwa sentensi 1-2.
3. Uliza swali moja linalomwongoza afikirie mwenyewe.
4. Kama swali linahitaji kukumbuka kitu maalum (mfano idadi ya suras), toa kidokezo kuhusu wapi pa kuangalia, sio jibu.
5. Kuwa mfupi na wa kirafiki. Kiswahili.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const question = String(body.question ?? "").trim();
  const context = String(body.context ?? "").trim();
  const studentAnswer = String(body.studentAnswer ?? "").trim();
  // The knowledge bank's own rubric words, when the caller has them. Handing
  // these in keeps the reference answer on the class's material instead of
  // wandering into general Islamic knowledge — the same grounding the tutor
  // uses. Empty for a question the bank could not place.
  const keyPoints: string[] = Array.isArray(body.keyPoints)
    ? body.keyPoints.map((k) => String(k)).filter(Boolean)
    : [];
  const mode = body.mode === "assist" || studentAnswer ? "assist" : "reference";

  if (!question) return json({ error: "question is required" }, 400);

  // Reference answers are the same for every student who meets the question, so
  // this is the call the cache saves the most on: one request per question per
  // exam, not one per student.
  const key = await cacheKey(`answer-${mode}`, { question, context, studentAnswer, keyPoints });
  const hit = await readCache(key);
  if (hit) {
    void noteCacheHit();
    return json({ ...hit, cached: true });
  }

  const budget = await spend();
  if (!budget.allowed) {
    return json(
      { error: "ai_quota_exhausted", detail: "Daily free-tier request limit reached" },
      429,
    );
  }

  if (mode === "assist") {
    const r = await chat(
      [
        { role: "system", content: SYSTEM_ASSIST },
        {
          role: "user",
          content: `Swali la mtihani: ${question}${context ? `\nMuktadha: ${context}` : ""}${
            studentAnswer ? `\nNilichoandika hadi sasa: ${studentAnswer}` : ""
          }\n\nNisaidie nifikirie, bila kuniandikia jibu.`,
        },
      ],
      { maxTokens: 400 },
    );
    if (!r.ok) return json({ error: "ai_unavailable", reason: r.reason, detail: r.detail }, 503);
    const response = { answer: r.text, mode, model: r.model };
    void writeCache(key, response, `answer-${mode}`, r.model);
    return json(response);
  }

  const r = await chat(
    [
      { role: "system", content: SYSTEM_REFERENCE },
      {
        role: "user",
        content: `Swali: ${question}${context ? `\nMuktadha: ${context}` : ""}${
          keyPoints.length ? `\nMambo muhimu: ${JSON.stringify(keyPoints)}` : ""
        }`,
      },
    ],
    { maxTokens: 500 },
  );
  if (!r.ok) return json({ error: "ai_unavailable", reason: r.reason, detail: r.detail }, 503);
  const response = { answer: r.text, mode, model: r.model };
  void writeCache(key, response, `answer-${mode}`, r.model);
  return json(response);
});
