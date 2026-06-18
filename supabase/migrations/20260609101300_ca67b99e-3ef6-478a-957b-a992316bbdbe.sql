
-- 1) Add test number to exams (1-5)
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS test_number integer;

-- 2) Student PDF submissions (answers uploaded as PDF)
CREATE TABLE IF NOT EXISTS public.pdf_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  reg_no text NOT NULL,
  full_name text NOT NULL,
  semina text,
  student_group text,
  file_url text NOT NULL,
  file_name text,
  status text NOT NULL DEFAULT 'pending',
  score numeric,
  max_score numeric,
  feedback text,
  ai_extracted_text text,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_submissions TO anon, authenticated;
GRANT ALL ON public.pdf_submissions TO service_role;
ALTER TABLE public.pdf_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pdf_subs_all" ON public.pdf_submissions FOR ALL USING (true) WITH CHECK (true);

-- 3) Teacher exam-question PDFs
CREATE TABLE IF NOT EXISTS public.exam_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_pdfs TO anon, authenticated;
GRANT ALL ON public.exam_pdfs TO service_role;
ALTER TABLE public.exam_pdfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_pdfs_all" ON public.exam_pdfs FOR ALL USING (true) WITH CHECK (true);
