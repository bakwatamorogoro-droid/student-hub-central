-- Let an admin open the edit form for one student, even while Update Taarifa is
-- switched off for everyone else.
--
-- The global `profile_edits_enabled` switch is all-or-nothing: the admin turns it on
-- for the whole cohort during a correction week and off again. That leaves no answer
-- for the single student who saved the wrong seminar or group after the switch was
-- turned off — their only route back is the admin editing the row by hand.
--
-- A grant is one student's name on the door. It is deliberately narrow: it does not
-- touch the global switch, and it is spent the moment the student saves, so it cannot
-- be left open by accident.
--
-- A grant also releases the seat. "I updated my details wrongly" is exactly the case
-- where the seminar or group is what went wrong, and a seat frozen past its hour would
-- otherwise make the grant useless for the correction it was issued for.
--
-- Self-contained and safe to re-run.

-- When the admin opened this student's form. NULL means no grant outstanding.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS edit_unlocked_at timestamptz;

-- The admin panel searches by Reg Namba and lists the students holding a grant, so the
-- scan wants an index.
CREATE INDEX IF NOT EXISTS students_edit_unlocked_idx
  ON public.students(edit_unlocked_at);

-- Opens one student's form. Releases the seat in the same call, because a grant that
-- cannot move the seat cannot fix the mistake it was issued for.
CREATE OR REPLACE FUNCTION public.grant_student_edit(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.students SET
    edit_unlocked_at = now(),
    -- Release the seat lock so the student can re-pick. The one-hour window starts
    -- again from their next confirmation.
    group_confirmed_at = NULL
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mwanafunzi haipo kwenye mfumo.';
  END IF;
END;
$$;

-- Takes the grant back without touching anything the student has already saved. The
-- admin panel calls this to close a grant they issued by mistake.
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

-- Spends the grant. The student page calls this after a save lands, so one grant buys
-- one correction rather than an open door. A no-op when there was nothing to spend,
-- which is what the global switch looks like.
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

-- The browser calls these with the publishable key, so the roles need EXECUTE. RLS
-- does not grant function access, and without this the call is refused before it runs.
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
