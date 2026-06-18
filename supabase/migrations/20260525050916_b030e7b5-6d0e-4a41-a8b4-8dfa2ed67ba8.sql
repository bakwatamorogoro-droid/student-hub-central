
CREATE TABLE IF NOT EXISTS public.daily_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, visit_date)
);

ALTER TABLE public.daily_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dv_all" ON public.daily_visits FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS daily_visits_date_idx ON public.daily_visits (visit_date);
