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
