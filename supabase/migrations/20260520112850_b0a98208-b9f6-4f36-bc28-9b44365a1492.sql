
-- Tables
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
  auto_score NUMERIC,
  ai_score NUMERIC,
  ai_confirmed BOOLEAN NOT NULL DEFAULT false,
  signature_data TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  device_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE(exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS submissions_exam_idx ON public.submissions(exam_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  title TEXT,
  pdf_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
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
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Permissive policies (admin gated app-level)
DO $$ BEGIN CREATE POLICY "p1" ON public.students FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p2" ON public.exams FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p3" ON public.questions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p4" ON public.submissions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p5" ON public.announcements FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p6" ON public.app_settings FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('exam-media','exam-media', true) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN CREATE POLICY "em1" ON storage.objects FOR SELECT USING (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "em2" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "em3" ON storage.objects FOR UPDATE USING (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "em4" ON storage.objects FOR DELETE USING (bucket_id = 'exam-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
