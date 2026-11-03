-- Shifokor maosh hisobi: har bir yakunlangan konsultatsiya uchun to'langan narxning 35 foizi
-- avtomatik shifokor hisobiga yoziladi. Foiz platform_settings'da (kalit: doctor_share_pct).
-- Qayta ishga tushirish xavfsiz.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.platform_settings TO service_role;
DROP POLICY IF EXISTS "Owner manages platform settings" ON public.platform_settings;
CREATE POLICY "Owner manages platform settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
INSERT INTO public.platform_settings (key, value) VALUES ('doctor_share_pct', '35') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.doctor_share_pct()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT LEAST(100, GREATEST(0, COALESCE((SELECT value::numeric FROM public.platform_settings WHERE key = 'doctor_share_pct'), 35)));
$$;

CREATE TABLE IF NOT EXISTS public.doctor_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  gross_uzs bigint NOT NULL CHECK (gross_uzs >= 0),        -- bemor to'lagan konsultatsiya narxi
  share_pct numeric NOT NULL CHECK (share_pct BETWEEN 0 AND 100),
  amount_uzs bigint NOT NULL CHECK (amount_uzs >= 0),      -- shifokor ulushi
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS doctor_earnings_consultation_idx ON public.doctor_earnings (consultation_id);
CREATE INDEX IF NOT EXISTS doctor_earnings_doctor_idx ON public.doctor_earnings (doctor_id, created_at DESC);

ALTER TABLE public.doctor_earnings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.doctor_earnings TO authenticated;
GRANT ALL ON public.doctor_earnings TO service_role;
DROP POLICY IF EXISTS "Doctors view own earnings" ON public.doctor_earnings;
CREATE POLICY "Doctors view own earnings" ON public.doctor_earnings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_earnings.doctor_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS "Staff view earnings" ON public.doctor_earnings;
CREATE POLICY "Staff view earnings" ON public.doctor_earnings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- Konsultatsiya yakunlanganda (qaysi yo'l bilan bo'lmasin) ulush avtomatik yoziladi; bir marta.
CREATE OR REPLACE FUNCTION public.accrue_doctor_earning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pct numeric := public.doctor_share_pct();
BEGIN
  IF COALESCE(NEW.price_uzs, 0) > 0 AND NEW.doctor_id IS NOT NULL THEN
    INSERT INTO public.doctor_earnings (doctor_id, consultation_id, gross_uzs, share_pct, amount_uzs)
    VALUES (NEW.doctor_id, NEW.id, NEW.price_uzs, _pct, floor(NEW.price_uzs * _pct / 100)::bigint)
    ON CONFLICT (consultation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS consultation_accrue_earning ON public.consultations;
CREATE TRIGGER consultation_accrue_earning
  AFTER UPDATE OF status ON public.consultations
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.accrue_doctor_earning();

-- Shifokor kabineti uchun: maosh hisobi xulosasi.
CREATE OR REPLACE FUNCTION public.my_doctor_earnings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _doc uuid; _month timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent';
BEGIN
  SELECT id INTO _doc FROM public.doctors WHERE user_id = auth.uid();
  IF _doc IS NULL THEN RETURN jsonb_build_object('is_doctor', false); END IF;
  RETURN jsonb_build_object(
    'is_doctor', true,
    'pct', public.doctor_share_pct(),
    'accrued_uzs', COALESCE((SELECT sum(amount_uzs) FROM public.doctor_earnings WHERE doctor_id = _doc AND status = 'accrued'), 0),
    'paid_uzs', COALESCE((SELECT sum(amount_uzs) FROM public.doctor_earnings WHERE doctor_id = _doc AND status = 'paid'), 0),
    'month_uzs', COALESCE((SELECT sum(amount_uzs) FROM public.doctor_earnings WHERE doctor_id = _doc AND created_at >= _month), 0),
    'count', (SELECT count(*) FROM public.doctor_earnings WHERE doctor_id = _doc),
    'recent', COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at DESC) FROM (
        SELECT created_at, gross_uzs, share_pct, amount_uzs, status
        FROM public.doctor_earnings WHERE doctor_id = _doc ORDER BY created_at DESC LIMIT 30) r), '[]'::jsonb)
  );
END; $$;

-- Owner shifokorga to'lov qilganini belgilaydi (hisoblangan -> to'langan).
CREATE OR REPLACE FUNCTION public.mark_doctor_earnings_paid(_doctor_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sum bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  WITH u AS (
    UPDATE public.doctor_earnings SET status = 'paid', paid_at = now()
    WHERE doctor_id = _doctor_id AND status = 'accrued' RETURNING amount_uzs
  ) SELECT COALESCE(sum(amount_uzs), 0) INTO _sum FROM u;
  RETURN _sum;
END; $$;

REVOKE EXECUTE ON FUNCTION public.my_doctor_earnings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_doctor_earnings_paid(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.doctor_share_pct() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_doctor_earnings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_doctor_earnings_paid(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
