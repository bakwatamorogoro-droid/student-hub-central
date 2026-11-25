-- Course on an exam: a name and a compulsory code.
--
-- The admin composes a test against a course ("Introduction to Qur'an and Hadith
-- Studies", code IS120) so the list and the results can be read per course
-- instead of by title alone. The code is what a student recognises on a
-- timetable, so the form requires it when a test is created.
--
-- Both columns are nullable: three tests already exist without a course, and
-- backfilling them would mean inventing a code. The form treats the pair as
-- required on create and optional on edit, which keeps old papers editable.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS course_name text;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS course_code text;

COMMENT ON COLUMN public.exams.course_name IS
  'Full course title the test belongs to, e.g. "Introduction to Qur''an and Hadith Studies".';

COMMENT ON COLUMN public.exams.course_code IS
  'Short course code as it appears on the timetable, uppercase and without spaces, e.g. IS120.';

-- Students filter and group by course, and the admin list sorts by it.
CREATE INDEX IF NOT EXISTS exams_course_code_idx
  ON public.exams (course_code)
  WHERE course_code IS NOT NULL;

-- A code identifies a course, so the same code must not be spelled two ways.
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_course_code_upper_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_course_code_upper_chk
  CHECK (course_code IS NULL OR course_code = upper(replace(course_code, ' ', '')));
