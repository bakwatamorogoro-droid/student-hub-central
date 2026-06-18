
-- Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  semina TEXT NOT NULL,
  student_group TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX students_reg_no_idx ON public.students(reg_no);

-- Exams
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  require_camera BOOLEAN NOT NULL DEFAULT true,
  require_gps BOOLEAN NOT NULL DEFAULT true,
  require_audio BOOLEAN NOT NULL DEFAULT false,
  require_signature BOOLEAN NOT NULL DEFAULT true,
  published BOOLEAN NOT NULL DEFAULT false,
  results_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Questions
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN ('true_false','multiple_choice','short_answer','matching')),
  body TEXT NOT NULL,
  options JSONB,
  correct_answer JSONB NOT NULL,
  points NUMERIC NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX questions_exam_idx ON public.questions(exam_id);

-- Submissions
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reg_no TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_feedback JSONB,
  score NUMERIC,
  max_score NUMERIC,
  signature_data TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  device_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE(exam_id, student_id)
);
CREATE INDEX submissions_exam_idx ON public.submissions(exam_id);

-- Announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App settings (singleton)
CREATE TABLE public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  semina_list JSONB NOT NULL DEFAULT '["Semina 1","Semina 2","Semina 3"]'::jsonb,
  group_list JSONB NOT NULL DEFAULT '["Group A","Group B","Group C"]'::jsonb,
  global_camera BOOLEAN NOT NULL DEFAULT true,
  global_gps BOOLEAN NOT NULL DEFAULT true,
  global_audio BOOLEAN NOT NULL DEFAULT false,
  admin_username TEXT NOT NULL DEFAULT '1234',
  admin_password TEXT NOT NULL DEFAULT 'abdi77',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Permissive policies: public app (admin protected via server fns + hardcoded creds).
-- Students can register, read their own row by reg_no, and submit answers.
CREATE POLICY "anon read students" ON public.students FOR SELECT USING (true);
CREATE POLICY "anon insert students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update students" ON public.students FOR UPDATE USING (true);

CREATE POLICY "anon read exams" ON public.exams FOR SELECT USING (true);
CREATE POLICY "anon read questions" ON public.questions FOR SELECT USING (true);

CREATE POLICY "anon read submissions" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "anon insert submissions" ON public.submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update submissions" ON public.submissions FOR UPDATE USING (true);

CREATE POLICY "anon read announcements" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "anon read settings" ON public.app_settings FOR SELECT USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('exam-media','exam-media', true);

CREATE POLICY "public read exam-media" ON storage.objects FOR SELECT USING (bucket_id = 'exam-media');
CREATE POLICY "anon upload exam-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'exam-media');
