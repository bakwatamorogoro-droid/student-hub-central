ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS register_radius_m integer NOT NULL DEFAULT 800, ADD COLUMN IF NOT EXISTS register_gps_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS reg_lat double precision, ADD COLUMN IF NOT EXISTS reg_lng double precision;
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  semina text,
  student_group text,
  student_id uuid NOT NULL,
  full_name text NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gm_room_idx ON public.group_messages (exam_id, semina, student_group, created_at);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY gm_read ON public.group_messages FOR SELECT USING (true);
CREATE POLICY gm_insert ON public.group_messages FOR INSERT WITH CHECK (true);
GRANT SELECT, INSERT ON public.group_messages TO anon, authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;