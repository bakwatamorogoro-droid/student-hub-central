
-- Attendance: status (present/absent) + admin confirmation + signature for group sign-ins
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS confirmed_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_data text;

-- Exam PDFs become assignments: admin can post a question + due date + correct answer + points
ALTER TABLE public.exam_pdfs
  ADD COLUMN IF NOT EXISTS is_assignment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assignment_text text,
  ADD COLUMN IF NOT EXISTS correct_answer text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- PDF submissions: AI suggestion fields + link to assignment
ALTER TABLE public.pdf_submissions
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.exam_pdfs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_suggested_score numeric,
  ADD COLUMN IF NOT EXISTS ai_suggested_feedback text,
  ADD COLUMN IF NOT EXISTS ai_suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS teacher_confirmed boolean NOT NULL DEFAULT false;
