ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS my_team_score integer,
  ADD COLUMN IF NOT EXISTS opponent_score integer;