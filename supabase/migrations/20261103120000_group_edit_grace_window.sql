-- A one-hour window to fix a confirmed seat, then the permanent lock.
--
-- Confirming used to be final the instant it happened. In practice a student
-- confirms at the end of a long form, notices the wrong group on the next screen,
-- and has no way back short of an admin. The window below gives them one hour
-- from the first confirmation to change their mind; after that the seat is frozen
-- exactly as before.
--
-- The deadline is derived from `group_confirmed_at`, not stored separately, so a
-- second save inside the window does not push the deadline out. One confirmation,
-- one hour, then locked — the window cannot be extended by saving again.
--
-- Self-contained and safe to re-run.

-- Confirms the seat. Returns true when this call set or moved the seat, false when
-- the window has closed and the row was left alone.
--
-- Three cases:
--   * never confirmed            -> stamp now, write the seat, return true
--   * confirmed, still in window -> move the seat, keep the original stamp, return true
--   * confirmed, window closed   -> leave the row exactly as it stands, return false
CREATE OR REPLACE FUNCTION public.confirm_student_group(
  p_student_id uuid,
  p_semina text,
  p_group text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  confirmed_at timestamptz;
BEGIN
  SELECT group_confirmed_at INTO confirmed_at
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mwanafunzi haipo kwenye mfumo.';
  END IF;

  -- Confirmed and the hour is up: the seat is frozen.
  IF confirmed_at IS NOT NULL AND confirmed_at <= now() - interval '1 hour' THEN
    RETURN false;
  END IF;

  UPDATE public.students SET
    semina = COALESCE(p_semina, semina),
    student_group = COALESCE(p_group, student_group),
    -- Only the first confirmation sets the stamp, so the hour is measured from then
    -- rather than restarting on every save inside the window.
    group_confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_student_id;

  RETURN true;
END;
$$;

-- `apply_profile_update` writes semina and student_group unconditionally, which would
-- walk a confirmed student straight out of their seat. It now only moves a student
-- whose hour has not run out. Reg Namba, name and submissions are unaffected, so
-- correcting a name on a locked student still works.
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
  confirmed_at timestamptz;
  seat_open boolean;
BEGIN
  SELECT reg_no, group_confirmed_at INTO old_reg, confirmed_at
  FROM public.students
  WHERE id = p_student_id;

  seat_open := confirmed_at IS NULL OR confirmed_at > now() - interval '1 hour';

  UPDATE public.students SET
    reg_no = COALESCE(p_new_reg_no, reg_no),
    full_name = COALESCE(p_new_full_name, full_name),
    -- A frozen seat ignores the incoming seminar and group rather than overwriting it.
    semina = CASE WHEN seat_open THEN COALESCE(p_new_semina, semina) ELSE semina END,
    student_group = CASE
      WHEN seat_open THEN COALESCE(p_new_group, student_group)
      ELSE student_group
    END
  WHERE id = p_student_id;

  IF p_new_reg_no IS NOT NULL AND p_new_reg_no <> old_reg THEN
    UPDATE public.submissions SET reg_no = p_new_reg_no WHERE student_id = p_student_id;
  END IF;
END;
$$;

-- The browser calls these with the publishable key, so the roles need EXECUTE. RLS
-- does not grant function access, and without this the call is refused before it runs.
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
        'GRANT EXECUTE ON FUNCTION public.unlock_student_group(uuid) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
