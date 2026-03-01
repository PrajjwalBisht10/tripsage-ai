-- Store user's recent AI-generated outputs (itinerary, budget, route) for Overview and "last used" in Calendar plan.
-- Each row is one generation; user can have many. RLS restricts to own rows.

CREATE TABLE IF NOT EXISTS public.user_feature_generations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('itinerary', 'budget', 'route')),
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_feature_generations_user_created_idx
  ON public.user_feature_generations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_feature_generations_user_type_created_idx
  ON public.user_feature_generations (user_id, type, created_at DESC);

ALTER TABLE public.user_feature_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_feature_generations_select_own" ON public.user_feature_generations;
CREATE POLICY "user_feature_generations_select_own"
  ON public.user_feature_generations
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_feature_generations_insert_own" ON public.user_feature_generations;
CREATE POLICY "user_feature_generations_insert_own"
  ON public.user_feature_generations
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_feature_generations_delete_own" ON public.user_feature_generations;
CREATE POLICY "user_feature_generations_delete_own"
  ON public.user_feature_generations
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

COMMENT ON TABLE public.user_feature_generations IS 'User-facing AI outputs (itinerary, budget, route) for Overview and Calendar plan last-itinerary.';
