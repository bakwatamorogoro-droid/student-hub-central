-- Attendance check-in by student
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

-- Quiz mode for exams (null = regular exam, 'individual' or 'group')
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS quiz_mode text;
