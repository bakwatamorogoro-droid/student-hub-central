-- ============================================================
--  Student sign-in without email — apply in this order
--
--  Paste the four files below into the Lovable project's SQL Editor,
--  one after the other, in the order shown. Each is safe to run more
--  than once.
--
--  Why this order:
--    1. The attendance tables and the check-in function must exist
--       before the PIN file, because check-in reads student_sessions.
--    2. HARDEN_RLS.sql must run last: it revokes the table grants that
--       the earlier files rely on during setup.
--
--  After applying, the app works with no email provider and no
--  service-role key. Students sign in with a registration number and a
--  PIN an admin issued from /admin/students.
--
--  Files to paste, in order:
--    1. drizzle/migrations/0006_attendance_qr.sql
--    2. drizzle/migrations/0007_student_pin_auth.sql
--    3. supabase/HARDEN_ADMIN_PASSWORD.sql
--    4. supabase/HARDEN_RLS.sql
--
--  Then verify, in the SQL Editor. These must return 0 rows:
--    select * from students limit 1;
--    select * from submissions limit 1;
--    select admin_password from app_settings where id = 1;
--
--  And these must work:
--    select * from study_images where active = true limit 1;
--    select student_login('SOME-REG-NO', 'the-pin-you-set');
-- ============================================================

-- ==== FILE 1 of 4: drizzle/migrations/0006_attendance_qr.sql ====
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
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_sessions_token_idx
  ON public.attendance_sessions (token_hash);

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_student_id uuid;
  v_hash text;
  v_distance double precision;
  v_inserted integer;
BEGIN
  v_hash := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');

  SELECT * INTO v_session
    FROM public.attendance_sessions s
   WHERE s.token_hash = v_hash
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token', NULL::text, NULL::text, NULL::double precision, NULL::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_session.token_expires_at IS NULL OR v_session.token_expires_at < now() THEN
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

  v_distance := public.attendance_distance_m(v_session.lat, v_session.lng, p_lat, p_lng);

  IF v_distance > v_session.radius_m THEN
    RETURN QUERY SELECT false, 'outside_area', NULL::text, NULL::text, v_distance, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  -- Already marked today? Checked explicitly rather than with ON CONFLICT:
  -- the live attendance table has no unique constraint on
  -- (student_id, check_in_date), so ON CONFLICT DO NOTHING never fired and a
  -- student could check in repeatedly (verified by test B5).
  IF EXISTS (
    SELECT 1 FROM public.attendance a
     WHERE a.student_id = v_student.id
       AND a.check_in_date = (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date
  ) THEN
    RETURN QUERY SELECT false, 'already_marked', v_student.full_name,
                        v_session.semina, v_distance, v_session.radius_m::double precision, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO public.attendance (
    student_id, reg_no, full_name, semina, student_group,
    check_in_date, gps_lat, gps_lng, distance_m, status
  ) VALUES (
    v_student.id, v_student.reg_no, v_student.full_name,
    coalesce(v_session.semina, v_student.semina),
    coalesce(v_session.student_group, v_student.student_group),
    (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
    p_lat, p_lng, v_distance, 'present'
  );

  RETURN QUERY SELECT true, NULL::text, v_student.full_name, v_session.semina,
                      v_distance, v_session.radius_m::double precision, now();
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_check_in_qr(text, double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_check_in_qr(text, double precision, double precision, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6b. Backstop against a double check-in.
--
--     The EXISTS test above is the friendly path; this index makes a
--     duplicate physically impossible even if two scans race, or if some
--     other code path inserts into attendance directly.
--
--     Created CONCURRENTLY is not possible inside a migration transaction, so
--     this is a plain CREATE INDEX. It is written to tolerate pre-existing
--     duplicates so the file stays safe to run on a live table.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'attendance_one_per_student_per_day'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX attendance_one_per_student_per_day
        ON public.attendance (student_id, check_in_date);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'attendance_one_per_student_per_day not created: existing duplicate rows must be cleared first';
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


-- ==== FILE 2 of 4: drizzle/migrations/0007_student_pin_auth.sql ====
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
        updated_at = now();

  -- Issuing a new PIN invalidates any session opened with the old one.
  DELETE FROM public.student_sessions WHERE student_id = v_student.id;

  RETURN QUERY SELECT true, NULL::text, v_student.full_name;
END;
$$;

-- ------------------------------------------------------------
-- 4. Student sign-in
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_login(p_reg_no text, p_pin text)
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

  UPDATE public.student_pins p
     SET failed_attempts = 0, locked_until = NULL
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
REVOKE ALL ON FUNCTION public.student_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_me(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_logout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_login_token(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_set_student_pin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_me(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_token(text, text) TO anon, authenticated;


-- ==== FILE 3 of 4: supabase/HARDEN_ADMIN_PASSWORD.sql ====
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
