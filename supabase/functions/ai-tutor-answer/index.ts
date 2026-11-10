/**
 * OpenTutor's AI layer: explain a question the knowledge bank could not place.
 *
 * The tutor page is grounded first and foremost in `src/lib/islamic-knowledge.ts`
 * and `src/lib/openTutor.ts`, which between them know 28 Islamic Studies topics
 * in Swahili, English and Arabic. When a student asks about one of those, the
 * page answers from that bank and never needs a model. This function exists for
 * the questions the bank does *not* know — a differently-worded question, a topic
 * outside the 28, or a question about the course material itself.
 *
 * The grounding rule in `AGENTS.md` is what shapes the prompt. This is an Islamic
 * Studies app in front of a class, so an invented Qur'anic citation or an
 * attributed hadith is a serious harm, not a formatting glitch. The model is
 * therefore told to:
 *
 *  - explain in its own words, and say plainly when it is not certain;
 *  - never quote the Qur'an or a hadith from memory, and never give a citation
 *    it has not been handed;
 *  - refuse to write a graded answer when the caller says this is exam help.
 *
 * The page labels anything from here as AI-generated, so the student can tell
 * the bank's answer from the model's.
 */

import { chat, json, preflight, readBody } from "../_shared/openrouter.ts";
import { cacheKey, noteCacheHit, readCache, spend, writeCache } from "../_shared/aiCache.ts";

const SYSTEM = `Wewe ni mwalimu wa Islamic Studies kwa wanafunzi wa shule.

KANUNI ZAKO — hizi ni kali, zisivunjwe:
1. Eleza kwa maneno yako mwenyewe. Usinukuu Qur'an wala hadith kwa kumbukumbu — ukitoa rejeo la kuhisiwa, unaweza kumfundisha mwanafunzi kitu kisichokuwa kweli.
2. Kama huna uhakika, sema "sina uhakika" na eleza unachojua kwa uhakika.
3. Usitaje namba ya aya, sura, wala jina la mkusanyiko wa hadith. Acha ushahidi kwa mwalimu.
4. Kama swali linahusu imani za kipekee au mgogoro wa madhehebu, eleza kwamba Waislamu wanatofautiana, bila kuchagua upande.
5. Jibu kwa Kiswahili, sentensi 3-5, rahisi kwa mwanafunzi.
6. Kama swali si la Islamic Studies, sema hivyo kwa heshima.

Muundo wa jibu lako (maandishi, sio JSON):
MAELEZO: maelezo mafupi ya jibu.
MAMBO YA KUTAJA: mambo 2-4 muhimu, kila moja kwenye mstari wake.
TAHADHARI: (hiari) chochote ambacho mwanafunzi anapaswa kukithibitisha kwa mwalimu.`;

const SYSTEM_EXAM = `Wewe ni mwalimu msaidizi wa Islamic Studies. Mwanafunzi amekwama kwenye swali la MTIHANI.

KANUNI KALI:
1. USIANDIKE jibu la mwanafunzi. Hii ni mtihani.
2. Eleza dhana au kanuni inayohitajika, sentensi 1-2.
3. Uliza swali moja linalomwongoza afikirie.
4. Usitaje aya wala hadith.
5. Kiswahili, mfupi na wa kirafiki.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const question = String(body.question ?? "").trim();
  if (!question) return json({ error: "question is required" }, 400);

  const examMode = body.mode === "exam";
  const context = String(body.context ?? "").trim();
  // The knowledge bank's own words, when the page has any. Handing these in
  // keeps the model close to the material the class actually uses instead of
  // wandering into general Islamic knowledge.
  const keyPoints: string[] = Array.isArray(body.keyPoints)
    ? body.keyPoints.map((k) => String(k))
    : [];

  const userContent = examMode
    ? `Swali la mtihani: ${question}${context ? `\nMuktadha: ${context}` : ""}\n\nNisaidie nifikirie, bila kuniandikia jibu.`
    : `Swali la mwanafunzi: ${question}${context ? `\nMuktadha wa somo: ${context}` : ""}${
        keyPoints.length ? `\nManeno muhimu ya mada: ${JSON.stringify(keyPoints)}` : ""
      }`;

  const key = await cacheKey("tutor", { question, examMode, context, keyPoints });
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

  const r = await chat(
    [
      { role: "system", content: examMode ? SYSTEM_EXAM : SYSTEM },
      { role: "user", content: userContent },
    ],
    { maxTokens: 700 },
  );

  if (!r.ok) {
    return json({ error: "ai_unavailable", reason: r.reason, detail: r.detail }, 503);
  }

  const response = { explanation: r.text, model: r.model, ai: true };
  void writeCache(key, response, "tutor", r.model);
  return json(response);
});
