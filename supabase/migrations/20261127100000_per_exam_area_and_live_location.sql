-- Kila mtihani una eneo lake.
--
-- Hadi sasa eneo lilikuwa la chuo kizima: kituo kimoja (`attendance_lat/_lng`)
-- na umbali mmoja (`exam_radius_m`) kwenye `app_settings`. Mwalimu aliyetaka
-- mtihani mmoja ufanyike darasani na mwingine popote hakuwa na njia ya kusema.
--
-- `area_mode` ni maneno matatu, si boolean, kwa sababu mitihani yote iliyopo
-- haina thamani hapa. `NULL` inamaanisha "kama ilivyokuwa": fuata mpangilio wa
-- chuo. Kwa hiyo hakuna mtihani wa zamani unaobadilika tabia kwa kupata safu hii.
--
--   NULL       fuata app_settings (tabia ya zamani)
--   'off'      mwanafunzi anaweza kufanya popote
--   'classroom' lazima awe ndani ya eneo la mtihani huu
--
-- Kituo cha mtihani ni safu zake mwenyewe, kwa sababu darasa la Test 1 si
-- lazima liwe darasa la Test 2, na kituo cha chuo kinaweza kubadilika baadaye
-- bila kubadilisha eneo ambalo mtihani ulifanyika.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS area_mode text;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS area_lat double precision;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS area_lng double precision;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS area_radius_m integer;

COMMENT ON COLUMN public.exams.area_mode IS
  'NULL = follow app_settings; off = sat anywhere; classroom = fenced to area_lat/area_lng.';

COMMENT ON COLUMN public.exams.area_lat IS
  'Latitude of the classroom for this paper. NULL falls back to the school centre.';

COMMENT ON COLUMN public.exams.area_lng IS
  'Longitude of the classroom for this paper. NULL falls back to the school centre.';

COMMENT ON COLUMN public.exams.area_radius_m IS
  'Allowed distance from the centre, in metres. NULL falls back to app_settings.exam_radius_m.';

-- The two words are the whole vocabulary. A typo must fail on write rather than
-- quietly becoming "no fence", which is the unsafe direction.
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_area_mode_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_area_mode_chk
  CHECK (area_mode IS NULL OR area_mode IN ('off', 'classroom'));

-- A classroom with half a centre cannot place anyone, so the pair travels
-- together. Either both are set or neither is.
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_area_pair_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_area_pair_chk
  CHECK ((area_lat IS NULL) = (area_lng IS NULL));

ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_area_radius_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_area_radius_chk
  CHECK (area_radius_m IS NULL OR area_radius_m > 0);

-- Live location: the student's last known point, so the teacher's live panel can
-- show who is drifting away instead of only who was inside at the start.
--
-- Written by watchPosition while the paper is open. Deliberately the *recent*
-- point rather than a trail: a trail would be a movement history of every
-- student, which is more data than the question "is he still in the room"
-- needs. `proctor->'gps_flags'` keeps the summary.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS live_lat double precision;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS live_lng double precision;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS live_distance_m double precision;

COMMENT ON COLUMN public.submissions.live_lat IS
  'Last position reported while the paper was open. Not a movement trail.';

COMMENT ON COLUMN public.submissions.live_lng IS
  'Last position reported while the paper was open. Not a movement trail.';

COMMENT ON COLUMN public.submissions.live_distance_m IS
  'Distance from the fence centre at that last reading, in metres.';

-- The live panel asks for open papers of one exam, most recently seen first.
CREATE INDEX IF NOT EXISTS submissions_live_distance_idx
  ON public.submissions (exam_id, last_seen_at DESC)
  WHERE submitted_at IS NULL;
