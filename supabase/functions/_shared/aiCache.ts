/**
 * The cache and daily budget in front of OpenRouter.
 *
 * The account's free tier allows **50 requests per day** for every model
 * combined, and it has no purchasable credit (a paid model answers `402`). One
 * class sitting one exam can exceed that on its own, so the grading path has to
 * spend requests as if they were the scarce thing they are. This module is how:
 *
 *   - `cacheKey` turns a grading request into a hash. Two students who write the
 *     same answer to the same question hash the same and cost one request
 *     between them.
 *   - `readCache` / `writeCache` store and return the whole response body, so a
 *     hit is indistinguishable from a miss to the caller.
 *   - `spend` counts what has gone out today and refuses once the cap is near,
 *     which is what stops the tail of the class from hammering a 429.
 *
 * All of it is best-effort. If the tables are missing — a deploy that ran ahead
 * of the migration — every function here degrades to "no cache, no budget" and
 * the caller still grades. Losing the cache costs requests; throwing would cost
 * the student a mark.
 */

// Same local Deno declaration as `openrouter.ts`, for the same reason: the app's
// `tsc` run type-checks this file because a `src/` test imports `budgetFor`.
declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = () => Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Requests to leave unused. The cap is shared with anything else on the account,
 * and a request that fails halfway still counts, so the last few are held back
 * rather than spent. Fifteen is enough to grade a late submission after a burst
 * of identical answers has already been served from the cache.
 */
export const DAILY_REQUEST_LIMIT = 50;
export const RESERVED_REQUESTS = 15;

const table = (name: string) => `${SUPABASE_URL()}/rest/v1/${name}`;
const headers = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE_KEY(),
  Authorization: `Bearer ${SERVICE_KEY()}`,
  "Content-Type": "application/json",
  ...extra,
});

/** True when the service-role key is present, i.e. the cache can be reached. */
export const cacheAvailable = () => Boolean(SUPABASE_URL() && SERVICE_KEY());

/**
 * JSON with object keys sorted, so the same request always hashes the same.
 *
 * `JSON.stringify` keeps insertion order, and the four functions build their
 * bodies separately — a later refactor that reorders a field would silently miss
 * every cache entry it had written before. Sorting removes that trap, and the
 * cost is nil because the values are short strings and small arrays.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** sha256 of the parts of a grading request that decide the answer. */
export async function cacheKey(kind: string, parts: unknown): Promise<string> {
  const canonical = canonicalJson({ kind, ...(parts as Record<string, unknown>) });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns the cached response for a key, or null.
 *
 * Also bumps the row's hit count, which is the only way to tell later whether the
 * cache is earning its keep. The bump is fire-and-forget: a failed count must not
 * cost the caller its hit.
 */
export async function readCache(key: string): Promise<Record<string, unknown> | null> {
  if (!cacheAvailable()) return null;
  try {
    const r = await fetch(
      `${table("ai_grade_cache")}?cache_key=eq.${key}&select=response,hits&limit=1`,
      {
        headers: headers(),
      },
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as { response?: unknown; hits?: number }[];
    const row = rows[0];
    if (!row?.response) return null;

    void fetch(`${table("ai_grade_cache")}?cache_key=eq.${key}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({ hits: (row.hits ?? 0) + 1, last_hit_at: new Date().toISOString() }),
    }).catch(() => {});

    return row.response as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Stores a response. Best-effort; a failed write only costs a future request. */
export async function writeCache(
  key: string,
  response: Record<string, unknown>,
  kind: string,
  model: string | null,
): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    await fetch(table("ai_grade_cache"), {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ cache_key: key, response, kind, model }]),
    });
  } catch {
    /* a miss next time is the only cost */
  }
}

/** Today, in the same shape Postgres uses, so the row key matches. */
const today = () => new Date().toISOString().slice(0, 10);

export type Budget = { allowed: boolean; used: number; remaining: number };

/**
 * Decides whether one more request fits in today's allowance.
 *
 * Pure and exported so the arithmetic can be tested without a database — the
 * off-by-one here is the difference between spending the last request on a
 * student and refusing them.
 */
export function budgetFor(
  used: number,
  limit = DAILY_REQUEST_LIMIT,
  reserved = RESERVED_REQUESTS,
): Budget {
  const spendable = limit - reserved;
  const remaining = spendable - used;
  return { allowed: remaining > 0, used, remaining: Math.max(0, remaining) };
}

/**
 * Checks today's spend and reserves one request.
 *
 * A missing counter row reads as "nothing spent yet", which is the safe
 * direction: it allows a request, and the request itself is what creates the row.
 */
export async function spend(): Promise<Budget> {
  const fallback = budgetFor(0);
  if (!cacheAvailable()) return fallback;

  try {
    const r = await fetch(`${table("ai_usage")}?day=eq.${today()}&select=requests`, {
      headers: headers(),
    });
    if (!r.ok) return fallback;
    const rows = (await r.json()) as { requests?: number }[];
    const budget = budgetFor(rows[0]?.requests ?? 0);
    void bump(budget.allowed ? "requests" : "refused");
    return budget.allowed
      ? { ...budget, used: budget.used + 1, remaining: budget.remaining - 1 }
      : budget;
  } catch {
    return fallback;
  }
}

/** Records a cache hit, for the counter's own reporting. */
export async function noteCacheHit(): Promise<void> {
  void bump("cache_hits");
}

/**
 * Increments one counter on today's row.
 *
 * Read-then-write rather than an RPC, because the exact count does not need to be
 * precise — it needs to exist, and it needs to not break grading if two requests
 * race. A lost increment under load is a rounding error against a cap of 50.
 */
async function bump(column: "requests" | "cache_hits" | "refused"): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    const r = await fetch(
      `${table("ai_usage")}?day=eq.${today()}&select=requests,cache_hits,refused`,
      {
        headers: headers(),
      },
    );
    const rows = r.ok ? ((await r.json()) as Record<string, number>[]) : [];
    const row = rows[0] ?? { requests: 0, cache_hits: 0, refused: 0 };
    const body = {
      day: today(),
      ...row,
      [column]: (row[column] ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };

    await fetch(table("ai_usage"), {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([body]),
    });
  } catch {
    /* counters are advisory */
  }
}
