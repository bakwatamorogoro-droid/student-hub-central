-- Test harness for 0006_attendance_qr.sql against a plain Postgres.
-- Simulates Supabase's auth.uid() with a session setting.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid;
$$;

-- Minimal stand-ins for the real tables (only the columns the migration touches).
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no text NOT NULL,
  full_name text NOT NULL,
  semina text,
  student_group text,
  auth_user_id uuid,
  device_id text
);

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  reg_no text NOT NULL,
  full_name text NOT NULL,
  semina text,
  student_group text,
  check_in_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, check_in_date)
);

-- Supabase roles, so the GRANT statements in the migration can be exercised.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
