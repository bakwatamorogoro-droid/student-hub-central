
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS pdf_url text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS autosave_disabled boolean NOT NULL DEFAULT false;

-- Allow admin (anon) to insert/update/delete announcements & exams & questions & app_settings via existing client (since admin auth is app-level)
DO $$ BEGIN
  CREATE POLICY "anon write announcements ins" ON public.announcements FOR INSERT TO public WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write announcements upd" ON public.announcements FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write announcements del" ON public.announcements FOR DELETE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write exams ins" ON public.exams FOR INSERT TO public WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write exams upd" ON public.exams FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write exams del" ON public.exams FOR DELETE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write questions ins" ON public.questions FOR INSERT TO public WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write questions upd" ON public.questions FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon write questions del" ON public.questions FOR DELETE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write settings upd" ON public.app_settings FOR UPDATE TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage policies for exam-media (announcements PDFs)
DO $$ BEGIN
  CREATE POLICY "exam-media public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'exam-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "exam-media public insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'exam-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "exam-media public update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'exam-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "exam-media public delete" ON storage.objects FOR DELETE TO public USING (bucket_id = 'exam-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
