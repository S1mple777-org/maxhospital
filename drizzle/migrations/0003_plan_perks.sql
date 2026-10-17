-- =====================================================================
-- MaxHospital: Free / Pro / Premium imkoniyatlari va favqulodda kredit
--  * plan_limits        : har bir tarif limiti (owner panelda o'zgartiriladi)
--                         AI savollar/kun, bepul video daqiqa, ko'rsatkichlar AI tahlili,
--                         tahlil natijasini o'qish/oy, favqulodda kredit miqdori
--  * emergency_credits  : balans yetmaganda favqulodda konsultatsiya uchun qarz.
--                         Qarz to'lanmaguncha yangi konsultatsiya va obuna sotib olinmaydi.
--  * ai_chat_logs.mode  : 'lab' (tahlil natijasini o'qish) qo'shildi
-- Qoidalar (AGENTS.md): auth.users ga FK yo'q, aniq GRANT'lar, pul o'zgarishi faqat RPC orqali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tarif limitlari
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_id text PRIMARY KEY CHECK (plan_id IN ('free', 'pro', 'premium')),
  -- NULL = cheksiz (soatiga 30 ta umumiy himoya limiti baribir qoladi)
  ai_daily_questions int CHECK (ai_daily_questions IS NULL OR ai_daily_questions BETWEEN 0 AND 10000),
  video_free_minutes int NOT NULL DEFAULT 10 CHECK (video_free_minutes BETWEEN 0 AND 240),
  health_ai boolean NOT NULL DEFAULT false,
  lab_reads_monthly int NOT NULL DEFAULT 0 CHECK (lab_reads_monthly BETWEEN 0 AND 1000),
  emergency_credit_uzs bigint NOT NULL DEFAULT 0 CHECK (emergency_credit_uzs BETWEEN 0 AND 10000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_limits (plan_id, ai_daily_questions, video_free_minutes, health_ai, lab_reads_monthly, emergency_credit_uzs)
VALUES ('free', 5, 10, false, 0, 50000),
       ('pro', 50, 20, true, 5, 100000),
       ('premium', NULL, 30, true, 20, 150000)
ON CONFLICT (plan_id) DO NOTHING;

GRANT SELECT ON public.plan_limits TO anon, authenticated;
GRANT UPDATE (ai_daily_questions, video_free_minutes, health_ai, lab_reads_monthly, emergency_credit_uzs, updated_at)
  ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view plan limits" ON public.plan_limits;
CREATE POLICY "Anyone can view plan limits" ON public.plan_limits FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owner can update plan limits" ON public.plan_limits;
CREATE POLICY "Owner can update plan limits" ON public.plan_limits
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- ---------------------------------------------------------------------
-- AI statistikasi: tahlil natijasini o'qish rejimi
-- ---------------------------------------------------------------------
ALTER TABLE public.ai_chat_logs DROP CONSTRAINT IF EXISTS ai_chat_logs_mode_check;
ALTER TABLE public.ai_chat_logs ADD CONSTRAINT ai_chat_logs_mode_check CHECK (mode IN ('chat', 'trends', 'lab'));

-- ---------------------------------------------------------------------
-- Favqulodda kredit (qarz)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emergency_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consultation_id uuid UNIQUE REFERENCES public.consultations(id) ON DELETE SET NULL,
  amount_uzs bigint NOT NULL CHECK (amount_uzs > 0),
  repaid_uzs bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'repaid', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CHECK (repaid_uzs BETWEEN 0 AND amount_uzs)
);

-- Bir vaqtda faqat bitta to'lanmagan qarz.
CREATE UNIQUE INDEX IF NOT EXISTS emergency_credits_one_open_idx
  ON public.emergency_credits (user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS emergency_credits_user_idx ON public.emergency_credits (user_id, created_at DESC);

GRANT SELECT ON public.emergency_credits TO authenticated;
GRANT ALL ON public.emergency_credits TO service_role;

ALTER TABLE public.emergency_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own credits" ON public.emergency_credits;
CREATE POLICY "Users view own credits" ON public.emergency_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Staff view credits" ON public.emergency_credits;
CREATE POLICY "Staff view credits" ON public.emergency_credits
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- To'lanmagan qarz miqdori (0 = qarz yo'q).
CREATE OR REPLACE FUNCTION public.outstanding_debt(_user_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount_uzs - repaid_uzs), 0)::bigint
  FROM public.emergency_credits
  WHERE user_id = _user_id AND status = 'open';
$$;

-- ---------------------------------------------------------------------
-- Foydalanuvchi tarifi, limitlari, bugungi sarfi va qarzi (bitta so'rovda)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_status(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan text := public.plan_of(_user_id);
  _l public.plan_limits%ROWTYPE;
  _day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent';
  _month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent';
  _credit public.emergency_credits%ROWTYPE;
BEGIN
  SELECT * INTO _l FROM public.plan_limits WHERE plan_id = _plan;
  IF NOT FOUND THEN
    -- jadval bo'sh bo'lsa ham sayt ishlashi uchun xavfsiz standart qiymatlar
    _l.plan_id := _plan; _l.ai_daily_questions := 5; _l.video_free_minutes := 10;
    _l.health_ai := false; _l.lab_reads_monthly := 0; _l.emergency_credit_uzs := 0;
  END IF;
  SELECT * INTO _credit FROM public.emergency_credits WHERE user_id = _user_id AND status = 'open' LIMIT 1;

  RETURN jsonb_build_object(
    'plan', _plan,
    'limits', jsonb_build_object(
      'ai_daily_questions', _l.ai_daily_questions,
      'video_free_minutes', _l.video_free_minutes,
      'health_ai', _l.health_ai,
      'lab_reads_monthly', _l.lab_reads_monthly,
      'emergency_credit_uzs', _l.emergency_credit_uzs
    ),
    'usage', jsonb_build_object(
      'ai_today', (SELECT count(*) FROM public.ai_chat_logs
                   WHERE user_id = _user_id AND mode = 'chat' AND emergency_rule IS NULL AND created_at >= _day_start),
      'lab_month', (SELECT count(*) FROM public.ai_chat_logs
                    WHERE user_id = _user_id AND mode = 'lab' AND created_at >= _month_start)
    ),
    'debt_uzs', COALESCE(_credit.amount_uzs - _credit.repaid_uzs, 0),
    'credit', CASE WHEN _credit.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _credit.id,
      'consultation_id', _credit.consultation_id,
      'amount_uzs', _credit.amount_uzs,
      'repaid_uzs', _credit.repaid_uzs,
      'created_at', _credit.created_at
    ) END
  );
END; $$;

CREATE OR REPLACE FUNCTION public.my_plan_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  RETURN public.plan_status(auth.uid());
END; $$;

-- ---------------------------------------------------------------------
-- Konsultatsiya: qarz bo'lsa avval qarzni to'lash kerak
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_consultation(_doctor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _dept_id uuid; _price bigint; _balance bigint; _banned boolean; _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT d.department_id INTO _dept_id FROM public.doctors d WHERE d.id = _doctor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shifokor topilmadi'; END IF;
  IF _dept_id IS NULL THEN RAISE EXCEPTION 'Shifokor bo''limga biriktirilmagan'; END IF;
  SELECT COALESCE(dep.price_uzs, 0) INTO _price FROM public.departments dep WHERE dep.id = _dept_id;
  SELECT p.balance_uzs, p.is_banned INTO _balance, _banned FROM public.profiles p WHERE p.user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil topilmadi'; END IF;
  IF _banned THEN RAISE EXCEPTION 'Hisobingiz bloklangan' USING ERRCODE = '42501'; END IF;
  IF public.outstanding_debt(_uid) > 0 THEN
    RAISE EXCEPTION 'Avval favqulodda qarzni to''lang (Hamyon sahifasi)' USING ERRCODE = 'P0001', HINT = 'debt';
  END IF;
  IF _balance < _price THEN RAISE EXCEPTION 'Balansingizda yetarli mablag'' yo''q'; END IF;
  UPDATE public.profiles SET balance_uzs = balance_uzs - _price WHERE user_id = _uid;
  INSERT INTO public.consultations (patient_id, doctor_id, department_id, price_uzs)
  VALUES (_uid, _doctor_id, _dept_id, _price) RETURNING id INTO _new_id;
  RETURN _new_id;
END; $$;

-- Favqulodda konsultatsiya: balansdagi pul ishlatiladi, yetmagan qismi qarzga yoziladi.
CREATE OR REPLACE FUNCTION public.create_consultation_on_credit(_doctor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _dept_id uuid; _price bigint; _balance bigint; _banned boolean; _new_id uuid;
  _limit bigint; _shortfall bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT d.department_id INTO _dept_id FROM public.doctors d WHERE d.id = _doctor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shifokor topilmadi'; END IF;
  IF _dept_id IS NULL THEN RAISE EXCEPTION 'Shifokor bo''limga biriktirilmagan'; END IF;
  SELECT COALESCE(dep.price_uzs, 0) INTO _price FROM public.departments dep WHERE dep.id = _dept_id;

  SELECT p.balance_uzs, p.is_banned INTO _balance, _banned FROM public.profiles p WHERE p.user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil topilmadi'; END IF;
  IF _banned THEN RAISE EXCEPTION 'Hisobingiz bloklangan' USING ERRCODE = '42501'; END IF;
  IF public.outstanding_debt(_uid) > 0 THEN
    RAISE EXCEPTION 'Sizda to''lanmagan favqulodda qarz bor. Avval uni to''lang' USING HINT = 'debt';
  END IF;

  _shortfall := _price - GREATEST(_balance, 0);
  IF _shortfall <= 0 THEN RAISE EXCEPTION 'Balansingiz yetarli, oddiy konsultatsiya boshlang'; END IF;

  SELECT emergency_credit_uzs INTO _limit FROM public.plan_limits WHERE plan_id = public.plan_of(_uid);
  IF COALESCE(_limit, 0) < _shortfall THEN
    RAISE EXCEPTION 'Favqulodda kredit limiti yetmaydi (limit: % so''m, kerak: % so''m)', COALESCE(_limit, 0), _shortfall;
  END IF;

  UPDATE public.profiles SET balance_uzs = 0 WHERE user_id = _uid;
  INSERT INTO public.consultations (patient_id, doctor_id, department_id, price_uzs)
  VALUES (_uid, _doctor_id, _dept_id, _price) RETURNING id INTO _new_id;
  INSERT INTO public.emergency_credits (user_id, consultation_id, amount_uzs)
  VALUES (_uid, _new_id, _shortfall);
  RETURN _new_id;
END; $$;

-- Shifokor rad etsa: kreditli qismi qarzdan o'chiriladi, balansdan to'langan qismi qaytariladi.
CREATE OR REPLACE FUNCTION public.reject_consultation(_consultation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.consultations%ROWTYPE; _cr public.emergency_credits%ROWTYPE; _refund bigint;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Konsultatsiya topilmadi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _c.doctor_id AND d.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  IF _c.status <> 'pending' THEN RAISE EXCEPTION 'Faqat kutilayotgan so''rovni rad etish mumkin'; END IF;
  UPDATE public.consultations SET status = 'cancelled', ended_at = now() WHERE id = _consultation_id;

  _refund := _c.price_uzs;
  SELECT * INTO _cr FROM public.emergency_credits
  WHERE consultation_id = _consultation_id AND status = 'open' FOR UPDATE;
  IF FOUND THEN
    -- bemor balansdan to'lagan qism = narx - hali to'lanmagan qarz
    _refund := GREATEST(_c.price_uzs - (_cr.amount_uzs - _cr.repaid_uzs), 0);
    UPDATE public.emergency_credits SET status = 'cancelled', settled_at = now() WHERE id = _cr.id;
  END IF;
  IF _refund > 0 THEN
    UPDATE public.profiles SET balance_uzs = balance_uzs + _refund WHERE user_id = _c.patient_id;
  END IF;
END; $$;

-- Qarzni balansdan to'lash (yetganicha). Natija: yangi balans va qolgan qarz.
CREATE OR REPLACE FUNCTION public.repay_emergency_credit()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _balance bigint;
  _cr public.emergency_credits%ROWTYPE;
  _pay bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT balance_uzs INTO _balance FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil topilmadi'; END IF;
  SELECT * INTO _cr FROM public.emergency_credits WHERE user_id = _uid AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'To''lanmagan qarz yo''q'; END IF;
  _pay := LEAST(GREATEST(_balance, 0), _cr.amount_uzs - _cr.repaid_uzs);
  IF _pay <= 0 THEN RAISE EXCEPTION 'Balansda mablag'' yo''q. Avval balansni to''ldiring'; END IF;

  UPDATE public.profiles SET balance_uzs = balance_uzs - _pay WHERE user_id = _uid RETURNING balance_uzs INTO _balance;
  UPDATE public.emergency_credits
    SET repaid_uzs = repaid_uzs + _pay,
        status = CASE WHEN repaid_uzs + _pay >= amount_uzs THEN 'repaid' ELSE 'open' END,
        settled_at = CASE WHEN repaid_uzs + _pay >= amount_uzs THEN now() ELSE NULL END
    WHERE id = _cr.id
    RETURNING * INTO _cr;

  RETURN jsonb_build_object('paid_uzs', _pay, 'balance_uzs', _balance, 'debt_uzs', _cr.amount_uzs - _cr.repaid_uzs);
END; $$;

-- Qarz bo'lsa yangi obuna sotib olinmaydi (avtomatik uzaytirishga ta'sir qilmaydi).
CREATE OR REPLACE FUNCTION public.block_purchase_with_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind <> 'renewal' AND public.outstanding_debt(NEW.user_id) > 0 THEN
    RAISE EXCEPTION 'Avval favqulodda qarzni to''lang (Hamyon sahifasi)' USING HINT = 'debt';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS block_purchase_with_debt ON public.subscription_payments;
CREATE TRIGGER block_purchase_with_debt BEFORE INSERT ON public.subscription_payments
FOR EACH ROW EXECUTE FUNCTION public.block_purchase_with_debt();

-- ---------------------------------------------------------------------
-- Ruxsatlar
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.outstanding_debt(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plan_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_plan_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_consultation_on_credit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.repay_emergency_credit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.block_purchase_with_debt() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outstanding_debt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_plan_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_consultation_on_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repay_emergency_credit() TO authenticated;
