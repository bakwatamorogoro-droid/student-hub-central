-- ============================================================
--  Islamic Studies Test Online — pending migrations
--  Paste ALL of this into Supabase -> SQL Editor -> Run
--  Safe to run more than once (every statement is IF NOT EXISTS)
-- ============================================================

-- From 20261027120000_add_semester.sql
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS semester text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_semester text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS course_list jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS program_years integer DEFAULT 2;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_academic_year text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_semester text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS academic_years_list jsonb DEFAULT '[]'::jsonb;

-- From 20261028090000_add_stats_switches_and_request_fields.sql
ALTER TABLE public.exam_pdfs ADD COLUMN IF NOT EXISTS target_semester text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_course text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_study_year integer;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_semester text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_academic_year text;
ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS changed_fields jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS show_submissions_stat boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS show_test1_stat boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS stats_hidden_at timestamptz;

-- From 20261029090000_add_exam_area_and_results_pin.sql
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS exam_radius_m integer NOT NULL DEFAULT 300;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS exam_gps_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS results_require_pin boolean NOT NULL DEFAULT true;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS gps_distance_m double precision;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS gps_radius_m integer;

-- From 20261030120000_add_live_exam_tracking.sql
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS proctor jsonb;
CREATE INDEX IF NOT EXISTS submissions_live_idx
  ON public.submissions (exam_id, started_at DESC)
  WHERE submitted_at IS NULL;
