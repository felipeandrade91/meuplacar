CREATE TABLE public.physical_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('calories', 'distance')),
  value NUMERIC NOT NULL CHECK (value > 0),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.physical_samples TO authenticated;
GRANT ALL ON public.physical_samples TO service_role;

ALTER TABLE public.physical_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read physical_samples" ON public.physical_samples
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert physical_samples" ON public.physical_samples
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update physical_samples" ON public.physical_samples
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can delete physical_samples" ON public.physical_samples
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_physical_samples_user_kind ON public.physical_samples(user_id, kind);