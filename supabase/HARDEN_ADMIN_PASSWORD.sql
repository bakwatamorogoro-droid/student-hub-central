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
