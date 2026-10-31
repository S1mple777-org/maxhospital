-- Irsiy xavf xaritasi: foydalanuvchining oila tarixi (qarindosh + kasallik + tashxis yoshi).
-- Hisob-kitob kodda (_shared/heredity.ts); bu yerda faqat ma'lumot, faqat egasiga ko'rinadi.
CREATE TABLE IF NOT EXISTS public.family_history (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cases) = 'array' AND jsonb_array_length(cases) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.family_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own family history" ON public.family_history;
CREATE POLICY "Own family history" ON public.family_history FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_history TO authenticated;
NOTIFY pgrst, 'reload schema';
