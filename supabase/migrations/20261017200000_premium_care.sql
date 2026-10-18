-- =====================================================================
-- MaxHospital: Pro / Premium uchun yangi imkoniyatlar
--  1. Ustuvor navbat   : Pro +4, Premium +6 o'ringa oldinga; "birinchi navbat" oyiga Pro 1 / Premium 3 bepul,
--                        limitdan keyin Pro 15 000, Premium 10 000 so'm. Bu to'lov platformaga (platform_fees).
--  2. Bepul savol vaqti: konsultatsiya tugagach chat yana 72 soat ochiq (Pro, Premium).
--  3. Ikkinchi fikr    : Premium — oyiga 1 marta boshqa shifokor tashxis va retseptni ko'rib chiqadi.
--  4. Uy o'lchovlari   : bemor bosim, qand va boshqalarni o'zi kiritadi (health_measurements.source = 'home').
--  5. Haftalik hisobot : AI hafta yakuni (weekly_reports).
--  6. Favqulodda karta : QR kod orqali ochiladigan tibbiy karta (emergency_cards).
--  7. Oila profili     : Premium — 4 tagacha oila a'zosi (family_members).
-- Qoidalar (AGENTS.md): auth.users ga FK yo'q, aniq GRANT'lar, pul va limitlar faqat RPC orqali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Yordamchi: Toshkent bo'yicha oy boshi va tarif (ichki, auth tekshiruvisiz)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tashkent_month_start()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent';
$$;

-- plan_of() boshqa foydalanuvchining tarifini oddiy foydalanuvchiga ko'rsatmaydi. Server funksiyalari
-- (masalan, shifokor konsultatsiyani tugatganda bemor tarifi) uchun ichki variant.
CREATE OR REPLACE FUNCTION public.plan_of_internal(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.plan_id FROM public.subscriptions s
    WHERE s.user_id = _user_id AND s.status = 'active' AND s.current_period_end > now()
  ), 'free');
$$;

-- ---------------------------------------------------------------------
-- Tarif limitlari: yangi ustunlar
-- ---------------------------------------------------------------------
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS queue_boost int NOT NULL DEFAULT 0 CHECK (queue_boost BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS queue_first_monthly int NOT NULL DEFAULT 0 CHECK (queue_first_monthly BETWEEN 0 AND 100),
  -- NULL = bu tarifda "birinchi navbat" umuman yo'q
  ADD COLUMN IF NOT EXISTS queue_first_price_uzs bigint CHECK (queue_first_price_uzs IS NULL OR queue_first_price_uzs BETWEEN 0 AND 10000000),
  ADD COLUMN IF NOT EXISTS followup_hours int NOT NULL DEFAULT 0 CHECK (followup_hours BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS second_opinions_monthly int NOT NULL DEFAULT 0 CHECK (second_opinions_monthly BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS home_diary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_card boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_members int NOT NULL DEFAULT 0 CHECK (family_members BETWEEN 0 AND 10);

-- Pro / Premium uchun standart qiymatlar supabase/seed/plan_defaults.sql faylida.

GRANT UPDATE (queue_boost, queue_first_monthly, queue_first_price_uzs, followup_hours, second_opinions_monthly,
              home_diary, weekly_report, emergency_card, family_members)
  ON public.plan_limits TO authenticated;

-- ---------------------------------------------------------------------
-- Oila a'zolari (Premium)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  relation text NOT NULL DEFAULT 'other' CHECK (relation IN ('child', 'parent', 'spouse', 'sibling', 'grandparent', 'other')),
  birth_date date CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1900-01-01' AND CURRENT_DATE),
  gender text CHECK (gender IS NULL OR gender IN ('male', 'female')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_members_owner_idx ON public.family_members (owner_id, created_at);

GRANT SELECT, DELETE ON public.family_members TO authenticated;
GRANT UPDATE (full_name, relation, birth_date, gender, notes) ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage family" ON public.family_members;
CREATE POLICY "Owners manage family" ON public.family_members
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Qo'shish limit bilan (Premium: 4 ta).
CREATE OR REPLACE FUNCTION public.add_family_member(_full_name text, _relation text DEFAULT 'other',
  _birth_date date DEFAULT NULL, _gender text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS public.family_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _limit int; _n int; _row public.family_members%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT family_members INTO _limit FROM public.plan_limits WHERE plan_id = public.plan_of_internal(_uid);
  IF COALESCE(_limit, 0) = 0 THEN RAISE EXCEPTION 'Oila profili Premium tarifda ishlaydi' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO _n FROM public.family_members WHERE owner_id = _uid;
  IF _n >= _limit THEN RAISE EXCEPTION 'Oila a''zolari soni % tadan oshmasligi kerak', _limit; END IF;
  INSERT INTO public.family_members (owner_id, full_name, relation, birth_date, gender, notes)
  VALUES (_uid, btrim(_full_name), COALESCE(_relation, 'other'), _birth_date, _gender, NULLIF(btrim(_notes), ''))
  RETURNING * INTO _row;
  RETURN _row;
END; $$;

-- ---------------------------------------------------------------------
-- Konsultatsiyalar: navbat, oila a'zosi, bepul savol vaqti
-- ---------------------------------------------------------------------
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS queue_boost int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_first boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_until timestamptz;

-- Shifokor kartochkada oila a'zosining ismini ko'rishi uchun.
DROP POLICY IF EXISTS "Doctors view family members of their consultations" ON public.family_members;
CREATE POLICY "Doctors view family members of their consultations" ON public.family_members
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.consultations c JOIN public.doctors d ON d.id = c.doctor_id
    WHERE c.family_member_id = family_members.id AND d.user_id = auth.uid()));

-- Mijoz tomonidan o'zgartirib bo'lmaydigan ustunlar (navbat, oila, savol vaqti qo'shildi).
CREATE OR REPLACE FUNCTION public.protect_consultation_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
     OR NEW.department_id IS DISTINCT FROM OLD.department_id
     OR NEW.price_uzs IS DISTINCT FROM OLD.price_uzs
     OR NEW.queue_boost IS DISTINCT FROM OLD.queue_boost
     OR NEW.queue_first IS DISTINCT FROM OLD.queue_first
     OR NEW.family_member_id IS DISTINCT FROM OLD.family_member_id
     OR NEW.followup_until IS DISTINCT FROM OLD.followup_until THEN
    RAISE EXCEPTION 'Bu maydonlarni o''zgartirish mumkin emas' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Rad etish uchun reject_consultation() dan foydalaning' USING ERRCODE = '42501';
  END IF;
  -- Tugatish end_consultation() orqali: u bepul savol vaqtini ham qo'yadi.
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Tugatish uchun end_consultation() dan foydalaning' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

-- Platforma daromadi (navbat uchun qo'shimcha to'lov shifokorga emas, platformaga).
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('queue_first')),
  amount_uzs bigint NOT NULL CHECK (amount_uzs >= 0),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_fees_user_idx ON public.platform_fees (user_id, created_at DESC);
GRANT SELECT ON public.platform_fees TO authenticated;
GRANT ALL ON public.platform_fees TO service_role;
ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own fees" ON public.platform_fees;
CREATE POLICY "Users view own fees" ON public.platform_fees FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Staff view fees" ON public.platform_fees;
CREATE POLICY "Staff view fees" ON public.platform_fees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- Shu oyda ishlatilgan "birinchi navbat"lar (rad etilganlari hisoblanmaydi).
CREATE OR REPLACE FUNCTION public.queue_first_used(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.consultations
  WHERE patient_id = _user_id AND queue_first AND status <> 'cancelled'
    AND created_at >= public.tashkent_month_start();
$$;

DROP FUNCTION IF EXISTS public.create_consultation(uuid);
CREATE OR REPLACE FUNCTION public.create_consultation(_doctor_id uuid, _first boolean DEFAULT false, _family_member_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _dept_id uuid; _price bigint; _balance bigint; _banned boolean; _new_id uuid;
  _l public.plan_limits%ROWTYPE; _fee bigint := 0;
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
    RAISE EXCEPTION 'Avval favqulodda qarzni to''lang (Hamyon sahifasi)' USING HINT = 'debt';
  END IF;
  IF _family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members WHERE id = _family_member_id AND owner_id = _uid) THEN
    RAISE EXCEPTION 'Oila a''zosi topilmadi' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _l FROM public.plan_limits WHERE plan_id = public.plan_of_internal(_uid);
  IF _first THEN
    IF _l.queue_first_price_uzs IS NULL THEN
      RAISE EXCEPTION 'Birinchi navbat Pro va Premium tariflarida ishlaydi' USING ERRCODE = '42501';
    END IF;
    IF public.queue_first_used(_uid) >= COALESCE(_l.queue_first_monthly, 0) THEN
      _fee := _l.queue_first_price_uzs;  -- oylik bepul limit tugagan
    END IF;
  END IF;

  IF _balance < _price + _fee THEN RAISE EXCEPTION 'Balansingizda yetarli mablag'' yo''q'; END IF;
  UPDATE public.profiles SET balance_uzs = balance_uzs - _price - _fee WHERE user_id = _uid;
  INSERT INTO public.consultations (patient_id, doctor_id, department_id, price_uzs, queue_boost, queue_first, family_member_id)
  VALUES (_uid, _doctor_id, _dept_id, _price, COALESCE(_l.queue_boost, 0), _first, _family_member_id)
  RETURNING id INTO _new_id;
  IF _fee > 0 THEN
    INSERT INTO public.platform_fees (user_id, consultation_id, kind, amount_uzs) VALUES (_uid, _new_id, 'queue_first', _fee);
  END IF;
  RETURN _new_id;
END; $$;

DROP FUNCTION IF EXISTS public.create_consultation_on_credit(uuid);
CREATE OR REPLACE FUNCTION public.create_consultation_on_credit(_doctor_id uuid, _family_member_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _dept_id uuid; _price bigint; _balance bigint; _banned boolean; _new_id uuid;
  _l public.plan_limits%ROWTYPE; _shortfall bigint;
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
  IF _family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members WHERE id = _family_member_id AND owner_id = _uid) THEN
    RAISE EXCEPTION 'Oila a''zosi topilmadi' USING ERRCODE = '42501';
  END IF;

  _shortfall := _price - GREATEST(_balance, 0);
  IF _shortfall <= 0 THEN RAISE EXCEPTION 'Balansingiz yetarli, oddiy konsultatsiya boshlang'; END IF;

  SELECT * INTO _l FROM public.plan_limits WHERE plan_id = public.plan_of_internal(_uid);
  IF COALESCE(_l.emergency_credit_uzs, 0) < _shortfall THEN
    RAISE EXCEPTION 'Favqulodda kredit limiti yetmaydi (limit: % so''m, kerak: % so''m)', COALESCE(_l.emergency_credit_uzs, 0), _shortfall;
  END IF;

  UPDATE public.profiles SET balance_uzs = 0 WHERE user_id = _uid;
  INSERT INTO public.consultations (patient_id, doctor_id, department_id, price_uzs, queue_boost, family_member_id)
  VALUES (_uid, _doctor_id, _dept_id, _price, COALESCE(_l.queue_boost, 0), _family_member_id) RETURNING id INTO _new_id;
  INSERT INTO public.emergency_credits (user_id, consultation_id, amount_uzs) VALUES (_uid, _new_id, _shortfall);
  RETURN _new_id;
END; $$;

-- Rad etish: konsultatsiya puli, navbat to'lovi qaytariladi, kredit bekor qilinadi.
CREATE OR REPLACE FUNCTION public.reject_consultation(_consultation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.consultations%ROWTYPE; _cr public.emergency_credits%ROWTYPE; _refund bigint; _fees bigint;
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
    _refund := GREATEST(_c.price_uzs - (_cr.amount_uzs - _cr.repaid_uzs), 0);
    UPDATE public.emergency_credits SET status = 'cancelled', settled_at = now() WHERE id = _cr.id;
  END IF;

  WITH r AS (
    UPDATE public.platform_fees SET status = 'refunded'
    WHERE consultation_id = _consultation_id AND status = 'paid' RETURNING amount_uzs
  ) SELECT COALESCE(sum(amount_uzs), 0) INTO _fees FROM r;
  _refund := _refund + _fees;

  IF _refund > 0 THEN
    UPDATE public.profiles SET balance_uzs = balance_uzs + _refund WHERE user_id = _c.patient_id;
  END IF;
END; $$;

-- Tugatish: Pro/Premium bemorga bepul savol vaqti ochiladi.
CREATE OR REPLACE FUNCTION public.end_consultation(_consultation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.consultations%ROWTYPE; _hours int;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Konsultatsiya topilmadi'; END IF;
  IF _c.patient_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _c.doctor_id AND d.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  IF _c.status IN ('completed', 'cancelled') THEN RETURN; END IF;
  IF _c.status <> 'active' THEN RAISE EXCEPTION 'Konsultatsiya hali boshlanmagan'; END IF;
  SELECT followup_hours INTO _hours FROM public.plan_limits WHERE plan_id = public.plan_of_internal(_c.patient_id);
  UPDATE public.consultations
    SET status = 'completed', ended_at = now(),
        followup_until = CASE WHEN COALESCE(_hours, 0) > 0 THEN now() + make_interval(hours => _hours) END
    WHERE id = _consultation_id;
END; $$;

-- Xabarlar: faol konsultatsiyada yoki bepul savol vaqtida.
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = messages.consultation_id
      AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))
      AND (c.status IN ('pending', 'active') OR (c.status = 'completed' AND c.followup_until > now()))
  ));

-- ---------------------------------------------------------------------
-- Ikkinchi fikr (Premium)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.second_opinions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  original_doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  question text CHECK (question IS NULL OR char_length(question) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
  answered_by uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  verdict text CHECK (verdict IS NULL OR verdict IN ('agree', 'partly', 'disagree')),
  answer text CHECK (answer IS NULL OR char_length(answer) BETWEEN 20 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS second_opinions_consultation_idx ON public.second_opinions (consultation_id);
CREATE INDEX IF NOT EXISTS second_opinions_pending_idx ON public.second_opinions (created_at) WHERE status = 'pending';

GRANT SELECT ON public.second_opinions TO authenticated;
GRANT ALL ON public.second_opinions TO service_role;
ALTER TABLE public.second_opinions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Patients view own second opinions" ON public.second_opinions;
CREATE POLICY "Patients view own second opinions" ON public.second_opinions
  FOR SELECT TO authenticated USING (patient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_second_opinion(_consultation_id uuid, _question text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _c public.consultations%ROWTYPE; _limit int; _used int; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id AND patient_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Konsultatsiya topilmadi' USING ERRCODE = '42501'; END IF;
  IF _c.status <> 'completed' THEN RAISE EXCEPTION 'Ikkinchi fikr faqat tugagan konsultatsiya uchun'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.prescriptions WHERE consultation_id = _consultation_id) THEN
    RAISE EXCEPTION 'Bu konsultatsiyada retsept yo''q';
  END IF;
  IF EXISTS (SELECT 1 FROM public.second_opinions WHERE consultation_id = _consultation_id) THEN
    RAISE EXCEPTION 'Bu konsultatsiya uchun ikkinchi fikr allaqachon so''ralgan';
  END IF;
  SELECT second_opinions_monthly INTO _limit FROM public.plan_limits WHERE plan_id = public.plan_of_internal(_uid);
  IF COALESCE(_limit, 0) = 0 THEN RAISE EXCEPTION 'Ikkinchi fikr Premium tarifda ishlaydi' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO _used FROM public.second_opinions WHERE patient_id = _uid AND created_at >= public.tashkent_month_start();
  IF _used >= _limit THEN RAISE EXCEPTION 'Bu oy uchun ikkinchi fikr limiti tugadi (% ta)', _limit; END IF;

  INSERT INTO public.second_opinions (patient_id, consultation_id, original_doctor_id, department_id, question)
  VALUES (_uid, _consultation_id, _c.doctor_id, _c.department_id, NULLIF(btrim(_question), ''))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

-- Shifokorlar uchun: o'zlariniki bo'lmagan kutilayotgan so'rovlar va o'zlari javob berganlari.
-- Bemor ismi ko'rsatilmaydi; tashxis, dorilar va oxirgi ko'rsatkichlar ko'rsatiladi.
CREATE OR REPLACE FUNCTION public.list_second_opinion_requests()
RETURNS TABLE (
  id uuid, status text, created_at timestamptz, question text, department_name text,
  original_doctor_title text, diagnosis text, medicines jsonb, notes text,
  patient_birth_year int, measurements jsonb, answer text, verdict text, answered_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _doc uuid;
BEGIN
  SELECT d.id INTO _doc FROM public.doctors d WHERE d.user_id = auth.uid();
  IF _doc IS NULL THEN RAISE EXCEPTION 'Faqat shifokorlar uchun' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT s.id, s.status, s.created_at, s.question, dep.name_uz, od.title,
         rx.diagnosis, rx.medicines, rx.notes,
         EXTRACT(year FROM fm.birth_date)::int,
         (SELECT jsonb_agg(jsonb_build_object('metric', m.metric, 'value', m.value, 'unit', m.unit, 'at', m.measured_at) ORDER BY m.measured_at DESC)
          FROM (SELECT * FROM public.health_measurements hm
                WHERE hm.patient_id = s.patient_id AND c.family_member_id IS NULL
                ORDER BY hm.measured_at DESC LIMIT 12) m),
         s.answer, s.verdict, s.answered_at
  FROM public.second_opinions s
  JOIN public.consultations c ON c.id = s.consultation_id
  LEFT JOIN public.departments dep ON dep.id = s.department_id
  LEFT JOIN public.doctors od ON od.id = s.original_doctor_id
  LEFT JOIN public.family_members fm ON fm.id = c.family_member_id
  LEFT JOIN LATERAL (SELECT p.diagnosis, p.medicines, p.notes FROM public.prescriptions p
                     WHERE p.consultation_id = s.consultation_id ORDER BY p.created_at DESC LIMIT 1) rx ON true
  WHERE (s.status = 'pending' AND s.original_doctor_id IS DISTINCT FROM _doc)
     OR s.answered_by = _doc
  ORDER BY (s.status = 'pending') DESC, s.created_at
  LIMIT 100;
END; $$;

CREATE OR REPLACE FUNCTION public.answer_second_opinion(_id uuid, _verdict text, _answer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _doc uuid; _s public.second_opinions%ROWTYPE;
BEGIN
  SELECT d.id INTO _doc FROM public.doctors d WHERE d.user_id = auth.uid();
  IF _doc IS NULL THEN RAISE EXCEPTION 'Faqat shifokorlar uchun' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.second_opinions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'So''rov topilmadi'; END IF;
  IF _s.original_doctor_id = _doc THEN RAISE EXCEPTION 'O''z konsultatsiyangizga ikkinchi fikr bera olmaysiz' USING ERRCODE = '42501'; END IF;
  IF _s.status <> 'pending' THEN RAISE EXCEPTION 'Bu so''rovga allaqachon javob berilgan'; END IF;
  IF _verdict NOT IN ('agree', 'partly', 'disagree') THEN RAISE EXCEPTION 'Xulosa noto''g''ri'; END IF;
  IF char_length(btrim(COALESCE(_answer, ''))) < 20 THEN RAISE EXCEPTION 'Javob kamida 20 belgi bo''lsin'; END IF;
  UPDATE public.second_opinions
    SET status = 'answered', answered_by = _doc, verdict = _verdict, answer = btrim(_answer), answered_at = now()
    WHERE id = _id;
  INSERT INTO public.user_notifications (user_id, kind, title, body, data)
  VALUES (_s.patient_id, 'second_opinion', 'Ikkinchi fikr tayyor', 'Boshqa shifokor retseptingizni ko''rib chiqdi.',
          jsonb_build_object('link', '/second-opinion', 'second_opinion_id', _id));
END; $$;

-- ---------------------------------------------------------------------
-- Uy o'lchovlari
-- ---------------------------------------------------------------------
ALTER TABLE public.health_measurements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'doctor' CHECK (source IN ('doctor', 'home'));
-- Yozish server funksiyasi (home-measurement) orqali; bemor o'z uy o'lchovini o'chira oladi.
DROP POLICY IF EXISTS "Patients delete own home measurements" ON public.health_measurements;
CREATE POLICY "Patients delete own home measurements" ON public.health_measurements
  FOR DELETE TO authenticated USING (patient_id = auth.uid() AND source = 'home');

-- ---------------------------------------------------------------------
-- Haftalik AI hisobot
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  content text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_telegram boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_user_period_idx ON public.weekly_reports (user_id, period_start);
GRANT SELECT, DELETE ON public.weekly_reports TO authenticated;
GRANT ALL ON public.weekly_reports TO service_role;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own reports" ON public.weekly_reports;
CREATE POLICY "Users manage own reports" ON public.weekly_reports FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own reports" ON public.weekly_reports;
CREATE POLICY "Users delete own reports" ON public.weekly_reports FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Favqulodda tibbiy karta (QR)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emergency_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  blood_type text CHECK (blood_type IS NULL OR blood_type IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
  allergies text CHECK (allergies IS NULL OR char_length(allergies) <= 500),
  conditions text CHECK (conditions IS NULL OR char_length(conditions) <= 500),
  medications text CHECK (medications IS NULL OR char_length(medications) <= 500),
  contact_name text CHECK (contact_name IS NULL OR char_length(contact_name) <= 100),
  contact_phone text CHECK (contact_phone IS NULL OR contact_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS emergency_cards_self_idx ON public.emergency_cards (owner_id) WHERE family_member_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS emergency_cards_member_idx ON public.emergency_cards (family_member_id) WHERE family_member_id IS NOT NULL;
GRANT SELECT, DELETE ON public.emergency_cards TO authenticated;
GRANT ALL ON public.emergency_cards TO service_role;
ALTER TABLE public.emergency_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners view own cards" ON public.emergency_cards;
CREATE POLICY "Owners view own cards" ON public.emergency_cards FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners delete own cards" ON public.emergency_cards;
CREATE POLICY "Owners delete own cards" ON public.emergency_cards FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Saqlash (Pro/Premium). _regenerate = true bo'lsa eski QR ishlamay qoladi.
CREATE OR REPLACE FUNCTION public.save_emergency_card(
  _family_member_id uuid, _blood_type text, _allergies text, _conditions text, _medications text,
  _contact_name text, _contact_phone text, _notes text, _is_enabled boolean DEFAULT true, _regenerate boolean DEFAULT false)
RETURNS public.emergency_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ok boolean; _row public.emergency_cards%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT emergency_card INTO _ok FROM public.plan_limits WHERE plan_id = public.plan_of_internal(_uid);
  IF NOT COALESCE(_ok, false) THEN RAISE EXCEPTION 'Favqulodda karta Pro va Premium tariflarida ishlaydi' USING ERRCODE = '42501'; END IF;
  IF _family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members WHERE id = _family_member_id AND owner_id = _uid) THEN
    RAISE EXCEPTION 'Oila a''zosi topilmadi' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.emergency_cards
  WHERE owner_id = _uid AND family_member_id IS NOT DISTINCT FROM _family_member_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.emergency_cards SET
      blood_type = NULLIF(_blood_type, ''), allergies = NULLIF(btrim(_allergies), ''), conditions = NULLIF(btrim(_conditions), ''),
      medications = NULLIF(btrim(_medications), ''), contact_name = NULLIF(btrim(_contact_name), ''),
      contact_phone = NULLIF(btrim(_contact_phone), ''), notes = NULLIF(btrim(_notes), ''), is_enabled = COALESCE(_is_enabled, true),
      token = CASE WHEN _regenerate THEN replace(gen_random_uuid()::text, '-', '') ELSE token END,
      updated_at = now()
    WHERE id = _row.id RETURNING * INTO _row;
  ELSE
    INSERT INTO public.emergency_cards (owner_id, family_member_id, blood_type, allergies, conditions, medications,
      contact_name, contact_phone, notes, is_enabled)
    VALUES (_uid, _family_member_id, NULLIF(_blood_type, ''), NULLIF(btrim(_allergies), ''), NULLIF(btrim(_conditions), ''),
      NULLIF(btrim(_medications), ''), NULLIF(btrim(_contact_name), ''), NULLIF(btrim(_contact_phone), ''),
      NULLIF(btrim(_notes), ''), COALESCE(_is_enabled, true))
    RETURNING * INTO _row;
  END IF;
  RETURN _row;
END; $$;

-- QR orqali ochish: login kerak emas (tez yordam uchun). Tarif tugasa ham karta o'qiladi — xavfsizlik uchun.
CREATE OR REPLACE FUNCTION public.get_emergency_card(_token text)
RETURNS TABLE (full_name text, birth_year int, blood_type text, allergies text, conditions text, medications text,
               contact_name text, contact_phone text, notes text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(fm.full_name, p.full_name), EXTRACT(year FROM fm.birth_date)::int,
         e.blood_type, e.allergies, e.conditions, e.medications, e.contact_name, e.contact_phone, e.notes, e.updated_at
  FROM public.emergency_cards e
  LEFT JOIN public.family_members fm ON fm.id = e.family_member_id
  LEFT JOIN public.profiles p ON p.user_id = e.owner_id
  WHERE e.token = _token AND e.is_enabled AND char_length(_token) = 32;
$$;

-- ---------------------------------------------------------------------
-- Dori jadvali oila a'zosi uchun
-- ---------------------------------------------------------------------
ALTER TABLE public.medication_schedules
  ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.assign_schedules_to_member(_schedule_ids uuid[], _family_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  IF _family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members WHERE id = _family_member_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Oila a''zosi topilmadi' USING ERRCODE = '42501';
  END IF;
  UPDATE public.medication_schedules SET family_member_id = _family_member_id, updated_at = now()
  WHERE id = ANY(_schedule_ids) AND user_id = auth.uid();
END; $$;

-- Eslatma matnida oila a'zosining ismi ham chiqadi: "Paracetamol — Onam".
CREATE OR REPLACE FUNCTION public.claim_due_medication_reminders(_limit int DEFAULT 300)
RETURNS TABLE (
  reminder_id uuid, user_id uuid, scheduled_at timestamptz, timezone text,
  medicine_name text, dose text, instructions text, channels text[], plan text,
  telegram_chat_id bigint, telegram_enabled boolean, phone text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.medication_reminders r SET status = 'missed'
  WHERE r.status = 'pending' AND r.scheduled_at < now() - interval '30 minutes';

  UPDATE public.medication_reminders r SET status = 'missed'
  FROM public.medication_schedules s
  WHERE r.schedule_id = s.id AND r.status = 'pending' AND r.scheduled_at <= now()
    AND (NOT s.is_active OR public.plan_of(r.user_id) NOT IN ('pro', 'premium'));

  RETURN QUERY
  WITH due AS (
    SELECT r.id FROM public.medication_reminders r
    WHERE r.status = 'pending' AND r.scheduled_at <= now()
    ORDER BY r.scheduled_at
    LIMIT LEAST(GREATEST(_limit, 1), 1000)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.medication_reminders r SET status = 'sent', sent_at = now()
    FROM due WHERE r.id = due.id
    RETURNING r.id, r.user_id, r.scheduled_at, r.schedule_id
  )
  SELECT c.id, c.user_id, c.scheduled_at, s.timezone,
         s.medicine_name || COALESCE(' — ' || fm.full_name, ''),
         s.dose, s.instructions, s.channels,
         public.plan_of(c.user_id), p.telegram_chat_id, COALESCE(p.telegram_notifications_enabled, true), p.phone
  FROM claimed c
  JOIN public.medication_schedules s ON s.id = c.schedule_id
  LEFT JOIN public.family_members fm ON fm.id = s.family_member_id
  LEFT JOIN public.profiles p ON p.user_id = c.user_id;
END; $$;

-- ---------------------------------------------------------------------
-- plan_status: yangi limitlar va sarflar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_status(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan text := public.plan_of_internal(_user_id);
  _l public.plan_limits%ROWTYPE;
  _day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent';
  _month_start timestamptz := public.tashkent_month_start();
  _credit public.emergency_credits%ROWTYPE;
BEGIN
  SELECT * INTO _l FROM public.plan_limits WHERE plan_id = _plan;
  IF NOT FOUND THEN
    _l.plan_id := _plan; _l.ai_daily_questions := 5; _l.video_free_minutes := 10;
    _l.health_ai := false; _l.lab_reads_monthly := 0; _l.emergency_credit_uzs := 0;
    _l.queue_boost := 0; _l.queue_first_monthly := 0; _l.queue_first_price_uzs := NULL; _l.followup_hours := 0;
    _l.second_opinions_monthly := 0; _l.home_diary := false; _l.weekly_report := false;
    _l.emergency_card := false; _l.family_members := 0;
  END IF;
  SELECT * INTO _credit FROM public.emergency_credits WHERE user_id = _user_id AND status = 'open' LIMIT 1;

  RETURN jsonb_build_object(
    'plan', _plan,
    'limits', jsonb_build_object(
      'ai_daily_questions', _l.ai_daily_questions,
      'video_free_minutes', _l.video_free_minutes,
      'health_ai', _l.health_ai,
      'lab_reads_monthly', _l.lab_reads_monthly,
      'emergency_credit_uzs', _l.emergency_credit_uzs,
      'queue_boost', _l.queue_boost,
      'queue_first_monthly', _l.queue_first_monthly,
      'queue_first_price_uzs', _l.queue_first_price_uzs,
      'followup_hours', _l.followup_hours,
      'second_opinions_monthly', _l.second_opinions_monthly,
      'home_diary', _l.home_diary,
      'weekly_report', _l.weekly_report,
      'emergency_card', _l.emergency_card,
      'family_members', _l.family_members
    ),
    'usage', jsonb_build_object(
      'ai_today', (SELECT count(*) FROM public.ai_chat_logs
                   WHERE user_id = _user_id AND mode = 'chat' AND emergency_rule IS NULL AND created_at >= _day_start),
      'lab_month', (SELECT count(*) FROM public.ai_chat_logs
                    WHERE user_id = _user_id AND mode = 'lab' AND created_at >= _month_start),
      'queue_first_month', public.queue_first_used(_user_id),
      'second_opinions_month', (SELECT count(*) FROM public.second_opinions
                                WHERE patient_id = _user_id AND created_at >= _month_start),
      'family_members', (SELECT count(*) FROM public.family_members WHERE owner_id = _user_id)
    ),
    'debt_uzs', COALESCE(_credit.amount_uzs - _credit.repaid_uzs, 0),
    'credit', CASE WHEN _credit.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _credit.id, 'consultation_id', _credit.consultation_id, 'amount_uzs', _credit.amount_uzs,
      'repaid_uzs', _credit.repaid_uzs, 'created_at', _credit.created_at
    ) END
  );
END; $$;

-- ---------------------------------------------------------------------
-- Haftalik hisobot uchun cron (pg_cron + pg_net + Vault). Yo'q bo'lsa migratsiya baribir o'tadi;
-- zaxira: .github/workflows/weekly-report-cron.yml
-- ---------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'maxhospital-weekly-report';
    -- Yakshanba 20:00 Toshkent = 15:00 UTC
    PERFORM cron.schedule('maxhospital-weekly-report', '0 15 * * 0', $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_report_function_url'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
        body := '{"mode":"cron"}'::jsonb)
      WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'weekly_report_function_url');
    $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'weekly report cron not scheduled: %', SQLERRM;
END
$cron$;

-- ---------------------------------------------------------------------
-- Ruxsatlar
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tashkent_month_start() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plan_of_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_first_used(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_family_member(text, text, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.protect_consultation_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_consultation(uuid, boolean, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_consultation_on_credit(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_second_opinion(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_second_opinion_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.answer_second_opinion(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_emergency_card(uuid, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_emergency_card(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_schedules_to_member(uuid[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_due_medication_reminders(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plan_status(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tashkent_month_start() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_of_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_first_used(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_family_member(text, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_consultation(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_consultation_on_credit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_second_opinion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_second_opinion_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_second_opinion(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_emergency_card(uuid, text, text, text, text, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_emergency_card(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_schedules_to_member(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_medication_reminders(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_status(uuid) TO service_role;
