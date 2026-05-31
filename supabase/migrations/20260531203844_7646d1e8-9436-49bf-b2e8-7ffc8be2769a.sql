-- 1. duration on matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;

-- 2. user_profile table
CREATE TABLE public.user_profile (
  user_id uuid PRIMARY KEY,
  height_cm integer,
  weight_kg numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile TO authenticated;
GRANT ALL ON public.user_profile TO service_role;

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read profile"
  ON public.user_profile FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owner can insert profile"
  ON public.user_profile FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can update profile"
  ON public.user_profile FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can delete profile"
  ON public.user_profile FOR DELETE TO authenticated
  USING (auth.uid() = user_id);