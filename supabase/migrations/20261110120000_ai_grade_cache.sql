-- A cache and a daily counter for the AI grading calls.
--
-- Why this exists
-- ---------------
-- The OpenRouter account behind this app is on the free tier: **50 requests per
-- day, shared by every model**, and it has never bought credits, so the $50
-- balance shown in the dashboard cannot be spent (a paid model answers
-- `402 Insufficient credits`). Fifty calls a day is far below what a class of
-- students taking one exam needs, so without something in front of OpenRouter the
-- last student to submit is graded by the on-device fallback while the first
-- fifty are graded by a model.
--
-- This table is the "something in front". It does two jobs:
--
--   1. **Cache.** Grading the same question and the same answer twice is common:
--      two students write the same sentence, or one student resubmits unchanged,
--      or the teacher opens a submission twice. A hit costs no request. The key
--      is a hash of exactly what the model was asked, so a hit means the model
--      would have been given identical input and can only have produced the
--      answer already stored.
--   2. **A counter.** `ai_usage` counts what has actually been spent today, so
--      the function can tell the difference between "no key" and "out of quota"
--      and can stop early rather than burn requests on 429s.
--
-- The cache never stores student identity: a question, an answer and a grade.
-- That is the same content the teacher already holds in `pdf_submissions`, and it
-- is what makes the cache possible at all.

-- ---------------------------------------------------------------------- cache

CREATE TABLE IF NOT EXISTS public.ai_grade_cache (
  -- sha256 of the model, the question, the expected answer and the student's
  -- answer. The primary key, so a repeat is an upsert rather than a duplicate.
  cache_key text PRIMARY KEY,
  -- The full response body the edge function returned, so a hit is byte-identical
  -- to a miss from the caller's point of view.
  response jsonb NOT NULL,
  -- Which model produced it. Kept so a bad model's output can be found and
  -- purged, and so a cache hit can still report which model was behind it.
  model text,
  -- Which function wrote the row: ai-grade-short | ai-grade-assignment.
  kind text NOT NULL DEFAULT 'grade-short',
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

COMMENT ON TABLE public.ai_grade_cache IS
  'Cached AI grading responses, keyed by a hash of the exact prompt inputs. Saves the 50/day free-tier budget.';

-- The only query pattern is "look up one key" and "purge rows older than X".
CREATE INDEX IF NOT EXISTS ai_grade_cache_created_idx
  ON public.ai_grade_cache (created_at DESC);

-- --------------------------------------------------------------------- counter

CREATE TABLE IF NOT EXISTS public.ai_usage (
  -- A date, so the row is "what was spent today".
  day date PRIMARY KEY,
  -- Requests actually sent to OpenRouter and billed against the daily free cap.
  requests integer NOT NULL DEFAULT 0,
  -- Requests served from the cache instead — the number this table exists to
  -- make go up.
  cache_hits integer NOT NULL DEFAULT 0,
  -- How many callers were turned away because the cap was reached. If this is
  -- above zero the day ran out, and it is the signal that the class needs a paid
  -- key rather than a bigger cache.
  refused integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_usage IS
  'Per-day count of OpenRouter requests, cache hits and refusals. The free tier allows 50 requests/day.';

-- --------------------------------------------------------------------- access

-- The edge functions reach these tables with the service-role key, which ignores
-- RLS. The browser has no reason to read either table, so unlike the rest of the
-- schema these are deliberately NOT granted to anon: the cache holds students'
-- answers, and the counter is an implementation detail of the grading path.
GRANT ALL ON public.ai_grade_cache TO service_role;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_grade_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- A service-role client bypasses these policies; they exist so that if a
-- publishable key is ever pointed at these tables it reads nothing. No policy is
-- created for anon or authenticated on purpose — the absence of a policy is the
-- denial.
