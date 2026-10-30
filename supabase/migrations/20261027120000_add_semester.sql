ALTER TABLE public.students ADD COLUMN IF NOT EXISTS semester text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_semester text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS course_list jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS program_years integer DEFAULT 2;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_academic_year text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_semester text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS academic_years_list jsonb DEFAULT '[]'::jsonb;
