-- What the student had, so an admin can read a correction as before -> after.
--
-- The request table recorded `current_reg_no` and `current_full_name` from the
-- start, but nothing for the fields that the group system now derives on its own.
-- Without them the admin view had to render semina, group, course, study year and
-- semester as new values with no baseline, so it printed the student's own
-- existing values as though they were corrections on every single save.
--
-- The student form now writes these only for the fields that actually changed, so
-- a request with changed_fields = '[]' carries no phantom diff.
--
-- Self-contained and safe to re-run.

ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS current_semina text;
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS current_student_group text;
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS current_course text;
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS current_study_year integer;
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS current_semester text;

-- Where the student ended up after the group system re-placed them, written when
-- the request is applied. This is what the admin reads back to confirm the
-- placement took effect, rather than re-deriving it.
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS placed_semina text;
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS placed_student_group text;
ALTER TABLE public.profile_update_requests
  ADD COLUMN IF NOT EXISTS placed_at timestamptz;

-- The admin list is ordered by created_at and filtered by status on the
-- dashboard's pending counter.
CREATE INDEX IF NOT EXISTS profile_update_requests_created_idx
  ON public.profile_update_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS profile_update_requests_status_idx
  ON public.profile_update_requests(status);
