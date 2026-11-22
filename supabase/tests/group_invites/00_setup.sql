-- Minimal stand-in for the live project, using the real column names. The
-- migration and the RPC only touch these columns, so a name that does not exist
-- on the live table fails here too rather than on the live site.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no TEXT,
  full_name TEXT,
  phone TEXT,
  semina TEXT,
  gender TEXT,
  student_group TEXT,
  group_confirmed_at TIMESTAMPTZ,
  edit_unlocked_at TIMESTAMPTZ,
  edit_used_at TIMESTAMPTZ
);
