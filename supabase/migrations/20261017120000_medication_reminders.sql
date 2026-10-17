-- =====================================================================
-- MaxHospital Pro: aqlli dori eslatmalari
--  * subscription_plans     : tariflar (Pro, Premium) — narxni owner o'zgartiradi
--  * subscriptions          : foydalanuvchi obunasi (ichki balansdan to'lanadi)
--  * subscription_payments  : obuna to'lovlari tarixi
--  * medication_schedules   : dori qabul qilish jadvali (AI tuzadi, bemor tasdiqlaydi)
--  * medication_reminders   : har bir qabul vaqti (eslatma)
--  * user_notifications     : saytdagi bildirishnomalar (realtime)
--  * ai_plan_logs           : AI rejalashtirish so'rovlari soni (limit uchun)
-- Qoidalar (AGENTS.md): auth.users ga FK yo'q, aniq GRANT'lar, yozuvlar RPC orqali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tariflar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id text PRIMARY KEY CHECK (id IN ('pro', 'premium')),
  name text NOT NULL,
  price_uzs bigint NOT NULL CHECK (price_uzs >= 0),
  period_days int NOT NULL DEFAULT 30 CHECK (period_days BETWEEN 1 AND 366),
  sms_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plans (id, name, price_uzs, period_days, sms_enabled, sort_order)
VALUES ('pro', 'Pro', 19000, 30, false, 1),
       ('premium', 'Premium', 39000, 30, true, 2)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT UPDATE (name, price_uzs, period_days, is_active, updated_at) ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plans" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Owner can update plans" ON public.subscription_plans
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- ---------------------------------------------------------------------
-- Obunalar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  current_period_end timestamptz NOT NULL,
  auto_renew boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id),
  amount_uzs bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('new', 'extend', 'change', 'renewal')),
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_payments_user_idx ON public.subscription_payments (user_id, created_at DESC);

GRANT SELECT ON public.subscriptions, public.subscription_payments TO authenticated;
GRANT ALL ON public.subscriptions, public.subscription_payments TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff view subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Users view own payments" ON public.subscription_payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff view payments" ON public.subscription_payments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- Foydalanuvchining amaldagi tarifi: 'free' | 'pro' | 'premium'.
-- Boshqa foydalanuvchining tarifini faqat server (service role) yoki xodim ko'radi.
CREATE OR REPLACE FUNCTION public.plan_of(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.plan_id FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.status = 'active'
      AND s.current_period_end > now()
      AND (auth.uid() IS NULL OR auth.uid() = _user_id
           OR public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_role(auth.uid(), 'owner'::app_role))
  ), 'free');
$$;

-- Obuna bo'lish yoki uzaytirish: narx ichki balansdan yechiladi.
CREATE OR REPLACE FUNCTION public.subscribe_plan(_plan_id text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _plan public.subscription_plans%ROWTYPE;
  _sub public.subscriptions%ROWTYPE;
  _balance bigint;
  _banned boolean;
  _start timestamptz;
  _kind text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;

  SELECT * INTO _plan FROM public.subscription_plans WHERE id = _plan_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarif topilmadi'; END IF;

  SELECT balance_uzs, is_banned INTO _balance, _banned FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil topilmadi'; END IF;
  IF _banned THEN RAISE EXCEPTION 'Hisob bloklangan' USING ERRCODE = '42501'; END IF;
  IF _balance < _plan.price_uzs THEN RAISE EXCEPTION 'Balans yetarli emas'; END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE user_id = _uid FOR UPDATE;

  IF FOUND AND _sub.status = 'active' AND _sub.current_period_end > now() AND _sub.plan_id = _plan_id THEN
    _start := _sub.current_period_end;           -- shu tarifni uzaytirish
    _kind := 'extend';
  ELSIF FOUND AND _sub.status = 'active' AND _sub.current_period_end > now() THEN
    _start := now();                              -- tarifni almashtirish: yangi davr hozirdan
    _kind := 'change';
  ELSE
    _start := now();
    _kind := 'new';
  END IF;

  UPDATE public.profiles SET balance_uzs = balance_uzs - _plan.price_uzs WHERE user_id = _uid;

  INSERT INTO public.subscriptions AS s (user_id, plan_id, status, current_period_end, auto_renew, updated_at)
  VALUES (_uid, _plan_id, 'active', _start + make_interval(days => _plan.period_days), true, now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, status = 'active', current_period_end = EXCLUDED.current_period_end,
        auto_renew = true, updated_at = now()
  RETURNING * INTO _sub;

  INSERT INTO public.subscription_payments (user_id, plan_id, amount_uzs, kind, period_end)
  VALUES (_uid, _plan_id, _plan.price_uzs, _kind, _sub.current_period_end);

  RETURN _sub;
END; $$;

CREATE OR REPLACE FUNCTION public.set_subscription_auto_renew(_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  UPDATE public.subscriptions SET auto_renew = _enabled, updated_at = now() WHERE user_id = auth.uid();
END; $$;

-- Muddati tugagan obunalarni balansdan uzaytiradi yoki tugatadi (cron soatiga bir marta).
CREATE OR REPLACE FUNCTION public.renew_subscriptions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s record;
  _n int := 0;
BEGIN
  FOR _s IN
    SELECT s.user_id, s.plan_id, s.auto_renew, s.current_period_end, p.price_uzs, p.period_days, p.is_active
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.status = 'active' AND s.current_period_end <= now()
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    IF _s.auto_renew AND _s.is_active AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = _s.user_id AND NOT pr.is_banned AND pr.balance_uzs >= _s.price_uzs
    ) THEN
      UPDATE public.profiles SET balance_uzs = balance_uzs - _s.price_uzs WHERE user_id = _s.user_id;
      UPDATE public.subscriptions
        SET current_period_end = GREATEST(_s.current_period_end, now() - interval '1 day')
                                 + make_interval(days => _s.period_days),
            updated_at = now()
        WHERE user_id = _s.user_id;
      INSERT INTO public.subscription_payments (user_id, plan_id, amount_uzs, kind, period_end)
      SELECT _s.user_id, _s.plan_id, _s.price_uzs, 'renewal', current_period_end
      FROM public.subscriptions WHERE user_id = _s.user_id;
    ELSE
      UPDATE public.subscriptions SET status = 'expired', updated_at = now() WHERE user_id = _s.user_id;
    END IF;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;

-- ---------------------------------------------------------------------
-- Dori jadvali va eslatmalar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.valid_hhmm_times(_times text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _times IS NOT NULL
     AND cardinality(_times) BETWEEN 1 AND 8
     AND NOT EXISTS (SELECT 1 FROM unnest(_times) t WHERE t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
$$;

CREATE TABLE IF NOT EXISTS public.medication_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('prescription', 'upload', 'manual')),
  medicine_name text NOT NULL CHECK (char_length(medicine_name) BETWEEN 1 AND 200),
  dose text CHECK (char_length(dose) <= 200),
  instructions text CHECK (char_length(instructions) <= 500),
  times text[] NOT NULL CHECK (public.valid_hhmm_times(times)),
  start_date date NOT NULL,
  days int NOT NULL CHECK (days BETWEEN 1 AND 90),
  timezone text NOT NULL DEFAULT 'Asia/Tashkent',
  channels text[] NOT NULL DEFAULT ARRAY['web', 'telegram', 'app']
    CHECK (channels <@ ARRAY['web', 'telegram', 'app', 'sms'] AND cardinality(channels) >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medication_schedules_user_idx ON public.medication_schedules (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.medication_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Telefondagi lokal eslatma uchun butun son ID (Android notification id).
  notify_id int GENERATED ALWAYS AS IDENTITY UNIQUE,
  schedule_id uuid NOT NULL REFERENCES public.medication_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'taken', 'skipped', 'missed')),
  sent_at timestamptz,
  sent_channels text[] NOT NULL DEFAULT '{}',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medication_reminders_due_idx
  ON public.medication_reminders (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS medication_reminders_user_idx
  ON public.medication_reminders (user_id, scheduled_at);

GRANT SELECT, DELETE ON public.medication_schedules TO authenticated;
GRANT SELECT ON public.medication_reminders TO authenticated;
GRANT ALL ON public.medication_schedules, public.medication_reminders TO service_role;

ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own schedules" ON public.medication_schedules
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own schedules" ON public.medication_schedules
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users view own reminders" ON public.medication_reminders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Jadval yaratish: bemor AI taklifini tasdiqlagach chaqiriladi.
-- _items: [{medicine_name, dose, instructions, times: ["08:00", ...], days, start_date}]
CREATE OR REPLACE FUNCTION public.create_medication_schedules(
  _items jsonb,
  _source text DEFAULT 'manual',
  _prescription_id uuid DEFAULT NULL,
  _channels text[] DEFAULT ARRAY['web', 'telegram', 'app'],
  _timezone text DEFAULT 'Asia/Tashkent'
)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _plan text;
  _item jsonb;
  _times text[];
  _days int;
  _start date;
  _sid uuid;
  _active int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;

  _plan := public.plan_of(_uid);
  IF _plan NOT IN ('pro', 'premium') THEN
    RAISE EXCEPTION 'Dori eslatmalari Pro obunada ishlaydi' USING ERRCODE = '42501';
  END IF;
  IF 'sms' = ANY(_channels) AND NOT EXISTS (
    SELECT 1 FROM public.subscription_plans WHERE id = _plan AND sms_enabled
  ) THEN
    RAISE EXCEPTION 'SMS eslatma faqat Premium tarifda' USING ERRCODE = '42501';
  END IF;

  IF _source NOT IN ('prescription', 'upload', 'manual') THEN RAISE EXCEPTION 'Manba noto''g''ri'; END IF;
  IF _prescription_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prescriptions WHERE id = _prescription_id AND patient_id = _uid
  ) THEN
    RAISE EXCEPTION 'Retsept topilmadi' USING ERRCODE = '42501';
  END IF;

  PERFORM now() AT TIME ZONE _timezone;  -- noto'g'ri vaqt zonasi bo'lsa xato beradi

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Jadvalda 1 tadan 20 tagacha dori bo''lishi kerak';
  END IF;

  SELECT count(*) INTO _active FROM public.medication_schedules WHERE user_id = _uid AND is_active;
  IF _active + jsonb_array_length(_items) > 40 THEN
    RAISE EXCEPTION 'Faol jadvallar soni 40 tadan oshmasligi kerak';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}') INTO _times
    FROM jsonb_array_elements_text(COALESCE(_item->'times', '[]'::jsonb)) t;
    _days := COALESCE((_item->>'days')::int, 0);
    _start := COALESCE((_item->>'start_date')::date, (now() AT TIME ZONE _timezone)::date);

    IF NOT public.valid_hhmm_times(_times) THEN
      RAISE EXCEPTION 'Vaqtlar noto''g''ri: %', _item->>'medicine_name';
    END IF;

    INSERT INTO public.medication_schedules
      (user_id, prescription_id, source, medicine_name, dose, instructions, times, start_date, days, timezone, channels)
    VALUES
      (_uid, _prescription_id, _source, btrim(_item->>'medicine_name'), NULLIF(btrim(_item->>'dose'), ''),
       NULLIF(btrim(_item->>'instructions'), ''), _times, _start, _days, _timezone, _channels)
    RETURNING id INTO _sid;

    INSERT INTO public.medication_reminders (schedule_id, user_id, scheduled_at)
    SELECT _sid, _uid, ((d::date + t::time) AT TIME ZONE _timezone)
    FROM generate_series(_start, _start + (_days - 1), interval '1 day') d
    CROSS JOIN unnest(_times) t
    WHERE ((d::date + t::time) AT TIME ZONE _timezone) > now() - interval '5 minutes';

    RETURN NEXT _sid;
  END LOOP;
END; $$;

-- Jadvalni to'xtatish: kelgusi eslatmalar o'chiriladi, tarix qoladi.
CREATE OR REPLACE FUNCTION public.stop_medication_schedule(_schedule_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.medication_schedules SET is_active = false, updated_at = now()
  WHERE id = _schedule_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Jadval topilmadi' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.medication_reminders
  WHERE schedule_id = _schedule_id AND status = 'pending' AND scheduled_at > now();
END; $$;

-- "Ichdim" / "O'tkazib yubordim" (sayt, ilova; Telegram server orqali).
CREATE OR REPLACE FUNCTION public.mark_medication_reminder(_reminder_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('taken', 'skipped') THEN RAISE EXCEPTION 'Holat noto''g''ri'; END IF;
  UPDATE public.medication_reminders
    SET status = _status, responded_at = now()
  WHERE id = _reminder_id AND user_id = auth.uid()
    AND scheduled_at <= now() + interval '2 hours';
  IF NOT FOUND THEN RAISE EXCEPTION 'Eslatma topilmadi' USING ERRCODE = '42501'; END IF;
END; $$;

-- Vaqti kelgan eslatmalarni "sent" deb belgilab qaytaradi (dispatch-reminders funksiyasi uchun).
-- SKIP LOCKED: bir vaqtda ikki marta ishga tushsa ham bitta eslatma ikki marta yuborilmaydi.
CREATE OR REPLACE FUNCTION public.claim_due_medication_reminders(_limit int DEFAULT 300)
RETURNS TABLE (
  reminder_id uuid, user_id uuid, scheduled_at timestamptz, timezone text,
  medicine_name text, dose text, instructions text, channels text[], plan text,
  telegram_chat_id bigint, telegram_enabled boolean, phone text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 30 daqiqadan ko'p kechikib yuborilmagan eslatmalar "missed" bo'ladi.
  UPDATE public.medication_reminders r SET status = 'missed'
  WHERE r.status = 'pending' AND r.scheduled_at < now() - interval '30 minutes';

  -- Obunasi tugagan yoki jadvali to'xtatilganlarniki yuborilmaydi.
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
  SELECT c.id, c.user_id, c.scheduled_at, s.timezone, s.medicine_name, s.dose, s.instructions, s.channels,
         public.plan_of(c.user_id), p.telegram_chat_id, COALESCE(p.telegram_notifications_enabled, true), p.phone
  FROM claimed c
  JOIN public.medication_schedules s ON s.id = c.schedule_id
  LEFT JOIN public.profiles p ON p.user_id = c.user_id;
END; $$;

-- ---------------------------------------------------------------------
-- Saytdagi bildirishnomalar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON public.user_notifications (user_id, created_at DESC);

GRANT SELECT ON public.user_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.user_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users mark own notifications read" ON public.user_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Realtime publication not updated: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- AI rejalashtirish limiti
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_plan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  item_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_plan_logs_user_idx ON public.ai_plan_logs (user_id, created_at DESC);
GRANT ALL ON public.ai_plan_logs TO service_role;
ALTER TABLE public.ai_plan_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Funksiya huquqlari
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.plan_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.subscribe_plan(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_subscription_auto_renew(boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.renew_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_medication_schedules(jsonb, text, uuid, text[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stop_medication_schedule(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_medication_reminder(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_due_medication_reminders(int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.plan_of(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscribe_plan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_subscription_auto_renew(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscriptions() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_medication_schedules(jsonb, text, uuid, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_medication_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_medication_reminder(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_medication_reminders(int) TO service_role;

-- ---------------------------------------------------------------------
-- Rejalashtirilgan ishlar (pg_cron). Mavjud bo'lmasa migratsiya baribir o'tadi;
-- unda MEDICATIONS.md dagi GitHub Actions zaxira variantidan foydalaning.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron unavailable: %', SQLERRM;
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_net unavailable: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule('maxhospital-renew-subscriptions', '7 * * * *',
        'SELECT public.renew_subscriptions()');

      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        -- Har daqiqada eslatmalarni yuboruvchi funksiyani chaqiradi.
        -- URL va maxfiy kalit Vault'da saqlanadi (MEDICATIONS.md, 2-qadam).
        PERFORM cron.schedule('maxhospital-dispatch-reminders', '* * * * *', $cron$
          SELECT net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_function_url'),
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')
            ),
            body := '{}'::jsonb
          )
          WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'reminders_function_url');
        $cron$);
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'cron jobs not scheduled: %', SQLERRM;
    END;
  END IF;
END $$;
