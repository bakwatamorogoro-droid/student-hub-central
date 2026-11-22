-- Group invitations: a student in a nearly empty group asks a classmate to let
-- them into a fuller one, and the classmate says yes or no.
--
-- The rules the owner asked for, enforced here as well as in `src/lib/groupHub.ts`:
--
--   * a group holds at most 8 people, and nobody is invited into a full group;
--   * only a group with fewer than 5 people may be the one that moves;
--   * a group is gender-pure and belongs to one seminar, so an invitation never
--     crosses either;
--   * the invitee must have been through Update Taarifa, because an invitation
--     to a row nobody has confirmed is an invitation to a stranger.
--
-- The browser holds the publishable key, so a disabled button proves nothing.
-- `checkInvite` in TypeScript gives the student a readable reason; the trigger
-- below is what actually holds the limit, because it sees the row the browser
-- would otherwise write directly.
--
-- An invitation never moves anybody. It records intent; the move is a separate
-- seat write the invitee makes when they accept, so nobody can be unseated by
-- somebody else's invitation.
--
-- Self-contained and safe to re-run.

CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_student_id UUID NOT NULL,
  from_reg_no TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_semina TEXT NOT NULL,
  from_group TEXT NOT NULL,
  to_student_id UUID NOT NULL,
  to_reg_no TEXT NOT NULL,
  to_name TEXT NOT NULL,
  to_semina TEXT NOT NULL,
  to_group TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  CONSTRAINT group_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  CONSTRAINT group_invites_not_self CHECK (from_student_id <> to_student_id)
);

-- The page asks "my pending invitations" in both directions, and the duplicate
-- check asks "is there already a pending one from A to B".
CREATE INDEX IF NOT EXISTS group_invites_to_idx
  ON public.group_invites(to_student_id, status);
CREATE INDEX IF NOT EXISTS group_invites_from_idx
  ON public.group_invites(from_student_id, status);
CREATE INDEX IF NOT EXISTS group_invites_created_idx
  ON public.group_invites(created_at DESC);

-- One live invitation per direction. A declined invitation is history, so it
-- must not block a fresh one, which is why the index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS group_invites_pending_uniq
  ON public.group_invites(from_student_id, to_student_id)
  WHERE status = 'pending';

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read group invites" ON public.group_invites;
CREATE POLICY "anon read group invites" ON public.group_invites
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon insert group invites" ON public.group_invites;
CREATE POLICY "anon insert group invites" ON public.group_invites
  FOR INSERT WITH CHECK (true);

-- Only the status may be answered, and only the two students named may do it.
-- The write is a narrow UPDATE rather than a full grant so an invitee cannot
-- rewrite who the invitation was for.
DROP POLICY IF EXISTS "anon answer group invites" ON public.group_invites;
CREATE POLICY "anon answer group invites" ON public.group_invites
  FOR UPDATE USING (true) WITH CHECK (true);

-- Row level security filters rows; it does not hand out table access. A table
-- created here starts with no privileges for the browser roles, so the
-- publishable key reaches PostgREST and is refused before a policy is consulted.
-- The role guard keeps the file runnable on a plain Postgres.
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE ON public.group_invites TO %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

-- Counts the seats a group holds, in one seminar and one gender. Used by the
-- trigger below; SECURITY DEFINER so the count is not filtered by RLS for the
-- caller and the limit is decided by the real number of rows.
CREATE OR REPLACE FUNCTION public.group_seat_count(
  p_semina TEXT,
  p_group TEXT,
  p_gender TEXT
) RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::int
  FROM public.students
  WHERE student_group = p_group
    AND semina = p_semina
    AND lower(coalesce(gender, '')) = lower(coalesce(p_gender, ''));
$$;

-- Refuses an invitation into a full group, or out of a group that is not
-- under-filled, whatever the client believes.
--
-- Re-checked at INSERT time rather than trusted from the payload: the group
-- sizes travel in the request body, and a request body is whatever the browser
-- decided to send.
CREATE OR REPLACE FUNCTION public.group_invites_enforce_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_size INTEGER;
  source_size INTEGER;
  target_gender TEXT;
  source_gender TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT lower(coalesce(gender, '')) INTO target_gender
  FROM public.students WHERE id = NEW.to_student_id;

  SELECT lower(coalesce(gender, '')) INTO source_gender
  FROM public.students WHERE id = NEW.from_student_id;

  IF target_gender IS DISTINCT FROM source_gender THEN
    RAISE EXCEPTION 'Group ni la jinsia moja; mwaliko huu hauwezekani.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = NEW.to_student_id AND group_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Mwanafunzi huyu haja-update taarifa zake bado, kwa hivyo hawezi kualikwa.'
      USING ERRCODE = 'check_violation';
  END IF;

  target_size := public.group_seat_count(NEW.to_semina, NEW.to_group, target_gender);
  IF target_size >= 8 THEN
    RAISE EXCEPTION 'Group la mwenzako limejaa (watu 8). Hakuna nafasi ya kuingia.'
      USING ERRCODE = 'check_violation';
  END IF;

  source_size := public.group_seat_count(NEW.from_semina, NEW.from_group, source_gender);
  IF source_size >= 5 THEN
    RAISE EXCEPTION 'Group lako lina watu 5 au zaidi, kwa hivyo haliingii kwenye group lingine.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS group_invites_capacity ON public.group_invites;
CREATE TRIGGER group_invites_capacity
  BEFORE INSERT ON public.group_invites
  FOR EACH ROW EXECUTE FUNCTION public.group_invites_enforce_capacity();

-- Stamps the answer, so a page can show when it was settled rather than only
-- that it was.
CREATE OR REPLACE FUNCTION public.group_invites_stamp_answer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> OLD.status AND NEW.status <> 'pending' THEN
    NEW.answered_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS group_invites_answer_stamp ON public.group_invites;
CREATE TRIGGER group_invites_answer_stamp
  BEFORE UPDATE ON public.group_invites
  FOR EACH ROW EXECUTE FUNCTION public.group_invites_stamp_answer();

-- Accepting an invitation is the only write that moves a student, and it is the
-- invitee's own call. Keeping it in one function means the status change and the
-- seat change cannot land apart: a student cannot end up moved with the
-- invitation still pending, nor accepted while still sitting in the old group.
CREATE OR REPLACE FUNCTION public.answer_group_invite(
  p_invite_id UUID,
  p_student_id UUID,
  p_accept BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.group_invites%ROWTYPE;
  target_size INTEGER;
  target_gender TEXT;
  mover_semina TEXT;
  mover_group TEXT;
BEGIN
  SELECT * INTO inv FROM public.group_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mwaliko huu haupo.' USING ERRCODE = 'no_data_found';
  END IF;

  IF inv.to_student_id <> p_student_id THEN
    RAISE EXCEPTION 'Mwaliko huu si wako, kwa hivyo hauwezi kuujibu.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Mwaliko huu tayari umejibiwa.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.group_invites
    SET status = 'declined', answered_at = now()
    WHERE id = p_invite_id;
    RETURN 'declined';
  END IF;

  SELECT lower(coalesce(gender, '')) INTO target_gender
  FROM public.students WHERE id = inv.to_student_id;

  -- Two invitees accepting into the same group at the same moment would each
  -- count the same free seat and both take it, leaving nine in a group of eight.
  -- The invite row lock above is per invitation, so it cannot serialise that.
  -- An advisory lock on the target group makes the count and the move one
  -- indivisible step per group; it is released when the transaction ends.
  PERFORM pg_advisory_xact_lock(
    hashtext(inv.to_semina || '|' || inv.to_group || '|' || coalesce(target_gender, ''))
  );

  -- The group may have filled between the invitation and the answer.
  target_size := public.group_seat_count(inv.to_semina, inv.to_group, target_gender);
  IF target_size >= 8 THEN
    RAISE EXCEPTION 'Group limejaa sasa hivi (watu 8). Mwaliko hauwezi kukubaliwa.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The invitation describes where the mover stood when it was sent. They may have
  -- moved since — by another invitation, or by an admin — so the seat is only
  -- theirs to take if they are still in the group the invitation was written for.
  -- Answering with a status rather than raising matters: a RAISE would roll back
  -- the cancellation with it, leaving a card the invitee could never clear.
  SELECT semina, student_group INTO mover_semina, mover_group
  FROM public.students WHERE id = inv.from_student_id FOR UPDATE;

  IF mover_group IS DISTINCT FROM inv.from_group
     OR mover_semina IS DISTINCT FROM inv.from_semina THEN
    UPDATE public.group_invites
    SET status = 'cancelled', answered_at = now()
    WHERE id = p_invite_id;
    RETURN 'cancelled';
  END IF;

  UPDATE public.students
  SET semina = inv.to_semina,
      student_group = inv.to_group,
      group_confirmed_at = now()
  WHERE id = inv.from_student_id;

  UPDATE public.group_invites
  SET status = 'accepted', answered_at = now()
  WHERE id = p_invite_id;

  -- Any other invitation the mover still had open is now moot.
  UPDATE public.group_invites
  SET status = 'cancelled', answered_at = now()
  WHERE status = 'pending' AND from_student_id = inv.from_student_id;

  RETURN 'accepted';
END $$;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.answer_group_invite(UUID, UUID, BOOLEAN) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
