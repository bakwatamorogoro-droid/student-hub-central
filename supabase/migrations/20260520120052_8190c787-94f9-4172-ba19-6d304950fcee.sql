ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS system_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_message text NOT NULL DEFAULT 'Mfumo umefungwa kwa muda. Tafadhali subiri.',
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS results_secret_slug text NOT NULL DEFAULT 'siri-alama';