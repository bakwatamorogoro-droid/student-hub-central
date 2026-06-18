
-- Attendance GPS columns
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS distance_m double precision;

-- App settings: attendance geofence (admin sets center & radius)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS attendance_lat double precision,
  ADD COLUMN IF NOT EXISTS attendance_lng double precision,
  ADD COLUMN IF NOT EXISTS attendance_radius_m integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS attendance_gps_required boolean NOT NULL DEFAULT true;

-- Exams: admin start/stop switch for quizzes
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS quiz_active boolean NOT NULL DEFAULT false;

-- Quiz participants (for group / individual quiz joining)
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_participants;
