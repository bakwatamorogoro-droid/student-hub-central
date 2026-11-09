-- E-Learning: the videos Dr. Jiba posts for the class.
--
-- One row is one lesson. The admin pastes a YouTube, TikTok or Facebook link;
-- the app derives the provider, the video id, the embed URL and the thumbnail
-- from that link (see `src/lib/elesson.ts`), so the row stores the link and the
-- few things the app cannot recompute cheaply. The thumbnail URL is stored
-- because a lesson whose link dies should still show its card rather than a hole.
--
-- Both languages live on the row rather than in a translation table: the owner
-- writes Swahili and English side by side, and a lesson without one of them is
-- simply shown in the other. `title`/`description` are the Swahili pair and keep
-- their bare names because that is the language the app speaks by default.

CREATE TABLE IF NOT EXISTS public.elessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Where the video lives. `provider` is one of youtube | tiktok | facebook.
  provider text NOT NULL,
  -- The provider's own id: the YouTube video id, the TikTok numeric id, the
  -- Facebook video id. Null when the link could not be reduced to one.
  video_id text,
  url text NOT NULL,
  -- Ready-to-embed URL, so the player never has to know each provider's rules.
  embed_url text NOT NULL,
  thumbnail_url text,
  -- free | lecture | mawaidha | duruus | other — see `LESSON_CATEGORIES`.
  category text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  title_en text,
  description text,
  description_en text,
  -- The study questions shown beside the player. Shape:
  --   [{ id, q: {sw,en}, a: {sw,en}, points: string[], topic: string }]
  -- Written by `buildLessonQuiz` and editable by the admin afterwards.
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- What the provider told us at save time ({ title, author, thumbnail_url }).
  -- Kept so a later edit can show what the link originally claimed.
  source_meta jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.elessons IS
  'Video lessons (lecture, mawaidha, duruus) posted by the lecturer.';
COMMENT ON COLUMN public.elessons.quiz IS
  'Study questions shown beside the player: [{id,q:{sw,en},a:{sw,en},points[],topic}].';

-- The public page lists newest first, filtered to what is switched on.
CREATE INDEX IF NOT EXISTS elessons_active_created_idx
  ON public.elessons (active, created_at DESC);

-- Same open posture as the tables the browser already reads directly: the admin
-- writes with the publishable key from `/admin/elessons`, so RLS cannot be the
-- thing that protects the row. It is kept for consistency with the rest of the
-- schema, and so a later hardening pass has a policy to tighten rather than a
-- missing one to invent.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elessons TO anon, authenticated;
GRANT ALL ON public.elessons TO service_role;

ALTER TABLE public.elessons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'elessons' AND policyname = 'elessons_all'
  ) THEN
    CREATE POLICY elessons_all ON public.elessons
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
