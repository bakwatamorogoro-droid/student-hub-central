-- Open Update Taarifa for one student, or for everyone.
--
-- `profile_edits_enabled` in `app_settings` is the all-or-nothing switch: the admin turns
-- it on for the whole cohort during a correction week and off again. That leaves no answer
-- for the single student who saved the wrong seminar or group after the switch was turned
-- off — their only route back was the admin editing the row by hand.
--
-- This migration adds the per-student half: one column on `students` that holds the moment
-- the admin opened that one form, and three RPCs to open it, close it and spend it.
--
--   * `edit_unlocked_at` is NULL for everyone the admin has not opened. The student page
--     reads it straight off the row it already loads, so no extra query is needed.
--   * `grant_student_edit` opens the form for one student. It is spent by the save, not by
--     a clock, so it cannot be left open by accident.
--   * `revoke_student_edit` closes a grant the admin issued by mistake, without touching
--     anything the student has already saved.
--   * `consume_student_edit` spends the grant after a successful save, so one grant buys
--     one correction rather than an open door.
--
-- A grant also releases the seat. "I updated my details wrongly" is exactly the case where
-- the seminar or group is what went wrong, so the grant clears `group_confirmed_at` in the
-- same call. Without that the student would be handed the form and then refused the seat.
--
-- Self-contained and safe to re-run.

-- When the admin opened this student's form. NULL means no grant outstanding.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS edit_unlocked_at timestamptz;

-- The admin panel lists the students holding a grant, so the scan wants an index.
CREATE INDEX IF NOT EXISTS students_edit_unlocked_idx
  ON public.students(edit_unlocked_at);

-- Opens one student's form, and releases the seat in the same call.
CREATE OR REPLACE FUNCTION public.grant_student_edit(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET
    edit_unlocked_at = now(),
    group_confirmed_at = NULL
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mwanafunzi haipo kwenye mfumo.';
  END IF;
END;
$$;

-- Takes the grant back, leaving everything the student already saved alone.
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

-- Spends the grant. A no-op when there was nothing to spend, which is what the global
-- switch looks like.
CREATE OR REPLACE FUNCTION public.consume_student_edit(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET edit_unlocked_at = NULL WHERE id = p_student_id;
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
    END IF;
  END LOOP;
END $$;
