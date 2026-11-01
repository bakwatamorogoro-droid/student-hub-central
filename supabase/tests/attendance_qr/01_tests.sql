-- Assertions for the PIN sign-in, the QR geofence and the RLS lockdown.
-- Every SELECT prints a labelled line so a wrong value is visible, not silent.

-- =============================================================
-- A. PIN sign-in
-- =============================================================
SELECT set_config('test.admin_token', 'admin-token-for-tests', false);
INSERT INTO public.admin_sessions (token_hash, expires_at)
VALUES (encode(digest('admin-token-for-tests', 'sha256'), 'hex'), now() + interval '1 hour');

SELECT 'A1 set_pin_needs_admin', ok, reason
  FROM public.admin_set_student_pin('not-an-admin-token', 'REG-002', '482913');

SELECT 'A2 set_pin_ok', ok, full_name
  FROM public.admin_set_student_pin('admin-token-for-tests', 'REG-002', '482913');

SELECT 'A3 pin_stored_hashed', left(pin_hash, 7) AS hash_prefix, pin_hash <> '482913' AS not_plaintext
  FROM public.student_pins WHERE lower(reg_no) = 'reg-002';

SELECT 'A4 weak_pin_refused', ok, reason
  FROM public.admin_set_student_pin('admin-token-for-tests', 'REG-003', '12');

SELECT 'A5 unknown_reg_refused', ok, reason
  FROM public.admin_set_student_pin('admin-token-for-tests', 'NO-SUCH-REG', '482913');

-- Wrong PIN must fail, and must not reveal whether the registration exists.
SELECT 'A6 wrong_pin', ok, reason
  FROM public.student_login('REG-002', '000000');
SELECT 'A7 unknown_reg_same_answer', ok, reason
  FROM public.student_login('NO-SUCH-REG', '482913');

-- Correct PIN mints a session.
CREATE TEMP TABLE login AS
  SELECT * FROM public.student_login('REG-002', '482913');
SELECT 'A8 login_ok', ok, full_name, length(token) AS token_len FROM login;

SELECT 'A9 raw_token_not_stored', count(*) AS stored_raw
  FROM public.student_sessions WHERE token_hash = (SELECT token FROM login);
SELECT 'A9 hash_matches', count(*) AS hash_rows
  FROM public.student_sessions
 WHERE token_hash = encode(digest((SELECT token FROM login), 'sha256'), 'hex');

SELECT 'A10 student_me', ok, full_name, reg_no, semina, course, study_year
  FROM public.student_me((SELECT token FROM login));

SELECT 'A11 student_me_bad_token', ok FROM public.student_me('not-a-real-token');

-- Five wrong PINs lock the account, and a correct PIN stays refused while locked.
SELECT 'A12 attempts' FROM public.student_login('REG-002', '111111');
SELECT 'A12 attempts' FROM public.student_login('REG-002', '222222');
SELECT 'A12 attempts' FROM public.student_login('REG-002', '333333');
SELECT 'A12 attempts' FROM public.student_login('REG-002', '444444');
SELECT 'A12 fifth_locks', ok, reason FROM public.student_login('REG-002', '555555');
SELECT 'A13 locked_even_with_right_pin', ok, reason FROM public.student_login('REG-002', '482913');

-- Re-issuing a PIN clears the lock and kills the old session.
SELECT 'A14 reissue_clears_lock', ok FROM public.admin_set_student_pin('admin-token-for-tests', 'REG-002', '482913');
SELECT 'A14 old_session_dead', ok FROM public.student_me((SELECT token FROM login));
CREATE TEMP TABLE login2 AS SELECT * FROM public.student_login('REG-002', '482913');
SELECT 'A14 new_login_ok', ok FROM login2;

-- Sign out invalidates the token.
SELECT 'A15 logout', public.student_logout((SELECT token FROM login2)) AS done;
SELECT 'A15 after_logout', ok FROM public.student_me((SELECT token FROM login2));

-- =============================================================
-- B. QR check-in, identified by a session token
--    attendance_sessions comes from 0006_attendance_qr.sql.
-- =============================================================
INSERT INTO public.attendance_sessions (id, title, semina, student_group, lat, lng, radius_m, active)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Semina 1', 'Semina 1', 'GROUP 1', -6.8, 39.28, 50, true);

-- Minting a token without an admin session must fail.
DO $$
BEGIN
  PERFORM * FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001', 'not-an-admin');
  RAISE NOTICE 'B0 FAIL rotate allowed without admin';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'B0 ok   rotate refused without admin (%)', SQLERRM;
END $$;

CREATE TEMP TABLE t1 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001', 'admin-token-for-tests');

-- A device id that belongs to Bakari must NOT be enough on its own. Only the
-- session token identifies a student now.
SELECT 'B1 no_token_refused', ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t1), -6.8003, 39.28, NULL);
SELECT 'B2 device_id_useless', ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t1), -6.8003, 39.28, 'dev-amina');

-- Issue Amina a PIN (an admin action), then sign in. ~33 m away: inside 50 m.
SELECT 'B3 amina_set_pin', ok FROM public.admin_set_student_pin('admin-token-for-tests', 'MUM2025-04-14106', '135790');
CREATE TEMP TABLE amina2 AS SELECT token FROM public.student_login('MUM2025-04-14106', '135790');

SELECT 'B4 inside_50m', ok, full_name, round(distance_m::numeric, 1) AS dist
  FROM public.attendance_check_in_qr((SELECT token FROM t1), -6.8003, 39.28, (SELECT token FROM amina2));

SELECT 'B5 duplicate_refused', ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t1), -6.8003, 39.28, (SELECT token FROM amina2));

SELECT 'B5 one_row_only', count(*) AS rows FROM public.attendance WHERE full_name = 'Amina Yusuf';

-- Chausiku has no PIN yet, so her token cannot exist.
SELECT 'B6 no_session_no_checkin', ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t1), -6.8003, 39.28, 'deadbeef');

-- Outside the radius: ~111 m away for a 50 m session.
CREATE TEMP TABLE t2 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001', 'admin-token-for-tests');
SELECT 'B7 outside_area', ok, reason, round(distance_m::numeric, 1) AS dist, radius_m
  FROM public.attendance_check_in_qr((SELECT token FROM t2), -6.801, 39.28, (SELECT token FROM amina2));

-- Wrong QR token.
SELECT 'B8 invalid_token', ok, reason
  FROM public.attendance_check_in_qr('not-the-current-token', -6.8003, 39.28, (SELECT token FROM amina2));

-- An expired token is refused.
UPDATE public.attendance_sessions
   SET token_expires_at = now() - interval '1 minute'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT 'B9 expired_token', ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t2), -6.8003, 39.28, (SELECT token FROM amina2));

-- A closed session is refused.
CREATE TEMP TABLE t3 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001', 'admin-token-for-tests');
UPDATE public.attendance_sessions SET active = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT 'B10 session_closed', ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t3), -6.8003, 39.28, (SELECT token FROM amina2));
UPDATE public.attendance_sessions SET active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- The recorded row carries the real attendance columns.
SELECT 'B11 row_shape', check_in_date IS NOT NULL AS has_date, status, distance_m IS NOT NULL AS has_dist,
       student_id IS NOT NULL AS has_student
  FROM public.attendance WHERE full_name = 'Amina Yusuf' LIMIT 1;

-- BUG FIX: the row must be linked to its session, or the teacher's per-session
-- present list is always empty.
SELECT 'B12 row_has_session' AS t, session_id IS NOT NULL AS linked, method
  FROM public.attendance WHERE full_name = 'Amina Yusuf' LIMIT 1;
SELECT 'B12 present_list_sees_her' AS t, count(*) AS rows
  FROM public.attendance_session_present('admin-token-for-tests', 'aaaaaaaa-0000-0000-0000-000000000001');
DO $$
BEGIN
  PERFORM * FROM public.attendance_session_present('not-an-admin', 'aaaaaaaa-0000-0000-0000-000000000001');
  RAISE NOTICE 'B12 FAIL present list allowed without admin';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'B12 ok   present list refused without admin (%)', SQLERRM;
END $$;

-- BUG FIX: a student attends several lectures a day. The old once-per-day rule
-- refused the second one.
INSERT INTO public.attendance_sessions (id, title, semina, student_group, lat, lng, radius_m, active)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'Semina 2', 'Semina 1', 'GROUP 1', -6.8, 39.28, 50, true);
CREATE TEMP TABLE t4 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000002', 'admin-token-for-tests');
SELECT 'B13 second_session_same_day' AS t, ok, full_name
  FROM public.attendance_check_in_qr((SELECT token FROM t4), -6.8003, 39.28, (SELECT token FROM amina2));
SELECT 'B13 two_rows' AS t, count(*) AS rows FROM public.attendance WHERE full_name = 'Amina Yusuf';
-- ...but the same session still refuses a repeat.
SELECT 'B14 same_session_refused' AS t, ok, reason
  FROM public.attendance_check_in_qr((SELECT token FROM t4), -6.8003, 39.28, (SELECT token FROM amina2));

-- The join code path: a student without a working camera types the code.
INSERT INTO public.attendance_sessions (id, title, semina, student_group, lat, lng, radius_m, active, join_code)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'Semina 3', 'Semina 1', 'GROUP 1', -6.8, 39.28, 50, true, 'K7M2QX');
SELECT 'B15 join_code_set' AS t, join_code FROM public.attendance_sessions
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT 'B16 join_code_checkin' AS t, ok, full_name
  FROM public.attendance_check_in(NULL, -6.8003, 39.28, (SELECT token FROM amina2), 'k7m2qx');
SELECT 'B16 code_method' AS t, method FROM public.attendance
 WHERE full_name = 'Amina Yusuf' AND session_id = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT 'B17 wrong_code_refused' AS t, ok, reason
  FROM public.attendance_check_in(NULL, -6.8003, 39.28, (SELECT token FROM amina2), 'NOPE');

-- Amina has now attended every open session, so her list is empty. Daudi has
-- attended none and is in GROUP 1, so nothing scoped to another group appears.
SELECT 'B18 open_sessions_empty_when_done' AS t, count(*) AS rows
  FROM public.attendance_open_sessions((SELECT token FROM amina2));
CREATE TEMP TABLE daudi_pin AS
  SELECT pin FROM public.student_claim_pin('REG-004', '0000000', 'dev-daudi');
SELECT 'B18b wrong_details_no_pin' AS t, pin IS NULL AS no_pin FROM daudi_pin;

-- =============================================================
-- B2. Claiming a PIN without an admin
-- =============================================================
-- Wrong phone: refused, and the answer does not reveal whether the reg exists.
SELECT 'B19 claim_wrong_phone' AS t, ok, reason
  FROM public.student_claim_pin('MUM2025-04-14106', '0700000000', 'dev-phone-a');
SELECT 'B20 claim_unknown_reg_same_answer' AS t, ok, reason
  FROM public.student_claim_pin('NO-SUCH-REG', '0700000000', 'dev-phone-a');
-- Right details: a PIN is returned once.
CREATE TEMP TABLE claim AS
  SELECT * FROM public.student_claim_pin('REG-003', '0765111222', 'dev-phone-a');
SELECT 'B21 claim_ok' AS t, ok, full_name, length(pin) AS pin_len FROM claim;
SELECT 'B22 claim_pin_hashed' AS t, left(pin_hash, 7) AS hash_prefix,
       pin_hash <> (SELECT pin FROM claim) AS not_plaintext
  FROM public.student_pins WHERE lower(reg_no) = 'reg-003';
-- Signing in with the claimed PIN works on the claiming phone...
CREATE TEMP TABLE c_login AS
  SELECT * FROM public.student_login('REG-003', (SELECT pin FROM claim), 'dev-phone-a');
SELECT 'B23 login_on_own_device' AS t, ok, full_name FROM c_login;
-- ...and is refused on another phone, so the PIN cannot be shared.
SELECT 'B24 login_other_device_refused' AS t, ok, reason
  FROM public.student_login('REG-003', (SELECT pin FROM claim), 'dev-phone-b');
-- A PIN already claimed elsewhere is not re-issued to a stranger.
SELECT 'B25 claim_again_other_device' AS t, ok, reason
  FROM public.student_claim_pin('REG-003', '0765111222', 'dev-phone-b');
-- An admin reset clears the binding, which is how a new phone is recovered.
SELECT 'B26 admin_reset_ok' AS t, ok FROM public.admin_set_student_pin('admin-token-for-tests', 'REG-003', '246810');
SELECT 'B27 login_after_reset' AS t, ok, full_name
  FROM public.student_login('REG-003', '246810', 'dev-phone-b');
-- Chausiku has no phone on file, so she cannot self-claim.
SELECT 'B28 claim_without_phone' AS t, ok, reason
  FROM public.student_claim_pin('REG-004', '', 'dev-x');

-- =============================================================
-- B29. Starting and closing a session go through admin-checked
--      functions. A table write cannot work once RLS is on.
-- =============================================================
DO $$
BEGIN
  PERFORM count(*) FROM public.attendance_start_session('not-an-admin-token', 'Bila ruhusa', NULL, NULL, NULL, NULL, 50, 'ZZZZZZ');
  RAISE NOTICE 'B29 FAIL start accepted a bad admin token';
EXCEPTION WHEN raise_exception THEN
  RAISE NOTICE 'B29 ok   start_needs_admin';
WHEN OTHERS THEN
  RAISE NOTICE 'B29 FAIL unexpected error: %', SQLERRM;
END $$;

SELECT 'B29b start_ok' AS t, title, radius_m, join_code IS NOT NULL AS has_code
  FROM public.attendance_start_session('admin-token-for-tests', 'Historia ya Kiislamu', 'Semina 3', 'GROUP 3', -6.8, 39.28, 75, 'K7M2QX');

SELECT 'B29c start_deduplicates_code' AS t, count(DISTINCT join_code) AS distinct_codes
  FROM public.attendance_start_session('admin-token-for-tests', 'Kipindi cha pili', NULL, NULL, NULL, NULL, 50, 'K7M2QX');

DO $$
BEGIN
  PERFORM count(*) FROM public.attendance_end_session('not-an-admin-token', 'aaaaaaaa-0000-0000-0000-000000000001');
  RAISE NOTICE 'B30 FAIL close accepted a bad admin token';
EXCEPTION WHEN raise_exception THEN
  RAISE NOTICE 'B30 ok   close_needs_admin';
WHEN OTHERS THEN
  RAISE NOTICE 'B30 FAIL unexpected error: %', SQLERRM;
END $$;

SELECT 'B30b close_ok' AS t, coalesce(bool_or(ok), false) AS ok
  FROM public.attendance_end_session('admin-token-for-tests', 'aaaaaaaa-0000-0000-0000-000000000001');
SELECT 'B30c session_inactive' AS t, active = false AS closed
  FROM public.attendance_sessions WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.attendance_sessions SET active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- =============================================================
-- C. RLS lockdown
--    These run as `anon`, the role the browser's publishable key maps to.
-- =============================================================

-- Nothing readable or writable with the public key alone.
-- `SET ROLE anon` is what PostgREST does for a request carrying the publishable key.
DO $$
DECLARE
  n bigint;
  names text[] := ARRAY['students','submissions','attendance','student_pins','student_sessions','admin_sessions'];
  t text;
  q text;
BEGIN
  SET LOCAL ROLE anon;

  FOREACH t IN ARRAY names LOOP
    q := format('SELECT count(*) FROM public.%I', t);
    BEGIN
      EXECUTE q INTO n;
      RAISE NOTICE 'C1 FAIL % readable as anon: % rows', t, n;
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      RAISE NOTICE 'C1 ok   % not readable as anon', t;
    END;
  END LOOP;

  -- The admin password column must not be selectable at all.
  BEGIN
    EXECUTE 'SELECT length(admin_password) FROM public.app_settings WHERE id = 1' INTO n;
    RAISE NOTICE 'C2 FAIL admin_password readable as anon';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'C2 ok   admin_password revoked from anon';
  END;

  -- The functions must still work, because they run as the table owner.
  BEGIN
    PERFORM public.student_login('REG-002', '482913');
    RAISE NOTICE 'C3 ok   student_login still callable as anon';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C3 FAIL student_login broke under RLS: %', SQLERRM;
  END;

  BEGIN
    PERFORM * FROM public.student_me('any-token');
    RAISE NOTICE 'C4 ok   student_me still callable as anon';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C4 FAIL student_me broke under RLS: %', SQLERRM;
  END;

  -- Public reference data stays readable.
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.study_images WHERE active = true' INTO n;
    RAISE NOTICE 'C5 ok   study_images readable as anon: % rows', n;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C5 FAIL study_images not readable: %', SQLERRM;
  END;

  -- The teacher cannot write a session row directly: HARDEN_RLS gives
  -- attendance_sessions no policy, which is exactly why the start and end
  -- functions exist.
  BEGIN
    EXECUTE $q$INSERT INTO public.attendance_sessions (title) VALUES ('kwa mkono')$q$;
    RAISE NOTICE 'C6 FAIL anon inserted a session directly';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'C6 ok   anon cannot insert a session directly';
  END;

  BEGIN
    EXECUTE $q$UPDATE public.attendance_sessions SET active = false$q$;
    RAISE NOTICE 'C7 ok   anon update touches no row (%)', 'no policy';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'C7 ok   anon cannot update a session directly';
  END;

  -- The session functions themselves must survive RLS.
  BEGIN
    PERFORM count(*) FROM public.attendance_start_session('not-an-admin', 'x', NULL, NULL, NULL, NULL, 50, 'ABCDEF');
    RAISE NOTICE 'C8 FAIL start_session accepted a bad admin token';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'C8 ok   start_session still checks the admin token under RLS';
  WHEN OTHERS THEN
    RAISE NOTICE 'C8 ok   start_session refused (%), not a privilege error', SQLERRM;
  END;

  BEGIN
    PERFORM * FROM public.student_claim_pin('REG-004', '0765111222', 'dev-x');
    RAISE NOTICE 'C9 ok   student_claim_pin callable as anon';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C9 FAIL student_claim_pin broke under RLS: %', SQLERRM;
  END;
END $$;
