
CREATE TABLE public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  recorded_on date NOT NULL,
  video_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read highlights" ON public.highlights
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert highlights" ON public.highlights
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update highlights" ON public.highlights
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can delete highlights" ON public.highlights
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('highlights', 'highlights', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner can read highlight files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'highlights' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner can upload highlight files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'highlights' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner can update highlight files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'highlights' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner can delete highlight files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'highlights' AND auth.uid()::text = (storage.foldername(name))[1]);
