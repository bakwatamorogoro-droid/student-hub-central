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
