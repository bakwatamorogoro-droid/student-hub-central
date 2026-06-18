CREATE TABLE IF NOT EXISTS public.study_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  caption text,
  image_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.study_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_all ON public.study_images FOR ALL USING (true) WITH CHECK (true);