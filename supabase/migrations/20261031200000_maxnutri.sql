-- MaxNutri: ovqatlanish kundaligi. Rasm saqlanmaydi — faqat taomlar (id + gramm) va hisoblangan jami.
CREATE TABLE IF NOT EXISTS public.nutri_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Tashkent')::date,
  meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 20),
  totals jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('photo', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutri_meals_user_day ON public.nutri_meals (user_id, day DESC);
ALTER TABLE public.nutri_meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own meals" ON public.nutri_meals;
CREATE POLICY "Own meals" ON public.nutri_meals FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutri_meals TO authenticated;

-- Shaxsiy sozlamalar: maqsad, faollik va shifokorga ko'rsatish roziligi (sukut bo'yicha — yo'q).
CREATE TABLE IF NOT EXISTS public.nutri_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal text NOT NULL DEFAULT 'keep' CHECK (goal IN ('keep', 'lose', 'gain')),
  activity text NOT NULL DEFAULT 'low' CHECK (activity IN ('low', 'medium', 'high')),
  diabetes boolean NOT NULL DEFAULT false,
  hypertension boolean NOT NULL DEFAULT false,
  share_with_doctor boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own nutri settings" ON public.nutri_settings;
CREATE POLICY "Own nutri settings" ON public.nutri_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.nutri_settings TO authenticated;

-- Rasm tahlili hisobi (limit uchun). Faqat server yozadi.
CREATE TABLE IF NOT EXISTS public.nutri_photo_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutri_photo_log_user ON public.nutri_photo_log (user_id, created_at DESC);
ALTER TABLE public.nutri_photo_log ENABLE ROW LEVEL SECURITY;

-- Shifokor (konsultatsiya davomida): bemor rozi bo'lsa — so'nggi kunlar kundaligi.
CREATE OR REPLACE FUNCTION public.get_consultation_nutrition(_consultation_id uuid, _days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p uuid; _d int := LEAST(GREATEST(COALESCE(_days, 7), 1), 30);
BEGIN
  SELECT c.patient_id INTO _p FROM public.consultations c JOIN public.doctors d ON d.id = c.doctor_id
   WHERE c.id = _consultation_id AND d.user_id = auth.uid();
  IF _p IS NULL THEN RETURN jsonb_build_object('available', false); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nutri_settings WHERE user_id = _p AND share_with_doctor) THEN
    RETURN jsonb_build_object('available', true, 'shared', false);
  END IF;
  RETURN jsonb_build_object('available', true, 'shared', true,
    'settings', (SELECT to_jsonb(s) - 'user_id' - 'share_with_doctor' FROM public.nutri_settings s WHERE s.user_id = _p),
    'meals', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', m.day, 'meal', m.meal, 'items', m.items, 'totals', m.totals) ORDER BY m.day DESC, m.created_at DESC)
                       FROM public.nutri_meals m
                       WHERE m.user_id = _p AND m.day > (now() AT TIME ZONE 'Asia/Tashkent')::date - _d), '[]'::jsonb));
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_consultation_nutrition(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_consultation_nutrition(uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
