-- Eneo la mwalimu (GPS) linatumika mahudhurio, usajili NA mitihani.
--
-- Kituo kimoja (attendance_lat / attendance_lng) ndicho kituo cha chuo. Kila
-- kazi ina umbali wake, kwa sababu mtihani unahitaji mwanafunzi awe darasani,
-- wakati usajili unaweza kuruhusu eneo pana.
--
--   app_settings.exam_radius_m        umbali wa mtihani kutoka kituo (mita)
--   app_settings.exam_gps_required    kama mtihani unahitaji GPS
--   app_settings.results_require_pin  matokeo yanahitaji reg namba + msimbo
--
-- `submissions` huhifadhi umbali wakati wa kuwasilisha, ili mwalimu aone
-- wapi mwanafunzi alikuwa. Huhifadhiwa kwa sababu kituo kinaweza kubadilika
-- baadaye, na umbali wa kihistoria unapaswa kubaki kama ulivyokuwa.

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS exam_radius_m integer NOT NULL DEFAULT 300;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS exam_gps_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS results_require_pin boolean NOT NULL DEFAULT true;

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS gps_distance_m double precision;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS gps_radius_m integer;
