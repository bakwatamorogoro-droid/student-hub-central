-- Groups and seminars: the roster columns the auto-assignment writes, and the
-- CR's per-group attendance report.
--
-- Self-contained and safe to re-run. Supersedes
-- 20261031120000_add_group_reports.sql, which created the table but never
-- granted the browser roles access to it, so a CR saving a report was told
-- "permission denied for table group_reports" and the report was lost.
--
-- Deliberately no CHECK on the group or seminar text. The imported cohort
-- contains "TEST", "ASSIGMENT 1  KUBADILISHA", "Group A" and "SEMINA 16", so a
-- constraint would either reject the migration or fail the existing rows. The
-- planner normalises those values on the next save instead.

-- A student between groups, or one who has left, holds no seat, so the column
-- can no longer be NOT NULL. The auto-assignment fills it back in on the next
-- save.
ALTER TABLE public.students ALTER COLUMN student_group DROP NOT NULL;

-- The admin page groups the whole cohort by seminar and by group, and the
-- planner scans every row on each save.
CREATE INDEX IF NOT EXISTS students_semina_idx ON public.students(semina);
CREATE INDEX IF NOT EXISTS students_student_group_idx ON public.students(student_group);

CREATE TABLE IF NOT EXISTS public.group_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semina TEXT NOT NULL,
  gender TEXT NOT NULL,
  student_group TEXT NOT NULL,
  -- [{ id, reg_no, full_name }] - the members the CR could not find in class.
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
CREATE POLICY "anon read group reports" ON public.group_reports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon insert group reports" ON public.group_reports;
CREATE POLICY "anon insert group reports" ON public.group_reports
  FOR INSERT WITH CHECK (true);

-- Row level security filters rows; it does not hand out table access. A table
-- created here starts with no privileges for the browser roles, so the
-- publishable key reaches PostgREST and is refused before a policy is ever
-- consulted. The role guard keeps the file runnable on a plain Postgres, where
-- anon and authenticated do not exist.
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_reports TO %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
