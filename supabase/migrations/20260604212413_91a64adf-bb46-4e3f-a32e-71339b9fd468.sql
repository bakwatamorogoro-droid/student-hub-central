ALTER TABLE public.study_images ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'gallery';
CREATE INDEX IF NOT EXISTS idx_study_images_category ON public.study_images(category);