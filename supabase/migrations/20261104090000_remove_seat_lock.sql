-- Remove the seat lock: a student can always change their seminar and group.
--
-- The confirmation lock and the one-hour window after it both refused a second move of a
-- student's seat. In practice that left a student who had saved the wrong group stuck in
-- it, with no route back short of an admin, and `confirm_student_group` answered `false`
-- to every later move — so a change made on the form was silently dropped.
--
-- The seat is now the student's to change at any time. The `group_confirmed_at` stamp is
-- kept, because the planner reads it to leave a student where they put themselves, but it
-- no longer gates a move.
--
-- Self-contained and safe to re-run.

-- Confirms the seat, and moves it on every later call. Returns true when the seat was
-- written. Kept under the old name so a stale client still gets a real write rather than
-- a silent no-op.
CREATE OR REPLACE FUNCTION public.confirm_student_group(
  p_student_id uuid,
  p_semina text,
  p_group text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET
    semina = COALESCE(p_semina, semina),
    student_group = COALESCE(p_group, student_group),
    -- Only the first write sets the stamp; the marker says "the student chose this seat",
    -- not "this seat is now frozen".
    group_confirmed_at = COALESCE(group_confirmed_at, now())
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mwanafunzi haipo kwenye mfumo.';
  END IF;

  RETURN true;
END;
$$;

-- `apply_profile_update` wrote semina and student_group only while the seat was inside the
-- one-hour window, and ignored them afterwards. It now always applies them, so a seat
-- change that travels through this RPC is never dropped.
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
  SELECT reg_no INTO old_reg
  FROM public.students
  WHERE id = p_student_id;

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

-- The browser calls these with the publishable key, so the roles need EXECUTE. RLS does
-- not grant function access, and without this the call is refused before it runs.
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.confirm_student_group(uuid, text, text) TO %I',
        role_name
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.apply_profile_update(uuid, text, text, text, text) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
