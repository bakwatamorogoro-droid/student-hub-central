
-- Profile update requests (mwanafunzi anaomba marekebisho, admin anathibitisha)
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

-- Issue reports (changamoto za wanafunzi)
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

-- Toggle ya admin kuruhusu wanafunzi waombe marekebisho
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS profile_edits_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS issues_enabled boolean NOT NULL DEFAULT true;

-- Function: badilisha reg_no/full_name kila mahali kwa pamoja
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
