-- Adds semester support (e.g. "Semester ya Kwanza" of 2026/2027) plus the
-- columns the UI already references but the schema was missing.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS semester text;

-- Optional per-exam targeting, mirroring target_study_year / target_academic_year.
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_semester text;

-- Admin-managed course catalogue, e.g. "BIOGRAPHY OF PROPHET MUHAMMAD [IS234]".
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS course_list jsonb DEFAULT '[]'::jsonb;

-- admin.settings.tsx uploads announcement images and passes image_url, but the
-- column was never created, so images silently failed to save (PGRST204).
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;

-- Programme length and the academic calendar the admin publishes in Mipangilio,
-- e.g. a 2-year programme running "Semester ya Kwanza 2026/2027".
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS program_years integer DEFAULT 2;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_academic_year text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_semester text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS academic_years_list jsonb DEFAULT '[]'::jsonb;
