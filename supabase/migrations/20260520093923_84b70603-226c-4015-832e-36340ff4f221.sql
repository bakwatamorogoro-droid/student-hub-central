
-- Students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  semina TEXT NOT NULL,
  student_group TEXT NOT NULL,
  device_id TEXT NOT NULL,
  phone TEXT,
  course TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_reg_no_idx ON public.students(reg_no);

CREATE TABLE IF NOT EXISTS public.exams (
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
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_mcq boolean NOT NULL DEFAULT false,
  randomize_tf boolean NOT NULL DEFAULT false,
  randomize_matching boolean NOT NULL DEFAULT false,
  autosave_disabled boolean NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN ('true_false','multiple_choice','short_answer','matching')),
  body TEXT NOT NULL,
  options JSONB,
  correct_answer JSONB NOT NULL,
  points NUMERIC NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  concepts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_exam_idx ON public.questions(exam_id);

CREATE TABLE IF NOT EXISTS public.submissions (
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
  ai_confirmed boolean NOT NULL DEFAULT false,
  auto_score numeric,
  ai_score numeric,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE(exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS submissions_exam_idx ON public.submissions(exam_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
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
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "s_r" ON public.students FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "s_i" ON public.students FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "s_u" ON public.students FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "s_d" ON public.students FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "e_r" ON public.exams FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "e_i" ON public.exams FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "e_u" ON public.exams FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "e_d" ON public.exams FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "q_r" ON public.questions FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "q_i" ON public.questions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "q_u" ON public.questions FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "q_d" ON public.questions FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "sub_r" ON public.submissions FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sub_i" ON public.submissions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sub_u" ON public.submissions FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sub_d" ON public.submissions FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "a_r" ON public.announcements FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "a_i" ON public.announcements FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "a_u" ON public.announcements FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "a_d" ON public.announcements FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "set_r" ON public.app_settings FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "set_u" ON public.app_settings FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO storage.buckets (id, name, public) VALUES ('exam-media','exam-media', true) ON CONFLICT DO NOTHING;

DO $$ BEGIN CREATE POLICY "em_r" ON storage.objects FOR SELECT USING (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "em_i" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "em_u" ON storage.objects FOR UPDATE USING (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "em_d" ON storage.objects FOR DELETE USING (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
