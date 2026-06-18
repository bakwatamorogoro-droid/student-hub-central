ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS ai_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS auto_score numeric;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS ai_score numeric;