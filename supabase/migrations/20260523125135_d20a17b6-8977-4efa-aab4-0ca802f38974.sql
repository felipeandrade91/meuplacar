
-- 1. Add user_id column
ALTER TABLE public.matches ADD COLUMN user_id uuid;
CREATE INDEX IF NOT EXISTS matches_user_id_idx ON public.matches(user_id);

-- 2. Drop old open policies
DROP POLICY IF EXISTS "Public read matches" ON public.matches;
DROP POLICY IF EXISTS "Public insert matches" ON public.matches;
DROP POLICY IF EXISTS "Public update matches" ON public.matches;
DROP POLICY IF EXISTS "Public delete matches" ON public.matches;

-- 3. Owner-only policies
CREATE POLICY "Owner can read matches"
ON public.matches FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owner can insert matches"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can update matches"
ON public.matches FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can delete matches"
ON public.matches FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 4. One-time claim function for existing seed rows (user_id IS NULL)
CREATE OR REPLACE FUNCTION public.claim_unowned_matches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.matches
  SET user_id = auth.uid()
  WHERE user_id IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_unowned_matches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_unowned_matches() TO authenticated;
