/**
 * Shared OpenRouter client for the exam edge functions.
 *
 * Every function in this folder grades or answers something for a student, so
 * this file exists to make three things true everywhere at once:
 *
 * 1. The key never reaches the browser. It lives in the `OPENROUTER_API_KEY`
 *    Supabase secret and is read here, server-side. Nothing in `src/` ever sees
 *    it.
 * 2. A model that is down, rate-limited or deprecated does not break the exam.
 *    The free tier is the only tier this account can use today (see `MODELS`),
 *    and free models are routinely busy, so every call walks a list of them and
 *    the caller treats "all busy" as "no AI answer" rather than as an error.
 * 3. The prompt asks for JSON and the answer is parsed defensively, because a
 *    free model will sometimes wrap JSON in prose or in a code fence.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// The one Deno global this module uses. Declared here rather than in a global
// .d.ts because the app's `tsc` run also type-checks this file (a `src/` test
// imports it), and the app has no other reason to know Deno exists.
declare const Deno: { env: { get(name: string): string | undefined } };

/**
 * Models to try, best first.
 *
 * Most free models on OpenRouter cannot be used for grading at all. Probed on
 * 2026-11-10, of the thirteen `:free` models the account can reach, most are
 * reasoning models that spend the whole token budget in a hidden `reasoning`
 * field and return `content: null` with `finish_reason: length` — no answer at
 * all. `nemotron-3-ultra` is the only one that answered correctly and in full on
 * every probe, so it leads.
 *
 * The two below it are kept as fallbacks on the chance that they do reach their
 * answer; when they do not, they return empty and the next model is tried, which
 * ends in an honest "not found" rather than a wrong answer.
 *
 * Deliberately excluded:
 *
 *  - `cohere/north-mini-code` returns text on every call, which made it look
 *    like a safe fallback, but asked about the fiqh term *Ijtihad* it wrote a
 *    fluent Swahili answer about Christian doctrine ("juhudi ya mwanachama wa
 *    Kikristo… maagizo ya Kikiristi"). Invented content in an Islamic Studies
 *    tutor is the exact harm the prompt above guards against, so a model that
 *    produces it is not a fallback, it is a liability.
 *  - `inkling-2-small` (403, paid plan only) and the `gemma-4` pair (429 on
 *    every probe).
 *
 * The account's free tier allows 50 requests per day shared across all of these.
 * When they are exhausted the caller falls back to the on-device grader in
 * `src/lib/ai-grader.ts`, which is why that grader must stay good: it is the
 * layer that always runs.
 */
export const MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

export type ChatResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: "no_key" | "all_busy" | "error"; status: number; detail: string };

export type ChatOptions = {
  /** Ask the provider for a JSON object. Advisory only; parsing stays defensive. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Models to try instead of `MODELS`, for a caller that needs a specific set. */
  models?: string[];
};

/** How long to wait before retrying the same model once on a 429. */
const RATE_LIMIT_BACKOFF_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a chat completion, trying each model in turn.
 *
 * Returns `ok: false` rather than throwing when nothing is available: the
 * caller's fallback is a real code path (the local grader), not an error page.
 * `status` and `detail` are kept so a function can log *why* it fell back.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key)
    return { ok: false, reason: "no_key", status: 500, detail: "OPENROUTER_API_KEY is not set" };

  const models = opts.models ?? MODELS;
  let lastStatus = 0;
  let lastDetail = "no model produced an answer";
  // A truncated answer is still worth showing when it is the last chance; before
  // that, a cut-off model is treated as a failure and the next one is tried.
  let isLast = false;

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    isLast = mi === models.length - 1;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            // OpenRouter uses these for attribution; harmless and recommended.
            "HTTP-Referer": "https://www.islamicstudiestest.online",
            "X-Title": "Islamic Studies Test Online",
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: opts.maxTokens ?? 1200,
            temperature: opts.temperature ?? 0.2,
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
        });

        lastStatus = r.status;
        if (r.status === 429 || r.status >= 500) {
          lastDetail = `model ${model} busy (${r.status})`;
          if (attempt === 0) {
            await sleep(RATE_LIMIT_BACKOFF_MS);
            continue;
          }
          break; // move to the next model
        }
        if (!r.ok) {
          lastDetail = `model ${model} failed (${r.status}): ${(await r.text()).slice(0, 200)}`;
          break;
        }

        const data = await r.json();
        const ch = data?.choices?.[0];
        const msg = ch?.message;
        // Only `content` is the answer. `reasoning` is the model's private
        // chain-of-thought — it was once used here as a fallback, and it put
        // text like "The user is asking about… 1. Explain in my own words" in
        // front of students. An empty `content` means this model has nothing to
        // say, so move on to the next one rather than show its thinking.
        const text = String(msg?.content ?? "").trim();

        // `finish_reason: length` means the model was cut off mid-sentence — a
        // reasoning model that never reached its answer, or an answer that ran
        // past the token budget. Half a sentence is worse than trying the next
        // model, so treat it as a failure unless there is nothing left to try.
        const truncated = ch?.finish_reason === "length";
        if (text && (!truncated || isLast)) return { ok: true, text, model };

        lastDetail = text
          ? `model ${model} was cut off (finish_reason: length)`
          : `model ${model} returned empty content`;
        break;
      } catch (e) {
        lastDetail = `model ${model} threw: ${String(e).slice(0, 200)}`;
        lastStatus = 502;
      }
    }
  }

  return { ok: false, reason: "all_busy", status: lastStatus || 503, detail: lastDetail };
}

/**
 * Pulls the first JSON object out of a model's reply.
 *
 * Free models routinely wrap JSON in a sentence or a ```json fence, so a bare
 * `JSON.parse` is not enough. This scans for the first balanced `{...}` and
 * parses that, which handles prose before and after the object.
 */
export function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to the scan */
  }

  const start = trimmed.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Reconciles a model's `score` with its `isCorrect` when the two disagree.
 *
 * This is not hypothetical. During testing `nemotron-3.5-super-vl` returned
 * `{ score: 0, isCorrect: true, concepts: [...all matched...] }` for a fully
 * correct answer: it understood the answer, marked every concept as present, and
 * then wrote 0 in the score field. Passing that straight through would give a
 * correct student nothing, which is the worst outcome this system can produce —
 * worse than falling back to the local grader, which at least gets the easy
 * cases right.
 *
 * So the model's *verdict* is trusted over its *arithmetic*: when it says the
 * answer is correct, the score is lifted to the pass mark; when it says the
 * answer is wrong, the score is held below it. `isCorrect` absent means the
 * score decides, as before.
 *
 * Kept pure and exported so a test can pin this behaviour.
 */
export function reconcileGrade(
  rawScore: number,
  rawIsCorrect: boolean | null,
  points: number,
): { score: number; isCorrect: boolean } {
  const passMark = points * 0.6;
  const score = Math.max(0, Math.min(points, Number.isFinite(rawScore) ? rawScore : 0));
  const isCorrect = rawIsCorrect ?? score >= passMark;
  if (isCorrect && score < passMark) return { score: passMark, isCorrect: true };
  if (!isCorrect && score >= passMark)
    return { score: Math.max(0, passMark - 0.01), isCorrect: false };
  return { score, isCorrect };
}

/**
 * Like `chat`, but guarantees a parsed JSON object or a failure.
 *
 * Free models do not reliably honour `response_format: json_object`. The same
 * model that returned clean JSON a minute ago will sometimes narrate its
 * reasoning instead ("The user wants me to evaluate...") and never reach the
 * object. That is not a reason to abandon the answer — the model understood the
 * question; it just did not format the reply.
 *
 * So this makes one corrective attempt: it hands the model its own rambling back
 * with a terse instruction to emit only the JSON. That second pass is cheap and
 * rescues exactly the case that would otherwise be a 502.
 *
 * Returns the parsed object, or `ok: false` with the first attempt's failure.
 */
export async function chatJson(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<
  | { ok: true; data: Record<string, unknown>; model: string }
  | { ok: false; status: number; detail: string }
> {
  const first = await chat(messages, { ...opts, json: true, maxTokens: opts.maxTokens ?? 2000 });
  if (!first.ok) return { ok: false, status: first.status, detail: first.detail };

  const parsed = extractJson(first.text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { ok: true, data: parsed as Record<string, unknown>, model: first.model };
  }

  const retry = await chat(
    [
      ...messages,
      { role: "assistant", content: first.text.slice(0, 4000) },
      {
        role: "user",
        content:
          "Majibu yako hayakuwa JSON sahihi. Rudia mara moja: toa KITU KIMOJA tu — kitu cha JSON, bila maelezo, bila mazungumzo, bila ```.",
      },
    ],
    { ...opts, json: true, maxTokens: opts.maxTokens ?? 2000 },
  );
  if (!retry.ok) return { ok: false, status: retry.status, detail: retry.detail };

  const retried = extractJson(retry.text);
  if (retried && typeof retried === "object" && !Array.isArray(retried)) {
    return { ok: true, data: retried as Record<string, unknown>, model: retry.model };
  }
  return { ok: false, status: 502, detail: `unparseable after retry: ${retry.text.slice(0, 300)}` };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Reads a JSON request body, or null when it is not an object. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Preflight helper: returns a response for OPTIONS, or null to carry on. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}
