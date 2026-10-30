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
