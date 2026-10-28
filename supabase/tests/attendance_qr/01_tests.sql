\set ON_ERROR_STOP on

-- Fixed ids so assertions are deterministic.
INSERT INTO public.students (id, reg_no, full_name, semina, student_group, auth_user_id, device_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'MUM2025-04-14106', 'Amina Yusuf', 'Semina 1', 'GROUP 1', '11111111-1111-1111-1111-111111111111', 'dev-amina-0001'),
  ('22222222-2222-2222-2222-222222222222', 'REG-002', 'Bakari Said', 'Semina 1', 'GROUP 1', '22222222-2222-2222-2222-222222222222', 'dev-bakari-0002');

-- ---------------------------------------------------------------
-- T1. Haversine distance against an independent reference value.
-- 0.0004497 deg of latitude at -6.8 is about 50.0 m.
-- ---------------------------------------------------------------
SELECT 'T1 distance_50m', round(public.attendance_distance_m(-6.8, 39.28, -6.8 + 0.0004497, 39.28)::numeric, 2);

-- ---------------------------------------------------------------
-- T2. A session with coordinates and a 50 m radius.
-- ---------------------------------------------------------------
INSERT INTO public.attendance_sessions (id, title, semina, lat, lng, radius_m)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Fiqh — Somo la 4', 'Semina 1', -6.8, 39.28, 50);

-- ---------------------------------------------------------------
-- T3. Rotating token: the raw token must not be stored.
-- ---------------------------------------------------------------
CREATE TEMP TABLE tok AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001');

SELECT 'T3 token_is_hex24', (length(token) = 48) FROM tok;
SELECT 'T3 raw_token_not_stored',
       (SELECT token_hash <> (SELECT token FROM tok)
          FROM public.attendance_sessions
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001');
SELECT 'T3 hash_matches', encode(digest((SELECT token FROM tok), 'sha256'), 'hex')
         = (SELECT token_hash FROM public.attendance_sessions
             WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------
-- T4. Invalid token is refused.
-- ---------------------------------------------------------------
SELECT 'T4 invalid_token', reason FROM public.attendance_check_in_qr('deadbeef', -6.8, 39.28, 5);

-- ---------------------------------------------------------------
-- T5. A signed-in student outside 50 m is refused.
--    0.001 deg of latitude is about 111 m.
-- ---------------------------------------------------------------
SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT 'T5 outside_area', reason,
       round(distance_m::numeric, 1) AS dist, radius_m
  FROM public.attendance_check_in_qr((SELECT token FROM tok), -6.801, 39.28, 5);

-- ---------------------------------------------------------------
-- T6. The same student inside 50 m is accepted.
-- ---------------------------------------------------------------
SELECT 'T6 accepted', ok, full_name, round(distance_m::numeric, 2) AS dist
  FROM public.attendance_check_in_qr((SELECT token FROM tok), -6.8003, 39.28, 5);

-- ---------------------------------------------------------------
-- T7. A second scan by the same student does not create another row.
-- ---------------------------------------------------------------
SELECT 'T7 duplicate_refused', reason
  FROM public.attendance_check_in_qr((SELECT token FROM tok), -6.8003, 39.28, 5);
SELECT 'T7 row_count', count(*) FROM public.attendance WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------
-- T8. A second student cannot reuse the token after it rotates
--     (the old QR goes stale), then succeeds with the new one.
-- ---------------------------------------------------------------
CREATE TEMP TABLE tok2 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001');
SELECT set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT 'T8 old_token_stale', reason
  FROM public.attendance_check_in_qr((SELECT token FROM tok), -6.8003, 39.28, 5);
SELECT 'T8 new_token_ok', ok, full_name
  FROM public.attendance_check_in_qr((SELECT token FROM tok2), -6.8003, 39.28, 5);

-- ---------------------------------------------------------------
-- T9. Boundary: exactly at the radius is allowed, just past it is not.
-- ---------------------------------------------------------------
UPDATE public.attendance_sessions
   SET lat = -6.8, lng = 39.28, radius_m = 50
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

CREATE TEMP TABLE tok3 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001');

-- 0.0004 deg of latitude is about 44.5 m => inside, must be accepted.
INSERT INTO public.students (id, reg_no, full_name, auth_user_id, device_id) VALUES
  ('33333333-3333-3333-3333-333333333333', 'REG-003', 'Chausiku Juma', '33333333-3333-3333-3333-333333333333', 'dev-chausiku-0003');
SELECT set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
SELECT 'T9 inside_50m', ok, round(distance_m::numeric, 1) AS dist
  FROM public.attendance_check_in_qr((SELECT token FROM tok3), -6.8 + 0.0004, 39.28, 3);

-- 0.0005 deg is about 55.6 m => outside, must be refused.
CREATE TEMP TABLE tok4 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.students (id, reg_no, full_name, auth_user_id, device_id) VALUES
  ('44444444-4444-4444-4444-444444444444', 'REG-004', 'Daudi Mwinyi', '44444444-4444-4444-4444-444444444444', 'dev-daudi-0004');
SELECT set_config('test.uid', '44444444-4444-4444-4444-444444444444', false);
SELECT 'T9 outside_50m', reason, round(distance_m::numeric, 1) AS dist
  FROM public.attendance_check_in_qr((SELECT token FROM tok4), -6.8 + 0.0005, 39.28, 3);

-- ---------------------------------------------------------------
-- T10. A closed session is refused.
-- ---------------------------------------------------------------
UPDATE public.attendance_sessions
   SET active = false,
       token_hash = encode(digest('closedtok', 'sha256'), 'hex'),
       token_expires_at = now() + interval '30 seconds'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT 'T10 closed_session', reason
  FROM public.attendance_check_in_qr('closedtok', -6.8003, 39.28, 3);

-- ---------------------------------------------------------------
-- T11. An expired token is refused.
-- ---------------------------------------------------------------
UPDATE public.attendance_sessions
   SET active = true,
       token_hash = encode(digest('expiredtoken', 'sha256'), 'hex'),
       token_expires_at = now() - interval '1 second'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT 'T11 expired_token', reason
  FROM public.attendance_check_in_qr('expiredtoken', -6.8003, 39.28, 3);

-- ---------------------------------------------------------------
-- T12. An account with no student row is refused.
-- ---------------------------------------------------------------
UPDATE public.attendance_sessions
   SET token_hash = encode(digest('fresh', 'sha256'), 'hex'),
       token_expires_at = now() + interval '30 seconds'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT set_config('test.uid', '99999999-9999-9999-9999-999999999999', false);
SELECT 'T12 not_registered', reason
  FROM public.attendance_check_in_qr('fresh', -6.8003, 39.28, 3);

-- ---------------------------------------------------------------
-- T13. Device-bound check-in: no account, but a device the student
--      registered with. This is the path the live app relies on,
--      because Supabase email auth is disabled.
-- ---------------------------------------------------------------
UPDATE public.attendance_sessions
   SET active = true, lat = -6.8, lng = 39.28, radius_m = 50,
       token_hash = encode(digest('devtok', 'sha256'), 'hex'),
       token_expires_at = now() + interval '30 seconds'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- No signed-in user at all.
INSERT INTO public.students (id, reg_no, full_name, semina, student_group, device_id) VALUES
  ('55555555-5555-5555-5555-555555555555', 'REG-005', 'Fatuma Hamisi', 'Semina 1', 'GROUP 1', 'dev-fatuma-0005');
SELECT set_config('test.uid', '', false);
SELECT 'T13 device_inside', ok, full_name, round(distance_m::numeric, 1) AS dist
  FROM public.attendance_check_in_qr('devtok', -6.8003, 39.28, 5, 'dev-fatuma-0005');

-- An unknown device must not be able to check in as anyone.
CREATE TEMP TABLE tok6 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001');
SELECT 'T13 unknown_device', reason
  FROM public.attendance_check_in_qr((SELECT token FROM tok6), -6.8003, 39.28, 5, 'dev-nobody-9999');

-- A device-bound student outside the radius is still refused.
CREATE TEMP TABLE tok7 AS
  SELECT token FROM public.attendance_rotate_token('aaaaaaaa-0000-0000-0000-000000000001');
SELECT 'T13 device_outside', reason, round(distance_m::numeric, 1) AS dist
  FROM public.attendance_check_in_qr((SELECT token FROM tok7), -6.801, 39.28, 5, 'dev-daudi-0004');
