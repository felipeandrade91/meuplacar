
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('quinta','pelada')),
  location TEXT,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public insert matches" ON public.matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update matches" ON public.matches FOR UPDATE USING (true);
CREATE POLICY "Public delete matches" ON public.matches FOR DELETE USING (true);

CREATE INDEX matches_date_idx ON public.matches (date DESC);
