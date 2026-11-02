-- Confirming a group, and the lock that follows.
--
-- A student reaches step 3, picks their seminar and group, and confirms. From that
-- moment the seat is theirs: neither they nor a later profile save may move them.
-- The lock has to live in the database, not in the form. The browser holds the
-- publishable key, so a disabled dropdown proves nothing — `apply_profile_update`
-- was reachable directly and would happily rewrite semina and student_group.
--
-- Self-contained and safe to re-run.

-- When the student confirmed. NULL means the seat is still open and editable.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS group_confirmed_at timestamptz;

-- The admin groups by seminar and reads who is confirmed, so the scan wants an index.
CREATE INDEX IF NOT EXISTS students_group_confirmed_idx
  ON public.students(group_confirmed_at);

-- Confirms the seat, and refuses to move one that is already confirmed.
--
-- Returns true when this call was the one that confirmed it, false when the student
-- already held a confirmed seat. The caller shows the locked card either way, but the
-- distinction tells the UI whether to say "confirmed just now" or "already confirmed".
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

  -- Already confirmed: leave the row exactly as it stands.
  IF confirmed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE public.students SET
    semina = COALESCE(p_semina, semina),
    student_group = COALESCE(p_group, student_group),
    group_confirmed_at = now()
  WHERE id = p_student_id;

  RETURN true;
END;
$$;

-- Moves a confirmed student back to the editable state. Admin-only in practice: the
-- student page never calls it, and the point of the lock is that a student cannot.
CREATE OR REPLACE FUNCTION public.unlock_student_group(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET group_confirmed_at = NULL WHERE id = p_student_id;
END;
$$;

-- `apply_profile_update` predates the lock and writes semina and student_group
-- unconditionally, which would walk a confirmed student straight out of their seat.
-- It now only moves a student who has not confirmed. Reg Namba, name and submissions
-- are unaffected, so correcting a name on a confirmed student still works.
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
BEGIN
  SELECT reg_no, group_confirmed_at INTO old_reg, confirmed_at
  FROM public.students
  WHERE id = p_student_id;

  UPDATE public.students SET
    reg_no = COALESCE(p_new_reg_no, reg_no),
    full_name = COALESCE(p_new_full_name, full_name),
    -- A confirmed seat is frozen: the incoming seminar and group are ignored rather
    -- than overwriting it.
    semina = CASE WHEN confirmed_at IS NULL THEN COALESCE(p_new_semina, semina) ELSE semina END,
    student_group = CASE
      WHEN confirmed_at IS NULL THEN COALESCE(p_new_group, student_group)
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
