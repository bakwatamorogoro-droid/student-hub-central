-- Friday/cohort grouping: 15 seminars, 11 groups of 8 per gender.
--
-- Safe to re-run.
--
--   students.student_group  a student between groups (or after leaving) has no
--                           seat, so the column can no longer be NOT NULL. The
--                           auto-assignment fills it back in on the next update.
--   group_reports           the CR's per-group attendance report, including who
--                           they said was missing.

ALTER TABLE public.students ALTER COLUMN student_group DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.group_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semina TEXT NOT NULL,
  gender TEXT NOT NULL,
  student_group TEXT NOT NULL,
  -- [{ id, reg_no, full_name }] — the members the CR could not find in class.
  missing JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  reported_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_reports_group_idx
  ON public.group_reports(semina, gender, student_group);
CREATE INDEX IF NOT EXISTS group_reports_created_idx
  ON public.group_reports(created_at DESC);

ALTER TABLE public.group_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read group reports" ON public.group_reports;
CREATE POLICY "anon read group reports" ON public.group_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon insert group reports" ON public.group_reports;
CREATE POLICY "anon insert group reports" ON public.group_reports FOR INSERT WITH CHECK (true);
