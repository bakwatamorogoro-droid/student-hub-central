-- One granted edit per student, and no second one until it is granted again.
--
-- The grant already existed (`students.edit_unlocked_at`), and the save already spent it
-- (`consume_student_edit` sets it back to NULL). What was missing is the memory that the
-- student *used* it. With only a NULL, a student who used their one correction looked
-- exactly like a student who had never been granted one, so the cohort-wide
-- `profile_edits_enabled` switch handed the form straight back to them.
--
-- `edit_used_at` is that memory. `consume_student_edit` now stamps it, and
-- `grant_student_edit` clears it, so "one grant, one correction" holds even while the
-- cohort-wide switch is on. Re-granting is the only way back, which is what the owner
-- asked for: "akiedit na akathibisha hawezi kuedit tena hadi afanyiwe edit tena".
--
-- Self-contained and safe to re-run.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS edit_used_at timestamptz;

-- The admin panel lists who has spent an edit, so the scan wants an index.
CREATE INDEX IF NOT EXISTS students_edit_used_idx
  ON public.students(edit_used_at);

-- Opens one student's form. Clears the "used" memory too, so a re-grant is a real
-- second chance rather than a door that opens onto a locked room.
CREATE OR REPLACE FUNCTION public.grant_student_edit(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET
    edit_unlocked_at = now(),
    edit_used_at = NULL,
    group_confirmed_at = NULL
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mwanafunzi haipo kwenye mfumo.';
  END IF;
END;
$$;

-- Takes a grant back, leaving everything the student already saved alone. A grant that was
-- never used leaves no trace, so the student is not locked out for the admin's mistake.
CREATE OR REPLACE FUNCTION public.revoke_student_edit(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET edit_unlocked_at = NULL WHERE id = p_student_id;
END;
$$;

-- Spends the grant and records that it was used. A no-op when there was nothing to spend,
-- which is what the cohort-wide switch looks like.
CREATE OR REPLACE FUNCTION public.consume_student_edit(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET
    edit_unlocked_at = NULL,
    edit_used_at = now()
  WHERE id = p_student_id;
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
        'GRANT EXECUTE ON FUNCTION public.grant_student_edit(uuid) TO %I',
        role_name
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.revoke_student_edit(uuid) TO %I',
        role_name
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.consume_student_edit(uuid) TO %I',
        role_name
      );
      EXECUTE format(
        'GRANT SELECT (edit_used_at), INSERT (edit_used_at), UPDATE (edit_used_at), REFERENCES (edit_used_at) ON public.students TO %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
