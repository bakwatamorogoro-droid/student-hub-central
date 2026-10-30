-- ============================================================
--  Digital classroom attendance: rotating QR + 50 m geofence
--
--  Safe to run more than once. Requires the pgcrypto extension for
--  gen_random_bytes()/digest().
--
--  Design notes:
--   * A session owns one short-lived token. Only the SHA-256 hash of that token
--     is stored, so reading the table never reveals a usable QR payload.
--   * The distance rule is enforced in attendance_check_in_qr(), never in the
--     browser, so a tampered client cannot accept a far-away check-in.
--   * The token carries no student data, no password and no personal details.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. Sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  semina text,
  student_group text,
  teacher_label text,
  lat double precision,
  lng double precision,
  radius_m integer NOT NULL DEFAULT 50,
  token_hash text,
  token_expires_at timestamptz,
  -- A short code the teacher reads out loud. It lets a student who is in the
  -- room check in without a camera, while the rotating QR stays the quick path.
  join_code text,
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Added after the table shipped, for databases created by an earlier version.
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS join_code text;

CREATE INDEX IF NOT EXISTS attendance_sessions_token_idx
  ON public.attendance_sessions (token_hash);

CREATE INDEX IF NOT EXISTS attendance_sessions_join_code_idx
  ON public.attendance_sessions (join_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO anon, authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS att_sessions_all ON public.attendance_sessions;
CREATE POLICY att_sessions_all ON public.attendance_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 2. Attendance rows gain a session link, accuracy and method
--    gps_lat/gps_lng/distance_m already exist from 0001; they are
--    repeated here so this migration also applies to a fresh database.
-- ------------------------------------------------------------
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS gps_accuracy double precision,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS distance_m double precision;

-- One check-in per student per session. NULL session_id keeps the old
-- once-per-day behaviour untouched.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_student_session_uniq
  ON public.attendance (student_id, session_id)
  WHERE session_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Student accounts (Supabase Auth link)
-- ------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS students_auth_user_uniq
  ON public.students (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Distance helper (metres, Haversine)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_distance_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(
    sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )
  );
$$;

-- ------------------------------------------------------------
-- 5. Issue a fresh short-lived token for a session
-- ------------------------------------------------------------
-- Replaced below by a version that requires an admin session. Drop the older
-- signature so a call cannot resolve to a copy that mints tokens for anyone.
DROP FUNCTION IF EXISTS public.attendance_rotate_token(uuid);

CREATE OR REPLACE FUNCTION public.attendance_rotate_token(
  p_session_id uuid,
  p_admin_token text
)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_expires timestamptz;
  v_admin boolean;
BEGIN
  -- Minting a QR token is a teacher action, so it is checked here rather than
  -- trusted from the browser. Without this anyone could mint a valid token and
  -- hand it to students who are not in the room.
  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = encode(digest(coalesce(p_admin_token, ''), 'sha256'), 'hex')
       AND s.expires_at > now()
  ) INTO v_admin;

  IF NOT v_admin THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + interval '30 seconds';

  UPDATE public.attendance_sessions
     SET token_hash = encode(digest(v_token, 'sha256'), 'hex'),
         token_expires_at = v_expires
   WHERE id = p_session_id AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or inactive';
  END IF;

  RETURN QUERY SELECT v_token, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_rotate_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_rotate_token(uuid, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6. Verify a scanned token and record attendance
--    All gates are checked here, in order, server-side.
-- ------------------------------------------------------------
-- Replaced below by a version that identifies the student from a sign-in
-- session. Drop the older overloads so a call cannot resolve to a copy that
-- trusts a caller-supplied device id.
DROP FUNCTION IF EXISTS public.attendance_check_in_qr(text, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.attendance_check_in_qr(text, double precision, double precision, double precision, text);
DROP FUNCTION IF EXISTS public.attendance_check_in_qr(text, double precision, double precision, text);
-- Superseded by attendance_check_in, which accepts either a scanned token or a
-- session join code. Dropped so a call cannot resolve to the token-only copy.
DROP FUNCTION IF EXISTS public.attendance_check_in_qr(text, double precision, double precision, text, text);

-- ------------------------------------------------------------
-- 6a. Record one check-in for a session
--
--     Accepts either the rotating QR token or the session's join code, so a
--     student without a working camera can still check in from the room.
--     Returns the same shape as the older token-only entry point.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_check_in(
  p_token text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_student_token text DEFAULT NULL,
  p_join_code text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  reason text,
  full_name text,
  semina text,
  distance_m double precision,
  radius_m double precision,
  check_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_student_id uuid;
  v_hash text;
  v_code text;
  v_distance double precision;
BEGIN
  v_hash := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_code := nullif(upper(trim(coalesce(p_join_code, ''))), '');

  -- A QR token wins; otherwise fall back to the join code the teacher read out.
  IF p_token IS NOT NULL AND trim(p_token) <> '' THEN
    SELECT * INTO v_session
      FROM public.attendance_sessions s
     WHERE s.token_hash = v_hash
     ORDER BY s.created_at DESC
     LIMIT 1;
  ELSE
    SELECT * INTO v_session
      FROM public.attendance_sessions s
     WHERE s.join_code = v_code
       AND s.active
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token', NULL::text, NULL::text, NULL::double precision, NULL::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  -- A join code is only usable while the session is open. The QR token keeps
  -- its own 30 second window, checked next.
  IF p_token IS NOT NULL AND trim(p_token) <> ''
     AND (v_session.token_expires_at IS NULL OR v_session.token_expires_at < now()) THEN
    RETURN QUERY SELECT false, 'expired_token', NULL::text, NULL::text, NULL::double precision, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  IF NOT v_session.active
     OR v_session.opens_at > now()
     OR (v_session.closes_at IS NOT NULL AND v_session.closes_at < now()) THEN
    RETURN QUERY SELECT false, 'session_closed', NULL::text, NULL::text, NULL::double precision, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  -- Identify the student from a live sign-in session. The session token is
  -- issued by student_login() and only its hash is stored, so this cannot be
  -- forged by sending someone else's registration number.
  SELECT s.student_id INTO v_student_id
    FROM public.student_sessions s
   WHERE s.token_hash = encode(digest(coalesce(p_student_token, ''), 'sha256'), 'hex')
     AND s.expires_at > now()
   LIMIT 1;

  IF v_student_id IS NOT NULL THEN
    SELECT * INTO v_student FROM public.students st WHERE st.id = v_student_id;
  END IF;

  IF v_student.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_registered', NULL::text, NULL::text, NULL::double precision, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  -- Geofence. A session without coordinates cannot be distance-checked.
  IF v_session.lat IS NULL OR v_session.lng IS NULL THEN
    RETURN QUERY SELECT false, 'gps_required', NULL::text, NULL::text, NULL::double precision, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN QUERY SELECT false, 'gps_required', NULL::text, NULL::text, NULL::double precision, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  v_distance := public.attendance_distance_m(v_session.lat, v_session.lng, p_lat, p_lng);

  IF v_distance > v_session.radius_m THEN
    RETURN QUERY SELECT false, 'outside_area', NULL::text, NULL::text, v_distance, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  -- Once per session, not once per day: a student attends several lectures a
  -- day and each has its own session. The old once-per-day rule refused the
  -- second lecture of the day.
  IF EXISTS (
    SELECT 1 FROM public.attendance a
     WHERE a.student_id = v_student.id
       AND a.session_id = v_session.id
  ) THEN
    RETURN QUERY SELECT false, 'already_marked', v_student.full_name,
                        v_session.semina, v_distance, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO public.attendance (
    student_id, reg_no, full_name, semina, student_group,
    check_in_date, session_id, gps_lat, gps_lng, distance_m, status, method
  ) VALUES (
    v_student.id, v_student.reg_no, v_student.full_name,
    coalesce(v_session.semina, v_student.semina),
    coalesce(v_session.student_group, v_student.student_group),
    (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
    v_session.id,
    p_lat, p_lng, v_distance, 'present',
    CASE WHEN p_token IS NOT NULL AND trim(p_token) <> '' THEN 'qr' ELSE 'code' END
  );

  RETURN QUERY SELECT true, NULL::text, v_student.full_name, v_session.semina,
                      v_distance, v_session.radius_m::double precision, now();
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_check_in(text, double precision, double precision, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_check_in(text, double precision, double precision, text, text) TO anon, authenticated;

-- Kept so an older client build still works. New code calls attendance_check_in.
CREATE OR REPLACE FUNCTION public.attendance_check_in_qr(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_student_token text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  reason text,
  full_name text,
  semina text,
  distance_m double precision,
  radius_m double precision,
  check_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.attendance_check_in(p_token, p_lat, p_lng, p_student_token, NULL);
$$;

REVOKE ALL ON FUNCTION public.attendance_check_in_qr(text, double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_check_in_qr(text, double precision, double precision, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6b. List the sessions a student may check in to right now
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_open_sessions(p_student_token text)
RETURNS TABLE (id uuid, title text, semina text, student_group text, radius_m integer, has_join_code boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
BEGIN
  SELECT st.* INTO v_student
    FROM public.student_sessions s
    JOIN public.students st ON st.id = s.student_id
   WHERE s.token_hash = encode(digest(coalesce(p_student_token, ''), 'sha256'), 'hex')
     AND s.expires_at > now()
   LIMIT 1;

  IF v_student.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, s.title, s.semina, s.student_group, s.radius_m, (s.join_code IS NOT NULL)
    FROM public.attendance_sessions s
   WHERE s.active
     AND s.opens_at <= now()
     AND (s.closes_at IS NULL OR s.closes_at > now())
     -- A session aimed at one cohort is only offered to that cohort.
     AND (s.student_group IS NULL OR s.student_group = v_student.student_group)
     AND (s.semina IS NULL OR s.semina = v_student.semina)
     AND NOT EXISTS (
       SELECT 1 FROM public.attendance a
        WHERE a.session_id = s.id AND a.student_id = v_student.id
     )
   ORDER BY s.created_at DESC
   LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_open_sessions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_open_sessions(text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6c. The present list for one session, for the teacher's screen.
--     Read through a function because HARDEN_RLS leaves attendance with
--     no policy, so a browser read returns no rows.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_session_present(p_admin_token text, p_session_id uuid)
RETURNS TABLE (full_name text, reg_no text, created_at timestamptz, distance_m double precision, method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = encode(digest(coalesce(p_admin_token, ''), 'sha256'), 'hex')
       AND s.expires_at > now()
  ) INTO v_admin;

  IF NOT v_admin THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  RETURN QUERY
  SELECT a.full_name, a.reg_no, a.created_at, a.distance_m, a.method
    FROM public.attendance a
   WHERE a.session_id = p_session_id
   ORDER BY a.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_session_present(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_session_present(text, uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6c. Start and close a session.
--
--     These have to be functions, not table writes. HARDEN_RLS.sql grants
--     attendance_sessions no policy, so a browser insert or update is refused
--     and the teacher could not open a session at all. Both check the admin
--     session token here, the same way attendance_rotate_token does.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_start_session(
  p_admin_token text,
  p_title text,
  p_semina text DEFAULT NULL,
  p_student_group text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_m integer DEFAULT 50,
  p_join_code text DEFAULT NULL
)
RETURNS TABLE (id uuid, join_code text, title text, semina text, student_group text, radius_m integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_code text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = encode(digest(coalesce(p_admin_token, ''), 'sha256'), 'hex')
       AND s.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  v_code := upper(coalesce(p_join_code, ''));

  -- The code is spoken out loud, so it only needs to be unambiguous, not secret.
  -- Retry on collision rather than failing the teacher's click.
  FOR i IN 1..8 LOOP
    BEGIN
      INSERT INTO public.attendance_sessions
        (title, semina, student_group, lat, lng, radius_m, join_code, active, created_at)
      VALUES
        (p_title, p_semina, p_student_group, p_lat, p_lng,
         coalesce(p_radius_m, 50), v_code, true, now())
      RETURNING attendance_sessions.id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_code := upper(encode(gen_random_bytes(3), 'hex'));
    END;
  END LOOP;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'could not allocate a join code';
  END IF;

  RETURN QUERY
  SELECT s.id, s.join_code, s.title, s.semina, s.student_group, s.radius_m
    FROM public.attendance_sessions s
   WHERE s.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_start_session(text, text, text, text, double precision, double precision, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_start_session(text, text, text, text, double precision, double precision, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.attendance_end_session(
  p_admin_token text,
  p_session_id uuid
)
RETURNS TABLE (ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = encode(digest(coalesce(p_admin_token, ''), 'sha256'), 'hex')
       AND s.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE public.attendance_sessions
     SET active = false, closes_at = now()
   WHERE id = p_session_id;

  RETURN QUERY SELECT true;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_end_session(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_end_session(text, uuid) TO anon, authenticated;


-- ------------------------------------------------------------
-- 6d. Backstop against a double check-in.
--
--     The EXISTS test above is the friendly path; this index makes a
--     duplicate physically impossible even if two scans race, or if some
--     other code path inserts into attendance directly.
--
--     Keyed by session, not by day: the old (student_id, check_in_date) index
--     blocked a student from attending a second lecture the same day.
--
--     Created CONCURRENTLY is not possible inside a migration transaction, so
--     this is a plain CREATE INDEX. It is written to tolerate pre-existing
--     duplicates so the file stays safe to run on a live table.
-- ------------------------------------------------------------
-- The day-keyed index is dropped so its rule no longer applies. The
-- (student_id, session_id) index added in section 2 takes over.
DROP INDEX IF EXISTS public.attendance_one_per_student_per_day;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'attendance_student_session_uniq'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX attendance_student_session_uniq
        ON public.attendance (student_id, session_id)
        WHERE session_id IS NOT NULL;
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'attendance_student_session_uniq not created: existing duplicate rows must be cleared first';
    END;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. Link a freshly created auth user to its student row
--    Called by the registration server function.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_link_account(
  p_reg_no text,
  p_user_id uuid
)
RETURNS TABLE (ok boolean, reason text, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
BEGIN
  SELECT * INTO v_student
    FROM public.students st
   WHERE upper(btrim(st.reg_no)) = upper(btrim(p_reg_no))
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_registered', NULL::text;
    RETURN;
  END IF;

  IF v_student.auth_user_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_registered', v_student.full_name;
    RETURN;
  END IF;

  UPDATE public.students
     SET auth_user_id = p_user_id,
         account_status = 'approved'
   WHERE id = v_student.id;

  RETURN QUERY SELECT true, NULL::text, v_student.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.student_link_account(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_link_account(text, uuid) TO service_role;
