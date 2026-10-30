-- Adds the columns the new features need. Safe to re-run.
--
--   students.semester / exams.target_semester   academic term targeting
--   exam_pdfs.target_semester                   semester question papers
--   profile_update_requests.new_*               what the student actually changed
--   app_settings.show_* / stats_hidden_at       exam-stat visibility switches

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS semester text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_semester text;

ALTER TABLE public.exam_pdfs ADD COLUMN IF NOT EXISTS target_semester text;

ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_course text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_study_year integer;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_semester text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_academic_year text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS changed_fields jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS show_submissions_stat boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS show_test1_stat boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS stats_hidden_at timestamptz;
