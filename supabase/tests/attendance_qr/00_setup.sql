-- Minimal stand-in for the live project, using the real column names.
-- The students and attendance columns here were read from the production
-- database, so a migration that writes a column that does not exist fails here
-- too instead of failing on the live site.

DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase provides this; the app's RPCs are the only readers of it.
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

-- students: exactly the columns the live table has.
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no text NOT NULL,
  full_name text NOT NULL,
  age integer,
  gender text,
  semina text,
  student_group text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  phone text,
  course text,
  study_year integer,
  academic_year text,
  reg_lat double precision,
  reg_lng double precision
);

-- attendance: the real shape, including the NOT NULL that caught a bug.
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reg_no text NOT NULL,
  full_name text NOT NULL,
  semina text,
  student_group text,
  check_in_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  gps_lat double precision,
  gps_lng double precision,
  distance_m double precision,
  status text,
  confirmed_by_admin boolean DEFAULT false,
  confirmed_at timestamptz,
  signature_data text
);

CREATE TABLE public.app_settings (
  id integer PRIMARY KEY,
  admin_username text,
  admin_password text,
  semina_list jsonb,
  group_list jsonb,
  system_locked boolean DEFAULT false
);
INSERT INTO public.app_settings (id, admin_username, admin_password) VALUES (1, '1234', 'abdi77');

CREATE TABLE public.study_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  image_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'general'
);
INSERT INTO public.study_images (title, image_url, active) VALUES ('Hero', '/media/a.jpg', true);

CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  reg_no text,
  answers jsonb
);

GRANT SELECT ON public.app_settings, public.study_images TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Students. device_id is deliberately different from anything sent at check-in,
-- so a passing test cannot be relying on it.
INSERT INTO public.students (id, reg_no, full_name, semina, student_group, course, study_year, academic_year, device_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'MUM2025-04-14106', 'Amina Yusuf',   'Semina 1', 'GROUP 1', 'IIS', 1, '2025/2026', 'dev-amina'),
  ('22222222-2222-2222-2222-222222222222', 'REG-002',          'Bakari Said',   'Semina 1', 'GROUP 1', 'IIS', 1, '2025/2026', 'dev-bakari'),
  ('33333333-3333-3333-3333-333333333333', 'REG-003',          'Chausiku Juma', 'Semina 2', 'GROUP 2', 'IIS', 2, '2025/2026', 'dev-chausiku');
