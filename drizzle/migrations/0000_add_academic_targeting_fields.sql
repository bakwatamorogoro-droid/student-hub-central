DO $$
BEGIN
  IF to_regclass('public.students') IS NOT NULL THEN
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS study_year integer;
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS academic_year text;
  END IF;

  IF to_regclass('public.exams') IS NOT NULL THEN
    ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_study_year integer;
    ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_academic_year text;
    ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS assignment_mode text;
  END IF;

  IF to_regclass('public.exam_pdfs') IS NOT NULL THEN
    ALTER TABLE public.exam_pdfs ADD COLUMN IF NOT EXISTS target_study_year integer;
    ALTER TABLE public.exam_pdfs ADD COLUMN IF NOT EXISTS target_academic_year text;
  END IF;
END
$$;