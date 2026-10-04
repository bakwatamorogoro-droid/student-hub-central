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

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_questions boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_mcq boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_tf boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize_matching boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS students_reg_no_unique ON public.students(reg_no);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_exam_student_unique ON public.submissions(exam_id, student_id);
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS pdf_url text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS autosave_disabled boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE POLICY "anon write announcements ins" ON public.announcements FOR INSERT TO public WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write announcements upd" ON public.announcements FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write announcements del" ON public.announcements FOR DELETE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write exams ins" ON public.exams FOR INSERT TO public WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write exams upd" ON public.exams FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write exams del" ON public.exams FOR DELETE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write questions ins" ON public.questions FOR INSERT TO public WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write questions upd" ON public.questions FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write questions del" ON public.questions FOR DELETE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write settings upd" ON public.app_settings FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS ai_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS auto_score numeric;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS ai_score numeric;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS concepts JSONB;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS system_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_message text NOT NULL DEFAULT 'Mfumo umefungwa kwa muda. Tafadhali subiri.',
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS results_secret_slug text NOT NULL DEFAULT 'siri-alama';

CREATE TABLE IF NOT EXISTS public.profile_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  current_reg_no text NOT NULL,
  current_full_name text NOT NULL,
  new_reg_no text,
  new_full_name text,
  new_semina text,
  new_student_group text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE public.profile_update_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pur_all" ON public.profile_update_requests FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no text NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  category text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);
ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_all" ON public.issue_reports FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS profile_edits_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS issues_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.apply_profile_update(
  p_student_id uuid,
  p_new_reg_no text,
  p_new_full_name text,
  p_new_semina text,
  p_new_group text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_reg text;
BEGIN
  SELECT reg_no INTO old_reg FROM public.students WHERE id = p_student_id;
  UPDATE public.students SET
    reg_no = COALESCE(p_new_reg_no, reg_no),
    full_name = COALESCE(p_new_full_name, full_name),
    semina = COALESCE(p_new_semina, semina),
    student_group = COALESCE(p_new_group, student_group)
  WHERE id = p_student_id;
  IF p_new_reg_no IS NOT NULL AND p_new_reg_no <> old_reg THEN
    UPDATE public.submissions SET reg_no = p_new_reg_no WHERE student_id = p_student_id;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.study_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  caption text,
  image_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.study_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_all ON public.study_images FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.daily_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, visit_date)
);
ALTER TABLE public.daily_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dv_all" ON public.daily_visits FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS daily_visits_date_idx ON public.daily_visits (visit_date);

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  reg_no text NOT NULL,
  full_name text NOT NULL,
  semina text,
  student_group text,
  check_in_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, check_in_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO anon, authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY att_all ON public.attendance FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS quiz_mode text;
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS distance_m double precision;
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS attendance_lat double precision,
  ADD COLUMN IF NOT EXISTS attendance_lng double precision,
  ADD COLUMN IF NOT EXISTS attendance_radius_m integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS attendance_gps_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS quiz_active boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.quiz_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  student_id uuid NOT NULL,
  reg_no text NOT NULL,
  full_name text NOT NULL,
  semina text,
  student_group text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_participants TO anon, authenticated;
GRANT ALL ON public.quiz_participants TO service_role;
ALTER TABLE public.quiz_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY qp_all ON public.quiz_participants FOR ALL USING (true) WITH CHECK (true);
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_participants; EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.study_images ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'gallery';
CREATE INDEX IF NOT EXISTS idx_study_images_category ON public.study_images(category);
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS test_number integer;

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

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS confirmed_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_data text;
ALTER TABLE public.exam_pdfs
  ADD COLUMN IF NOT EXISTS is_assignment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assignment_text text,
  ADD COLUMN IF NOT EXISTS correct_answer text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.pdf_submissions
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.exam_pdfs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_suggested_score numeric,
  ADD COLUMN IF NOT EXISTS ai_suggested_feedback text,
  ADD COLUMN IF NOT EXISTS ai_suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS teacher_confirmed boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO anon, authenticated;
GRANT ALL ON public.exams TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO anon, authenticated;
GRANT ALL ON public.submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO anon, authenticated;
GRANT ALL ON public.announcements TO service_role;
GRANT SELECT, UPDATE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_update_requests TO anon, authenticated;
GRANT ALL ON public.profile_update_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issue_reports TO anon, authenticated;
GRANT ALL ON public.issue_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_images TO anon, authenticated;
GRANT ALL ON public.study_images TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_visits TO anon, authenticated;
GRANT ALL ON public.daily_visits TO service_role;

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