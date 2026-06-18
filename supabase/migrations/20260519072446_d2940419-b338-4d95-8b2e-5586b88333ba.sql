
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course text;

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_questions boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_mcq boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_tf boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_matching boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS students_reg_no_unique ON public.students(reg_no);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_exam_student_unique ON public.submissions(exam_id, student_id);
