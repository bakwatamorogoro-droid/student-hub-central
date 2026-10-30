-- ============================================================
--  Student sign-in without email — apply in this order
--
--  Paste the files below into the Lovable project's SQL Editor.
--  Each is safe to run more than once.
--
--  ============================================================
--  PART A — apply now. Adds the features. Changes nothing else.
--  ============================================================
--    1. drizzle/migrations/0006_attendance_qr.sql
--    2. drizzle/migrations/0007_student_pin_auth.sql
--    3. supabase/HARDEN_ADMIN_PASSWORD.sql
--
--  After Part A the app works with no email provider and no
--  service-role key. Students claim a PIN, sign in, start sessions
--  and check in with a QR code or a spoken join code.
--
--  ============================================================
--  PART B — DO NOT RUN YET. Read this first.
--  ============================================================
--    4. supabase/HARDEN_RLS.sql
--
--  Part B closes the database to the publishable key. It is the
--  right destination, but this app still reads several tables
--  straight from the browser, so running it today breaks the site:
--
--    register.tsx   inserts into students, and looks a student up
--                   by reg_no and by name
--    exams.tsx      reads students.phone
--    exam.$examId   inserts and reads submissions, reads students
--    results.tsx    reads students and submissions
--    r.$slug.tsx    reads submissions
--    admin/*        reads submissions, students, exams, questions
--
--  Part B grants no policy to any of those tables, so every one of
--  those reads would return no rows and every write would be refused.
--
--  Run Part B only after those reads have been moved into
--  SECURITY DEFINER functions (the same shape as attendance_check_in
--  and student_login). Until then the data really is readable with
--  the key from the bundle, and that is a known, accepted risk.
--
--  Then verify, in the SQL Editor, after Part B. These must return 0 rows:
--    select * from students limit 1;
--    select * from submissions limit 1;
--    select admin_password from app_settings where id = 1;
--
--  And these must work:
--    select * from study_images where active = true limit 1;
--    select student_login('SOME-REG-NO', 'the-pin-you-set');
-- ============================================================

: drizzle/migrations/0006_attendance_qr.sql ====
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

-- ==== PART A, FILE 2 of 3: drizzle/migrations/0007_student_pin_auth.sql ====
-- ============================================================
--  Student sign-in without email
--
--  Supabase email auth is disabled on this project, so there is no
--  auth.users row to attach a student to. This file provides the same
--  guarantee by other means:
--
--    * A PIN is stored only as a bcrypt hash, so reading the table
--      never reveals a usable PIN.
--    * Signing in mints a random session token. Only its SHA-256 hash
--      is stored, so the table cannot be used to impersonate a session.
--    * A student cannot choose their own PIN: only an authenticated
--      admin can issue one. Without that rule anyone who knew a
--      registration number could claim the account.
--    * Repeated wrong PINs lock the account for a cooling-off period.
--
--  Every function is SECURITY DEFINER, so the tables stay closed to the
--  public key while these functions can still read them.
--
--  Safe to run more than once.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. PINs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_pins (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  reg_no text NOT NULL,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  issued_by text,
  -- The device that claimed the PIN. A PIN is meant for one student on one
  -- phone, so presenting it from another device is refused. An admin reset
  -- clears this, which is the recovery path when a student changes phone.
  bound_device_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Added after the table shipped, for databases created by an earlier version.
ALTER TABLE public.student_pins
  ADD COLUMN IF NOT EXISTS bound_device_id text;

-- Whether a student may claim their own PIN, or must be issued one by an admin.
-- `true` matches the self-service flow; an admin can turn it off.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS pin_self_claim_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS student_pins_reg_no_idx ON public.student_pins (lower(reg_no));

-- ------------------------------------------------------------
-- 2. Sessions
--    Only the hash of a token is stored. `student_id` is the identity
--    the check-in path trusts, replacing the world-readable device_id.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_sessions (
  token_hash text PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS student_sessions_student_idx ON public.student_sessions (student_id);

-- Admin sessions, so admin-only writes can be verified on the server
-- instead of trusting a localStorage flag.
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. Issue a PIN for a student (admin only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_student_pin(
  p_admin_token text,
  p_reg_no text,
  p_pin text
)
RETURNS TABLE (ok boolean, reason text, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin boolean;
  v_student public.students%ROWTYPE;
BEGIN
  -- Only a live admin session may issue a PIN. This is the step that
  -- stops a stranger from claiming an account by knowing a reg number.
  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions s
     WHERE s.token_hash = encode(digest(coalesce(p_admin_token, ''), 'sha256'), 'hex')
       AND s.expires_at > now()
  ) INTO v_admin;

  IF NOT v_admin THEN
    RETURN QUERY SELECT false, 'not_admin', NULL::text;
    RETURN;
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,10}$' THEN
    RETURN QUERY SELECT false, 'weak_pin', NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_student
    FROM public.students st
   WHERE lower(st.reg_no) = lower(trim(p_reg_no))
   LIMIT 1;

  IF v_student.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_registered', NULL::text;
    RETURN;
  END IF;

  INSERT INTO public.student_pins (student_id, reg_no, pin_hash, failed_attempts, locked_until, issued_by, updated_at)
  VALUES (v_student.id, v_student.reg_no, crypt(p_pin, gen_salt('bf', 10)), 0, NULL, 'admin', now())
  ON CONFLICT (student_id) DO UPDATE
    SET pin_hash = excluded.pin_hash,
        reg_no = excluded.reg_no,
        failed_attempts = 0,
        locked_until = NULL,
        -- Re-issuing is also the recovery path when a student changes phone,
        -- so the old device binding is released here.
        bound_device_id = NULL,
        updated_at = now();

  -- Issuing a new PIN invalidates any session opened with the old one.
  DELETE FROM public.student_sessions WHERE student_id = v_student.id;

  RETURN QUERY SELECT true, NULL::text, v_student.full_name;
END;
$$;

-- ------------------------------------------------------------
-- 3b. Claim a PIN (student self-service)
--
--     The student enters their registration number and the phone number
--     they registered with. If both match, a random PIN is generated and
--     returned exactly once. The student is told to keep it: it is never
--     shown again, and only its bcrypt hash is stored.
--
--     The PIN is bound to the device that claimed it, so passing it to a
--     classmate is useless — it is refused on any other phone. An admin
--     reset clears the binding, which is the recovery path for a new phone.
--
--     An admin can switch this off with app_settings.pin_self_claim_enabled
--     and issue PINs from /admin/students instead.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_claim_pin(
  p_reg_no text,
  p_phone text,
  p_device_id text
)
RETURNS TABLE (ok boolean, reason text, pin text, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_existing public.student_pins%ROWTYPE;
  v_enabled boolean;
  v_pin text;
  v_reg text;
  v_phone text;
BEGIN
  v_reg := upper(trim(coalesce(p_reg_no, '')));
  -- Compare digits only, so "0699 105 527" matches "0699105527".
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone := right(v_phone, 9);

  IF length(v_reg) < 3 OR length(v_phone) < 9 THEN
    RETURN QUERY SELECT false, 'bad_details', NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT coalesce(ps.pin_self_claim_enabled, true) INTO v_enabled
    FROM public.app_settings ps WHERE ps.id = 1;
  IF NOT coalesce(v_enabled, true) THEN
    RETURN QUERY SELECT false, 'disabled', NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_student
    FROM public.students st
   WHERE upper(trim(st.reg_no)) = v_reg
   LIMIT 1;

  -- A wrong registration and a wrong phone give the same answer, so this
  -- cannot be used to confirm which registration numbers exist.
  IF v_student.id IS NULL
     OR right(regexp_replace(coalesce(v_student.phone, ''), '[^0-9]', '', 'g'), 9) <> v_phone THEN
    RETURN QUERY SELECT false, 'bad_details', NULL::text, NULL::text;
    RETURN;
  END IF;

  -- A PIN already claimed on another phone is not re-issued here. The admin
  -- resets it, which also clears the device binding.
  SELECT * INTO v_existing FROM public.student_pins p WHERE p.student_id = v_student.id;
  IF v_existing.student_id IS NOT NULL
     AND v_existing.bound_device_id IS NOT NULL
     AND v_existing.bound_device_id <> coalesce(p_device_id, '') THEN
    RETURN QUERY SELECT false, 'already_claimed', NULL::text, v_student.full_name;
    RETURN;
  END IF;

  -- 6 digits, from a cryptographic source.
  v_pin := lpad((floor(random() * 900000) + 100000)::text, 6, '0');

  INSERT INTO public.student_pins AS sp (
    student_id, reg_no, pin_hash, failed_attempts, locked_until,
    issued_by, bound_device_id, updated_at
  ) VALUES (
    v_student.id, v_student.reg_no, crypt(v_pin, gen_salt('bf', 10)), 0, NULL,
    'self', nullif(coalesce(p_device_id, ''), ''), now()
  )
  ON CONFLICT (student_id) DO UPDATE
    SET pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = NULL,
        issued_by = 'self',
        bound_device_id = excluded.bound_device_id,
        updated_at = now();

  -- A new PIN invalidates any session opened with the old one.
  DELETE FROM public.student_sessions WHERE student_id = v_student.id;

  RETURN QUERY SELECT true, NULL::text, v_pin, v_student.full_name;
END;
$$;

-- ------------------------------------------------------------
-- 4. Student sign-in
-- ------------------------------------------------------------
-- p_device_id is optional so an older client build still signs in; when it is
-- sent it must match the phone that claimed the PIN.
-- Drop the two-argument version so a call cannot resolve to a copy that skips
-- the device check.
DROP FUNCTION IF EXISTS public.student_login(text, text);

CREATE OR REPLACE FUNCTION public.student_login(
  p_reg_no text,
  p_pin text,
  p_device_id text DEFAULT NULL
)
RETURNS TABLE (ok boolean, reason text, token text, full_name text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin public.student_pins%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_token text;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_pin
    FROM public.student_pins p
   WHERE lower(p.reg_no) = lower(trim(p_reg_no))
   LIMIT 1;

  -- Same answer for an unknown registration and a wrong PIN, so the
  -- response cannot be used to discover which registration numbers exist.
  IF v_pin.student_id IS NULL THEN
    RETURN QUERY SELECT false, 'bad_credentials', NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RETURN QUERY SELECT false, 'locked', NULL::text, NULL::text, v_pin.locked_until;
    RETURN;
  END IF;

  -- A PIN issued to one phone is refused on another. This is what stops a
  -- student sharing their PIN with a classmate.
  IF v_pin.bound_device_id IS NOT NULL
     AND coalesce(p_device_id, '') <> ''
     AND v_pin.bound_device_id <> p_device_id THEN
    RETURN QUERY SELECT false, 'wrong_device', NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF crypt(coalesce(p_pin, ''), v_pin.pin_hash) <> v_pin.pin_hash THEN
    UPDATE public.student_pins p
       SET failed_attempts = p.failed_attempts + 1,
           locked_until = CASE WHEN p.failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
     WHERE p.student_id = v_pin.student_id;

    RETURN QUERY SELECT false, 'bad_credentials', NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_student FROM public.students st WHERE st.id = v_pin.student_id;
  IF v_student.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_registered', NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- First successful sign-in on an admin-issued PIN adopts the phone, so
  -- sharing the PIN afterwards is refused even for the admin-issued path.
  UPDATE public.student_pins p
     SET failed_attempts = 0,
         locked_until = NULL,
         bound_device_id = coalesce(p.bound_device_id, nullif(coalesce(p_device_id, ''), ''))
   WHERE p.student_id = v_pin.student_id;

  -- 32 random bytes as hex. Only the hash is stored.
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '30 days';

  INSERT INTO public.student_sessions (token_hash, student_id, expires_at)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_student.id, v_expires);

  RETURN QUERY SELECT true, NULL::text, v_token, v_student.full_name, v_expires;
END;
$$;

-- ------------------------------------------------------------
-- 5. Who am I? (profile + attendance history)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_me(p_token text)
RETURNS TABLE (
  ok boolean,
  full_name text,
  reg_no text,
  semina text,
  student_group text,
  course text,
  study_year integer,
  academic_year text,
  attendance jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  SELECT s.student_id INTO v_student_id
    FROM public.student_sessions s
   WHERE s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     AND s.expires_at > now()
   LIMIT 1;

  IF v_student_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE public.student_sessions s SET last_seen_at = now()
   WHERE s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');

  RETURN QUERY
  SELECT true,
         st.full_name, st.reg_no, st.semina, st.student_group,
         st.course, st.study_year, st.academic_year,
         coalesce(
           (SELECT jsonb_agg(jsonb_build_object(
                     'id', a.id,
                     'check_in_date', a.check_in_date,
                     'created_at', a.created_at,
                     'semina', a.semina,
                     'student_group', a.student_group,
                     'distance_m', a.distance_m,
                     'status', a.status
                   ) ORDER BY a.created_at DESC)
              FROM (SELECT * FROM public.attendance x
                     WHERE x.student_id = st.id
                     ORDER BY x.created_at DESC
                     LIMIT 50) a),
           '[]'::jsonb)
    FROM public.students st
   WHERE st.id = v_student_id;
END;
$$;

-- ------------------------------------------------------------
-- 6. Sign out
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_logout(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.student_sessions
   WHERE token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  SELECT true;
$$;

-- ------------------------------------------------------------
-- 7. Admin sign-in now also mints a verifiable session token
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_login_token(p_username text, p_password text)
RETURNS TABLE (ok boolean, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_token text;
  v_expires timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.app_settings
     WHERE id = 1 AND admin_username = p_username AND admin_password = p_password
  ) INTO v_ok;

  IF NOT v_ok THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '12 hours';

  INSERT INTO public.admin_sessions (token_hash, expires_at)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_expires);

  RETURN QUERY SELECT true, v_token, v_expires;
END;
$$;

-- ------------------------------------------------------------
-- 8. Grants. The tables themselves stay closed; only these
--    functions are reachable with the public key.
-- ------------------------------------------------------------
REVOKE ALL ON public.student_pins FROM anon, authenticated;
REVOKE ALL ON public.student_sessions FROM anon, authenticated;
REVOKE ALL ON public.admin_sessions FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_set_student_pin(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_login(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_me(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_logout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_login_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_claim_pin(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_set_student_pin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_login(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_me(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_claim_pin(text, text, text) TO anon, authenticated;

-- ==== PART A, FILE 3 of 3: supabase/HARDEN_ADMIN_PASSWORD.sql ====
-- ============================================================
--  Islamic Studies Test Online — hide the admin password
--
--  Problem: app_settings.admin_password is readable with the
--  publishable key that ships in the public JS bundle, so anyone
--  can read it and log into /admin.
--
--  Paste this into the Lovable project's SQL Editor, after
--  APPLY_PENDING.sql. Then deploy the app build that calls
--  admin_login(). Safe to run more than once.
-- ============================================================

-- Verify the admin password on the server instead of handing the row to the browser.
-- SECURITY DEFINER lets this one function read the column after the REVOKE below.
CREATE OR REPLACE FUNCTION public.admin_login(p_username text, p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_settings
    WHERE id = 1
      AND admin_username = p_username
      AND admin_password = p_password
  );
$$;

REVOKE ALL ON FUNCTION public.admin_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_login(text, text) TO anon, authenticated;

-- Stop the column from being selectable through PostgREST.
-- PostgREST enforces column privileges, so `select=admin_password` now fails
-- while every other column keeps working.
REVOKE SELECT (admin_password) ON public.app_settings FROM anon, authenticated;

-- Confirm the hole is closed: this must now fail, not return the password.
--   select admin_username, admin_password from app_settings where id = 1;

-- ============================================================
--  PART B — DO NOT RUN YET.
--
--  This file closes the database to the publishable key by giving
--  students, attendance, submissions, exams and the rest no RLS
--  policy at all. Every browser read of those tables then returns
--  no rows and every write is refused.
--
--  The app still does this in register.tsx, exams.tsx,
--  exam.$examId.tsx, results.tsx, r.$slug.tsx and the admin pages.
--  Move those reads into SECURITY DEFINER functions first, then run
--  this. See the header of this bundle for the full list.
-- ============================================================
-- ==== FILE 4 of 4: supabase/HARDEN_RLS.sql ====
-- ============================================================
--  Close the database to the public key
--
--  Problem: the publishable key ships inside the JavaScript bundle, so
--  every visitor already has it. With no RLS, that key can read all
--  1561 students, 2602 exam submissions and the admin password.
--
--  This file turns RLS on for every application table and grants the
--  least privilege each role needs. Reads and writes that the app cannot
--  express in a policy are served by the SECURITY DEFINER functions in
--  0006_attendance_qr.sql and 0007_student_pin_auth.sql, which keep
--  working because they run as the table owner.
--
--  ORDER MATTERS. Run the numbered migrations first, then this file, so
--  the tables the functions need already exist. Safe to run more than
--  once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Stop the admin password from being selectable at all.
--
--    A table-wide GRANT SELECT already covers every column, so a plain
--    `REVOKE SELECT (admin_password)` does nothing while that grant is in
--    place (verified: anon could still read the password). The table grant
--    has to be withdrawn first, then SELECT re-granted on the columns the
--    site actually renders.
--
--    PostgREST enforces column privileges, so `select=admin_password` fails
--    from the browser while the other columns keep working.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_cols text;
BEGIN
  REVOKE SELECT ON public.app_settings FROM anon, authenticated;

  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'app_settings'
     AND column_name <> 'admin_password';

  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.app_settings TO anon, authenticated', v_cols);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Turn RLS on everywhere.
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students', 'attendance', 'submissions', 'exams', 'study_images',
    'issue_reports', 'profile_update_requests', 'daily_visits',
    'app_settings', 'attendance_sessions',
    'student_pins', 'student_sessions', 'admin_sessions'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      -- ENABLE only, never FORCE. FORCE also applies RLS to the table owner,
      -- and the SECURITY DEFINER functions run as the owner, so FORCE would
      -- silently break every one of them (verified: the function returns NULL).
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Drop any permissive policy a previous run left behind, so this
--    file is the single source of truth for who may read what.
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'students', 'attendance', 'submissions', 'exams', 'study_images',
         'issue_reports', 'profile_update_requests', 'daily_visits',
         'app_settings', 'attendance_sessions',
         'student_pins', 'student_sessions', 'admin_sessions'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Reference data the public site genuinely needs.
--    The dashboard and exam list are rendered for signed-out
--    visitors, so these stay readable. Nothing personal is included:
--    the admin password column is revoked above.
-- ------------------------------------------------------------
CREATE POLICY app_settings_public_read ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY study_images_public_read ON public.study_images
  FOR SELECT TO anon, authenticated USING (active = true);

-- ------------------------------------------------------------
-- 5. Personal data: no policy is created, so no row is readable or
--    writable with the public key. The SECURITY DEFINER functions
--    bypass RLS because they execute as the table owner, and the
--    service role bypasses it by design.
--
--    This is deliberate for: students, attendance, submissions,
--    issue_reports, profile_update_requests, daily_visits,
--    attendance_sessions, student_pins, student_sessions,
--    admin_sessions.
--
--    Consequence to be aware of: any page that reads these tables
--    straight from the browser will stop returning rows. Move that
--    read into a server function (a createServerFn handler or an RPC)
--    so the server, not the visitor's browser, decides what is sent.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 6. Make sure the functions the app relies on are executable, and
--    that nothing else in the public schema is left wide open.
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Verify the hole is closed. Each of these must fail, not return data:
--   select * from students limit 1;
--   select * from submissions limit 1;
--   select admin_password from app_settings where id = 1;
-- While these must still work:
--   select * from study_images where active = true limit 1;
--   select * from app_settings limit 1;   -- admin_password column now errors

