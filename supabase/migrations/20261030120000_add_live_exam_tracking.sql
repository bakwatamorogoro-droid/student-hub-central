-- Live exam tracking: a heartbeat, and the proctoring signals collected while a
-- student writes.
--
-- `started_at`/`submitted_at` already say whether a paper is open, so the live
-- panel needs no new table. What was missing is a way to tell "still working" from
-- "phone died twenty minutes ago", and somewhere to keep what the camera and GPS
-- checks observed.

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.submissions.last_seen_at IS
  'Last time the student''s browser reported it was still on the exam page.';

-- Written by the exam page at submit time. Shape:
--   { fullscreen_exits: number, camera: "ok"|"covered"|"frozen"|null, gps_flags: string[] }
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS proctor jsonb;

COMMENT ON COLUMN public.submissions.proctor IS
  'Integrity signals recorded while the student sat the exam.';

-- The live panel polls "open papers for these exams", ordered by start.
CREATE INDEX IF NOT EXISTS submissions_live_idx
  ON public.submissions (exam_id, started_at DESC)
  WHERE submitted_at IS NULL;
