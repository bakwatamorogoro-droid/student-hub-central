ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS study_year integer,
  ADD COLUMN IF NOT EXISTS academic_year text;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS target_study_year integer,
  ADD COLUMN IF NOT EXISTS target_academic_year text,
  ADD COLUMN IF NOT EXISTS assignment_mode text;

ALTER TABLE public.exam_pdfs
  ADD COLUMN IF NOT EXISTS target_study_year integer,
  ADD COLUMN IF NOT EXISTS target_academic_year text;
