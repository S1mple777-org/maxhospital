-- =====================================================================
-- MaxHospital: MaxBand aqlli bilaguzugi
--  * Faollashtirish kodi (qutida)      : 3 oy Premium sovg'a (band_activation_codes)
--  * Qurilma ulash                     : bilaguzuk ekranidagi 6 xonali kod bilan (band_devices)
--  * O'lchovlar                        : puls, SpO2, HRV (stress), qadam, uyqu (band_readings)
--  * Hodisalar                         : SOS, yiqilish, xavfli puls/SpO2, dori ichilmadi, shifokorga murojaat (band_events)
--  * Oila nazorati (Premium)           : boshqa akkaunt egasi (farzand) ko'rsatkichlarni ko'radi (band_guardians)
--  * Shifokor jonli ko'radi (Premium)  : faol konsultatsiyada puls va SpO2 (consultation_band_live)
-- Tariflar: Free — soat, qadam, SOS; Pro — sinxronlash, dori eslatmalari, ogohlantirishlar, QR;
--           Premium — oila nazorati, shifokor monitoringi, "dori ichilmadi" xabari.
-- SOS va yiqilish xabari tarifdan qat'i nazar ishlaydi (xavfsizlik pullik emas).
-- Qoidalar (AGENTS.md): auth.users ga FK yo'q, aniq GRANT'lar, pul va obuna faqat RPC orqali.
-- Qurilma yozuvlari faqat server funksiyasi (device-api, service_role) orqali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Faollashtirish kodlari
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.band_activation_codes (
  code text PRIMARY KEY CHECK (code ~ '^MXB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  premium_days int NOT NULL DEFAULT 90 CHECK (premium_days BETWEEN 1 AND 366),
  batch text CHECK (batch IS NULL OR char_length(batch) <= 60),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid,
  redeemed_at timestamptz
);
CREATE INDEX IF NOT EXISTS band_activation_codes_redeemed_idx ON public.band_activation_codes (redeemed_by);

GRANT SELECT ON public.band_activation_codes TO authenticated;
GRANT ALL ON public.band_activation_codes TO service_role;
ALTER TABLE public.band_activation_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view band codes" ON public.band_activation_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users view own redeemed codes" ON public.band_activation_codes FOR SELECT TO authenticated
  USING (redeemed_by = auth.uid());

-- Owner: qutilar uchun kodlar yaratish. Harflar I, O, 0, 1 siz (adashmaslik uchun).
CREATE OR REPLACE FUNCTION public.generate_band_codes(_count int, _premium_days int DEFAULT 90, _batch text DEFAULT NULL)
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text; _b bytea; _made int := 0; _tries int := 0; _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Faqat owner uchun' USING ERRCODE = '42501';
  END IF;
  IF _count IS NULL OR _count NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Soni 1 dan 500 gacha bo''lsin'; END IF;
  IF _premium_days IS NULL OR _premium_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'Muddat 1–366 kun bo''lsin'; END IF;
  WHILE _made < _count AND _tries < _count * 5 LOOP
    _tries := _tries + 1;
    _b := extensions.gen_random_bytes(8);
    _code := 'MXB-';
    FOR j IN 0..7 LOOP
      _code := _code || substr(_alphabet, (get_byte(_b, j) % 32) + 1, 1);
      IF j = 3 THEN _code := _code || '-'; END IF;
    END LOOP;
    INSERT INTO public.band_activation_codes (code, premium_days, batch, created_by)
    VALUES (_code, _premium_days, NULLIF(btrim(_batch), ''), auth.uid())
    ON CONFLICT (code) DO NOTHING;
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n = 1 THEN
      _made := _made + 1;
      RETURN NEXT _code;
    END IF;
  END LOOP;
END; $$;

-- Foydalanuvchi: qutidagi kodni kiritadi -> Premium (qolgan obuna kunlari saqlanadi).
-- Avtomatik uzaytirish o'chiriladi: sovg'a tugaganda balansdan kutilmagan to'lov bo'lmasin.
CREATE OR REPLACE FUNCTION public.redeem_band_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.band_activation_codes%ROWTYPE;
  _sub public.subscriptions%ROWTYPE;
  _active boolean; _end timestamptz; _kind text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _c FROM public.band_activation_codes WHERE code = upper(btrim(COALESCE(_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kod topilmadi. Qutidagi kodni tekshiring'; END IF;
  IF _c.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Bu kod allaqachon ishlatilgan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = 'premium') THEN
    RAISE EXCEPTION 'Premium tarifi topilmadi';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE user_id = _uid FOR UPDATE;
  _active := FOUND AND _sub.status = 'active' AND _sub.current_period_end > now();
  _end := (CASE WHEN _active THEN _sub.current_period_end ELSE now() END) + make_interval(days => _c.premium_days);
  _kind := CASE WHEN NOT _active THEN 'new' WHEN _sub.plan_id = 'premium' THEN 'extend' ELSE 'change' END;

  INSERT INTO public.subscriptions AS s (user_id, plan_id, status, current_period_end, auto_renew, updated_at)
  VALUES (_uid, 'premium', 'active', _end, false, now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = 'premium', status = 'active', current_period_end = EXCLUDED.current_period_end,
        auto_renew = false, updated_at = now()
  RETURNING * INTO _sub;

  UPDATE public.band_activation_codes SET redeemed_by = _uid, redeemed_at = now() WHERE code = _c.code;
  INSERT INTO public.subscription_payments (user_id, plan_id, amount_uzs, kind, period_end)
  VALUES (_uid, 'premium', 0, _kind, _end);
  INSERT INTO public.user_notifications (user_id, kind, title, body, data)
  VALUES (_uid, 'maxband', 'MaxBand faollashtirildi',
          format('Premium %s gacha faol. Avtomatik uzaytirish o''chiq — xohlasangiz Pro sahifasida yoqing.',
                 to_char(_end AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY')),
          jsonb_build_object('link', '/maxband'));

  RETURN jsonb_build_object('plan', 'premium', 'period_end', _end, 'days', _c.premium_days);
END; $$;

-- ---------------------------------------------------------------------
-- Qurilmalar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.band_default_settings()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'hr_high', 130, 'hr_low', 40, 'spo2_low', 90,
    'fall_detection', true,
    'water_interval_min', 120, 'sedentary_min', 60, 'steps_goal', 6000,
    'quiet_from', '22:00', 'quiet_to', '07:00'
  );
$$;

-- Sozlamalarni tekshirib, chegaralarga keltiradi. Noma'lum kalitlar tashlab yuboriladi.
CREATE OR REPLACE FUNCTION public.band_clean_settings(_s jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  _d jsonb := public.band_default_settings();
  _r jsonb := '{}'::jsonb;
  _k text;
  _lim constant jsonb := '{"hr_high":[90,200],"hr_low":[30,70],"spo2_low":[80,96],"water_interval_min":[0,480],"sedentary_min":[0,240],"steps_goal":[500,50000]}';
BEGIN
  _s := COALESCE(_s, '{}'::jsonb);
  FOR _k IN SELECT jsonb_object_keys(_lim) LOOP
    IF jsonb_typeof(_s -> _k) = 'number' THEN
      _r := _r || jsonb_build_object(_k, LEAST(GREATEST(round((_s ->> _k)::numeric)::int, (_lim -> _k ->> 0)::int), (_lim -> _k ->> 1)::int));
    ELSE
      _r := _r || jsonb_build_object(_k, _d -> _k);
    END IF;
  END LOOP;
  _r := _r || jsonb_build_object('fall_detection',
    CASE WHEN jsonb_typeof(_s -> 'fall_detection') = 'boolean' THEN _s -> 'fall_detection' ELSE _d -> 'fall_detection' END);
  FOREACH _k IN ARRAY ARRAY['quiet_from', 'quiet_to'] LOOP
    _r := _r || jsonb_build_object(_k,
      CASE WHEN COALESCE(_s ->> _k, '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN _s -> _k ELSE _d -> _k END);
  END LOOP;
  IF (_r ->> 'hr_low')::int >= (_r ->> 'hr_high')::int THEN
    _r := _r || jsonb_build_object('hr_low', _d -> 'hr_low', 'hr_high', _d -> 'hr_high');
  END IF;
  RETURN _r;
END; $$;

CREATE TABLE IF NOT EXISTS public.band_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial text NOT NULL UNIQUE CHECK (serial ~ '^[A-Za-z0-9_-]{4,64}$'),
  -- Qurilma o'zi yaratgan maxfiy tokenning sha256 xeshi. Tokenning o'zi bazada saqlanmaydi.
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'MaxBand' CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  is_virtual boolean NOT NULL DEFAULT false,
  pair_code text CHECK (pair_code IS NULL OR pair_code ~ '^[0-9]{6}$'),
  pair_expires_at timestamptz,
  firmware text CHECK (firmware IS NULL OR char_length(firmware) <= 40),
  battery int CHECK (battery IS NULL OR battery BETWEEN 0 AND 100),
  settings jsonb NOT NULL DEFAULT public.band_default_settings(),
  last_seen_at timestamptz,
  last_lat double precision CHECK (last_lat IS NULL OR last_lat BETWEEN -90 AND 90),
  last_lng double precision CHECK (last_lng IS NULL OR last_lng BETWEEN -180 AND 180),
  last_location_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS band_devices_token_idx ON public.band_devices (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS band_devices_pair_idx ON public.band_devices (pair_code) WHERE owner_id IS NULL AND pair_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS band_devices_owner_idx ON public.band_devices (owner_id, family_member_id);

-- Noto'g'ri ulash kodlari (taxmin qilib topishga qarshi cheklov).
CREATE TABLE IF NOT EXISTS public.band_claim_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS band_claim_failures_user_idx ON public.band_claim_failures (user_id, created_at DESC);
GRANT ALL ON public.band_claim_failures TO service_role;
ALTER TABLE public.band_claim_failures ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Oila nazorati: boshqa akkaunt egasi (masalan farzand) bilaguzuk egasini kuzatadi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.band_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wearer_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (wearer_id, guardian_id),
  CHECK (wearer_id <> guardian_id)
);
CREATE INDEX IF NOT EXISTS band_guardians_guardian_idx ON public.band_guardians (guardian_id, status);

-- Kuzatuvchimi (taklifni qabul qilgan)?
CREATE OR REPLACE FUNCTION public.is_band_guardian(_wearer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.band_guardians g
    WHERE g.wearer_id = _wearer AND g.guardian_id = auth.uid() AND g.status = 'accepted');
$$;

-- Bilaguzuk ma'lumotini ko'rish huquqi: egasi; yoki (o'zi taqadigan bo'lsa) Premium'dagi kuzatuvchi.
CREATE OR REPLACE FUNCTION public.can_view_band(_owner uuid, _member uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND _owner IS NOT NULL AND (
    _owner = auth.uid()
    OR (_member IS NULL AND public.is_band_guardian(_owner) AND public.plan_of_internal(_owner) = 'premium')
  );
$$;

GRANT SELECT ON public.band_guardians TO authenticated;
GRANT DELETE ON public.band_guardians TO authenticated;
GRANT ALL ON public.band_guardians TO service_role;
ALTER TABLE public.band_guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wearer and guardian view link" ON public.band_guardians FOR SELECT TO authenticated
  USING (wearer_id = auth.uid() OR guardian_id = auth.uid());
CREATE POLICY "Wearer or guardian removes link" ON public.band_guardians FOR DELETE TO authenticated
  USING (wearer_id = auth.uid() OR guardian_id = auth.uid());

-- Qurilmalar: maxfiy ustunlar (token xeshi, ulash kodi, joylashuv) mijozga berilmaydi.
GRANT SELECT (id, serial, owner_id, family_member_id, name, is_virtual, firmware, battery, settings,
              last_seen_at, last_location_at, claimed_at, created_at)
  ON public.band_devices TO authenticated;
GRANT ALL ON public.band_devices TO service_role;
ALTER TABLE public.band_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and guardians view bands" ON public.band_devices FOR SELECT TO authenticated
  USING (public.can_view_band(owner_id, family_member_id));

-- ---------------------------------------------------------------------
-- O'lchovlar va hodisalar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.band_readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES public.band_devices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE CASCADE,
  -- hr: zarba/daq; spo2: %; hrv: RMSSD ms; steps: oraliqdagi qadamlar; sleep: oraliqda uxlangan daqiqalar
  kind text NOT NULL CHECK (kind IN ('hr', 'spo2', 'hrv', 'steps', 'sleep')),
  value real NOT NULL CHECK (value >= 0 AND value < 100000),
  measured_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS band_readings_dedupe_idx ON public.band_readings (device_id, kind, measured_at);
CREATE INDEX IF NOT EXISTS band_readings_wearer_idx ON public.band_readings (owner_id, family_member_id, kind, measured_at DESC);

GRANT SELECT ON public.band_readings TO authenticated;
GRANT ALL ON public.band_readings TO service_role;
ALTER TABLE public.band_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and guardians view readings" ON public.band_readings FOR SELECT TO authenticated
  USING (public.can_view_band(owner_id, family_member_id));

CREATE TABLE IF NOT EXISTS public.band_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.band_devices(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sos', 'fall', 'hr_high', 'hr_low', 'spo2_low', 'med_missed', 'consult_request')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  value real,
  lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  location_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
CREATE INDEX IF NOT EXISTS band_events_wearer_idx ON public.band_events (owner_id, family_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS band_events_device_kind_idx ON public.band_events (device_id, kind, created_at DESC);

GRANT SELECT ON public.band_events TO authenticated;
GRANT ALL ON public.band_events TO service_role;
ALTER TABLE public.band_events ENABLE ROW LEVEL SECURITY;
-- SOS va yiqilishni kuzatuvchi tarifdan qat'i nazar ko'radi.
CREATE POLICY "Owners and guardians view band events" ON public.band_events FOR SELECT TO authenticated
  USING (public.can_view_band(owner_id, family_member_id)
         OR (kind IN ('sos', 'fall') AND family_member_id IS NULL AND public.is_band_guardian(owner_id)));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.band_events;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Realtime publication not updated: %', SQLERRM;
END $$;

-- Dori eslatmasi ichilmagani haqida oilaga xabar yuborilganini belgilash.
ALTER TABLE public.medication_reminders ADD COLUMN IF NOT EXISTS band_notified_at timestamptz;

-- ---------------------------------------------------------------------
-- Ulash (qurilma -> server -> foydalanuvchi)
-- ---------------------------------------------------------------------
-- Qurilma birinchi marta ulanganda (yoki egasi uni olib tashlagach) chaqiriladi. Faqat service_role.
-- Egasi bor qurilmani boshqa token bilan qayta ulab bo'lmaydi: avval saytda "Olib tashlash" kerak.
CREATE OR REPLACE FUNCTION public.band_pair_start(_serial text, _token_hash text, _firmware text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.band_devices%ROWTYPE; _exists boolean; _code text; _try int := 0;
BEGIN
  SELECT * INTO _d FROM public.band_devices WHERE serial = _serial FOR UPDATE;
  _exists := FOUND;
  IF _exists AND _d.owner_id IS NOT NULL THEN
    IF _d.token_hash = _token_hash THEN
      RETURN jsonb_build_object('claimed', true, 'device_id', _d.id);
    END IF;
    RETURN jsonb_build_object('error', 'claimed_elsewhere');
  END IF;
  LOOP
    _code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    BEGIN
      IF _exists THEN
        UPDATE public.band_devices
          SET token_hash = _token_hash, pair_code = _code, pair_expires_at = now() + interval '15 minutes',
              firmware = COALESCE(left(_firmware, 40), firmware), is_virtual = _serial LIKE 'SIM-%'
          WHERE id = _d.id RETURNING * INTO _d;
      ELSE
        INSERT INTO public.band_devices (serial, token_hash, pair_code, pair_expires_at, firmware, is_virtual)
        VALUES (_serial, _token_hash, _code, now() + interval '15 minutes', left(_firmware, 40), _serial LIKE 'SIM-%')
        RETURNING * INTO _d;
      END IF;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      _try := _try + 1;
      IF _try > 8 THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('claimed', false, 'device_id', _d.id, 'pair_code', _d.pair_code, 'pair_expires_at', _d.pair_expires_at);
END; $$;

-- Foydalanuvchi: bilaguzuk ekranidagi kodni kiritadi. _family_member_id — kim taqadi (NULL = o'zim).
-- Xatoda RAISE emas, jsonb qaytaradi: aks holda noto'g'ri urinish yozuvi ham bekor bo'lib ketadi.
CREATE OR REPLACE FUNCTION public.claim_band(_pair_code text, _family_member_id uuid DEFAULT NULL, _name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _d public.band_devices%ROWTYPE; _fails int; _count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO _fails FROM public.band_claim_failures WHERE user_id = _uid AND created_at > now() - interval '1 hour';
  IF _fails >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Juda ko''p noto''g''ri urinish. 1 soatdan keyin qayta urinib ko''ring');
  END IF;
  IF _family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members WHERE id = _family_member_id AND owner_id = _uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Oila a''zosi topilmadi');
  END IF;
  SELECT count(*) INTO _count FROM public.band_devices WHERE owner_id = _uid;
  IF _count >= 6 THEN RETURN jsonb_build_object('ok', false, 'error', 'Bitta akkauntga 6 tagacha bilaguzuk ulanadi'); END IF;

  SELECT * INTO _d FROM public.band_devices
  WHERE pair_code = btrim(COALESCE(_pair_code, '')) AND owner_id IS NULL AND pair_expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.band_claim_failures (user_id) VALUES (_uid);
    RETURN jsonb_build_object('ok', false, 'error', 'Kod noto''g''ri yoki muddati o''tgan. Bilaguzuk ekranidagi kodni kiriting');
  END IF;
  UPDATE public.band_devices
    SET owner_id = _uid, family_member_id = _family_member_id, pair_code = NULL, pair_expires_at = NULL,
        claimed_at = now(), settings = public.band_default_settings(),
        name = COALESCE(NULLIF(left(btrim(_name), 40), ''), CASE WHEN is_virtual THEN 'MaxBand (simulyator)' ELSE 'MaxBand' END)
    WHERE id = _d.id;
  RETURN jsonb_build_object('ok', true, 'device_id', _d.id);
END; $$;

-- Olib tashlash: qurilma tokeni bekor qilinadi, tarix (o'lchovlar) egasida qoladi.
CREATE OR REPLACE FUNCTION public.remove_band(_device_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.band_devices
    SET owner_id = NULL, family_member_id = NULL, claimed_at = NULL, pair_code = NULL, pair_expires_at = NULL,
        token_hash = encode(extensions.gen_random_bytes(32), 'hex'), battery = NULL,
        last_lat = NULL, last_lng = NULL, last_location_at = NULL, settings = public.band_default_settings()
    WHERE id = _device_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Qurilma topilmadi' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.update_band(_device_id uuid, _name text, _family_member_id uuid, _settings jsonb)
RETURNS public.band_devices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.band_devices%ROWTYPE;
BEGIN
  IF _family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members WHERE id = _family_member_id AND owner_id = _uid) THEN
    RAISE EXCEPTION 'Oila a''zosi topilmadi' USING ERRCODE = '42501';
  END IF;
  UPDATE public.band_devices
    SET name = COALESCE(NULLIF(left(btrim(_name), 40), ''), name),
        family_member_id = _family_member_id,
        settings = public.band_clean_settings(_settings)
    WHERE id = _device_id AND owner_id = _uid
    RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Qurilma topilmadi' USING ERRCODE = '42501'; END IF;
  _row.token_hash := repeat('0', 64);
  _row.pair_code := NULL;
  RETURN _row;
END; $$;

-- Telefon/sayt (bilaguzuk egasi yonida) oxirgi joylashuvni yuboradi: SOS xabarida ishlatiladi.
CREATE OR REPLACE FUNCTION public.report_band_location(_lat double precision, _lng double precision)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Joylashuv noto''g''ri';
  END IF;
  UPDATE public.band_devices SET last_lat = _lat, last_lng = _lng, last_location_at = now()
  WHERE owner_id = auth.uid() AND family_member_id IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;

-- ---------------------------------------------------------------------
-- Kuzatuvchilar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_band_guardian(_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _gid uuid; _n int; _id uuid; _name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  IF public.plan_of_internal(_uid) <> 'premium' THEN
    RAISE EXCEPTION 'Oila nazorati Premium tarifda ishlaydi' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO _gid FROM auth.users u WHERE lower(u.email) = lower(btrim(COALESCE(_email, ''))) LIMIT 1;
  IF _gid IS NULL THEN RAISE EXCEPTION 'Bu email bilan ro''yxatdan o''tgan foydalanuvchi topilmadi'; END IF;
  IF _gid = _uid THEN RAISE EXCEPTION 'O''zingizni kuzatuvchi qila olmaysiz'; END IF;
  SELECT count(*) INTO _n FROM public.band_guardians WHERE wearer_id = _uid;
  IF _n >= 5 THEN RAISE EXCEPTION 'Kuzatuvchilar soni 5 tadan oshmasin'; END IF;
  INSERT INTO public.band_guardians (wearer_id, guardian_id) VALUES (_uid, _gid)
  ON CONFLICT (wearer_id, guardian_id) DO NOTHING RETURNING id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Bu foydalanuvchi allaqachon taklif qilingan'; END IF;
  SELECT full_name INTO _name FROM public.profiles WHERE user_id = _uid;
  INSERT INTO public.user_notifications (user_id, kind, title, body, data)
  VALUES (_gid, 'maxband', 'MaxBand: kuzatuvchi taklifi',
          format('%s sizni MaxBand ko''rsatkichlarini kuzatishga taklif qildi. Qabul qilsangiz, SOS va xavfli holatlar haqida xabar olasiz.', COALESCE(_name, 'Foydalanuvchi')),
          jsonb_build_object('link', '/maxband', 'guardian_link_id', _id));
  RETURN jsonb_build_object('id', _id);
END; $$;

CREATE OR REPLACE FUNCTION public.accept_band_guardian(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.band_guardians SET status = 'accepted', accepted_at = now()
  WHERE id = _id AND guardian_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Taklif topilmadi' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_band_event(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e public.band_events%ROWTYPE;
BEGIN
  SELECT * INTO _e FROM public.band_events WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT (public.can_view_band(_e.owner_id, _e.family_member_id)
     OR (_e.kind IN ('sos', 'fall') AND _e.family_member_id IS NULL AND public.is_band_guardian(_e.owner_id))) THEN
    RAISE EXCEPTION 'Hodisa topilmadi' USING ERRCODE = '42501';
  END IF;
  UPDATE public.band_events SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _id AND status = 'open';
END; $$;

-- ---------------------------------------------------------------------
-- Ko'rinish uchun yig'ma ma'lumot (grafiklar). Hisob-kitob shu yerda, mijozga kam qator boradi.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.band_overview(_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _d public.band_devices%ROWTYPE;
  _today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent';
  _o uuid; _m uuid; _wearer text;
BEGIN
  SELECT * INTO _d FROM public.band_devices WHERE id = _device_id;
  IF NOT FOUND OR NOT public.can_view_band(_d.owner_id, _d.family_member_id) THEN
    RAISE EXCEPTION 'Qurilma topilmadi' USING ERRCODE = '42501';
  END IF;
  _o := _d.owner_id; _m := _d.family_member_id;
  SELECT COALESCE((SELECT full_name FROM public.family_members WHERE id = _m),
                  (SELECT full_name FROM public.profiles WHERE user_id = _o)) INTO _wearer;

  RETURN jsonb_build_object(
    'device', jsonb_build_object('id', _d.id, 'name', _d.name, 'serial', _d.serial, 'battery', _d.battery,
      'last_seen_at', _d.last_seen_at, 'is_virtual', _d.is_virtual, 'firmware', _d.firmware,
      'settings', _d.settings, 'family_member_id', _m, 'owner_id', _o, 'wearer', _wearer,
      'plan', public.plan_of_internal(_o)),
    'latest', (SELECT COALESCE(jsonb_object_agg(kind, jsonb_build_object('v', value, 't', measured_at)), '{}'::jsonb)
               FROM (SELECT DISTINCT ON (kind) kind, value, measured_at FROM public.band_readings
                     WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m
                       AND kind IN ('hr', 'spo2', 'hrv') AND measured_at > now() - interval '3 days'
                     ORDER BY kind, measured_at DESC) x),
    'steps_7d', (SELECT jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'steps', COALESCE(s.steps, 0)) ORDER BY d.day)
                 FROM generate_series(_today - interval '6 days', _today, interval '1 day') AS d(day)
                 LEFT JOIN (SELECT date_trunc('day', measured_at AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent' AS day, sum(value)::int AS steps
                            FROM public.band_readings
                            WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m AND kind = 'steps'
                              AND measured_at >= _today - interval '6 days'
                            GROUP BY 1) s ON s.day = d.day),
    'hr_24h', (SELECT COALESCE(jsonb_agg(jsonb_build_object('t', b, 'avg', round(a), 'min', mn, 'max', mx) ORDER BY b), '[]'::jsonb)
               FROM (SELECT to_timestamp(floor(extract(epoch FROM measured_at) / 1800) * 1800) AS b,
                            avg(value) AS a, min(value) AS mn, max(value) AS mx
                     FROM public.band_readings
                     WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m AND kind = 'hr'
                       AND measured_at > now() - interval '24 hours'
                     GROUP BY 1) x),
    'spo2_24h', (SELECT COALESCE(jsonb_agg(jsonb_build_object('t', b, 'avg', round(a::numeric, 1), 'min', mn) ORDER BY b), '[]'::jsonb)
                 FROM (SELECT to_timestamp(floor(extract(epoch FROM measured_at) / 3600) * 3600) AS b, avg(value) AS a, min(value) AS mn
                       FROM public.band_readings
                       WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m AND kind = 'spo2'
                         AND measured_at > now() - interval '24 hours'
                       GROUP BY 1) x),
    -- Kechagi kechqurun 18:00 dan bugun 12:00 gacha: uyqu oraliqlari va shu vaqtdagi puls
    'night', jsonb_build_object(
      'from', _today - interval '6 hours', 'to', _today + interval '12 hours',
      'sleep', (SELECT COALESCE(jsonb_agg(jsonb_build_object('t', measured_at, 'v', value) ORDER BY measured_at), '[]'::jsonb)
                FROM public.band_readings
                WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m AND kind = 'sleep'
                  AND measured_at >= _today - interval '6 hours' AND measured_at < _today + interval '12 hours'),
      'hr', (SELECT COALESCE(jsonb_agg(jsonb_build_object('t', measured_at, 'v', value) ORDER BY measured_at), '[]'::jsonb)
             FROM (SELECT measured_at, value FROM public.band_readings
                   WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m AND kind = 'hr'
                     AND measured_at >= _today - interval '6 hours' AND measured_at < _today + interval '12 hours'
                   ORDER BY measured_at LIMIT 400) h)),
    'hrv_14d', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'avg', round(a::numeric, 1)) ORDER BY day), '[]'::jsonb)
                FROM (SELECT to_char(measured_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS day, avg(value) AS a
                      FROM public.band_readings
                      WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m AND kind = 'hrv'
                        AND measured_at >= _today - interval '13 days'
                      GROUP BY 1) x),
    'events', (SELECT COALESCE(jsonb_agg(to_jsonb(e) - 'device_id' ORDER BY e.created_at DESC), '[]'::jsonb)
               FROM (SELECT id, device_id, kind, status, value, lat, lng, location_at, data, created_at, resolved_at
                     FROM public.band_events
                     WHERE owner_id = _o AND family_member_id IS NOT DISTINCT FROM _m
                     ORDER BY created_at DESC LIMIT 20) e),
    'meds_today', (SELECT jsonb_build_object(
                     'total', count(*),
                     'taken', count(*) FILTER (WHERE r.status = 'taken'),
                     'skipped', count(*) FILTER (WHERE r.status = 'skipped'),
                     'missed', count(*) FILTER (WHERE r.status IN ('missed', 'sent') AND r.scheduled_at < now() - interval '30 minutes'),
                     'upcoming', count(*) FILTER (WHERE r.status IN ('pending', 'sent') AND r.scheduled_at >= now() - interval '30 minutes'))
                   FROM public.medication_reminders r JOIN public.medication_schedules s ON s.id = r.schedule_id
                   WHERE r.user_id = _o AND s.family_member_id IS NOT DISTINCT FROM _m
                     AND r.scheduled_at >= _today AND r.scheduled_at < _today + interval '1 day')
  );
END; $$;

-- Shifokor (yoki bemor): faol konsultatsiya paytida puls va SpO2 (Premium).
CREATE OR REPLACE FUNCTION public.consultation_band_live(_consultation_id uuid, _minutes int DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.consultations%ROWTYPE; _since timestamptz;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id;
  IF NOT FOUND OR (_c.patient_id IS DISTINCT FROM auth.uid() AND NOT EXISTS (
       SELECT 1 FROM public.doctors d WHERE d.id = _c.doctor_id AND d.user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Konsultatsiya topilmadi' USING ERRCODE = '42501';
  END IF;
  IF _c.status <> 'active' THEN RETURN jsonb_build_object('available', false, 'reason', 'not_active'); END IF;
  IF public.plan_of_internal(_c.patient_id) <> 'premium' THEN RETURN jsonb_build_object('available', false, 'reason', 'plan'); END IF;
  _since := now() - make_interval(mins => LEAST(GREATEST(COALESCE(_minutes, 60), 5), 240));
  RETURN jsonb_build_object(
    'available', true,
    'device', (SELECT jsonb_build_object('name', name, 'battery', battery, 'last_seen_at', last_seen_at, 'is_virtual', is_virtual)
               FROM public.band_devices
               WHERE owner_id = _c.patient_id AND family_member_id IS NOT DISTINCT FROM _c.family_member_id
               ORDER BY last_seen_at DESC NULLS LAST LIMIT 1),
    'readings', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', kind, 'v', value, 't', measured_at) ORDER BY measured_at), '[]'::jsonb)
                 FROM (SELECT kind, value, measured_at FROM public.band_readings
                       WHERE owner_id = _c.patient_id AND family_member_id IS NOT DISTINCT FROM _c.family_member_id
                         AND kind IN ('hr', 'spo2') AND measured_at > _since
                       ORDER BY measured_at DESC LIMIT 1000) r),
    'events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'value', value, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
               FROM (SELECT kind, value, created_at FROM public.band_events
                     WHERE owner_id = _c.patient_id AND family_member_id IS NOT DISTINCT FROM _c.family_member_id
                       AND created_at > now() - interval '24 hours'
                     ORDER BY created_at DESC LIMIT 10) e)
  );
END; $$;

-- ---------------------------------------------------------------------
-- Server (device-api, weekly-report) uchun
-- ---------------------------------------------------------------------
-- 30 daqiqa ichida "Ichdim" bosilmagan eslatmalar: bir marta qaytaradi (oilaga xabar uchun).
CREATE OR REPLACE FUNCTION public.claim_band_missed_reminders(_owner uuid, _member uuid)
RETURNS TABLE (reminder_id uuid, medicine_name text, dose text, scheduled_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id FROM public.medication_reminders r
    JOIN public.medication_schedules s ON s.id = r.schedule_id
    WHERE r.user_id = _owner AND s.family_member_id IS NOT DISTINCT FROM _member
      AND r.status IN ('pending', 'sent', 'missed') AND r.responded_at IS NULL AND r.band_notified_at IS NULL
      AND r.scheduled_at < now() - interval '30 minutes' AND r.scheduled_at > now() - interval '6 hours'
    FOR UPDATE OF r SKIP LOCKED
  ), upd AS (
    UPDATE public.medication_reminders r SET band_notified_at = now()
    FROM due WHERE r.id = due.id
    RETURNING r.id, r.scheduled_at, r.schedule_id
  )
  SELECT upd.id, s.medicine_name, s.dose, upd.scheduled_at
  FROM upd JOIN public.medication_schedules s ON s.id = upd.schedule_id
  ORDER BY upd.scheduled_at;
END; $$;

-- Haftalik hisobot uchun bilaguzuk yig'masi (faqat o'zi taqadigan bilaguzuk).
CREATE OR REPLACE FUNCTION public.band_week_summary(_owner uuid, _from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT kind, value, measured_at, (measured_at AT TIME ZONE 'Asia/Tashkent')::date AS day
    FROM public.band_readings
    WHERE owner_id = _owner AND family_member_id IS NULL AND measured_at >= _from AND measured_at < _to
  ), days AS (
    SELECT day, sum(value) FILTER (WHERE kind = 'steps') AS steps FROM r GROUP BY day
  ), nights AS (
    -- uyqu: 18:00 dan keyingi kun 12:00 gacha, kechasi boshlangan sana bo'yicha
    SELECT ((measured_at AT TIME ZONE 'Asia/Tashkent') - interval '12 hours')::date AS night, sum(value) AS mins
    FROM r WHERE kind = 'sleep' GROUP BY 1
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM r) THEN NULL ELSE jsonb_build_object(
    'days', (SELECT count(*) FROM days),
    'steps_avg', (SELECT round(avg(COALESCE(steps, 0))) FROM days),
    'sleep_avg_min', (SELECT round(avg(mins)) FROM nights WHERE mins >= 60),
    'hr_avg', (SELECT round(avg(value)) FROM r WHERE kind = 'hr'),
    'hr_max', (SELECT max(value) FROM r WHERE kind = 'hr'),
    'spo2_min', (SELECT min(value) FROM r WHERE kind = 'spo2'),
    'alerts', (SELECT count(*) FROM public.band_events
               WHERE owner_id = _owner AND family_member_id IS NULL AND created_at >= _from AND created_at < _to
                 AND kind IN ('sos', 'fall', 'hr_high', 'hr_low', 'spo2_low'))
  ) END;
$$;

-- Owner panel: faqat sonlar (boshqalarning salomatlik ma'lumoti ko'rsatilmaydi).
CREATE OR REPLACE FUNCTION public.band_admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Faqat xodimlar uchun' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'devices', (SELECT count(*) FROM public.band_devices WHERE owner_id IS NOT NULL AND NOT is_virtual),
    'online', (SELECT count(*) FROM public.band_devices WHERE owner_id IS NOT NULL AND last_seen_at > now() - interval '10 minutes'),
    'sos30', (SELECT count(*) FROM public.band_events WHERE kind IN ('sos', 'fall') AND created_at > now() - interval '30 days'));
END; $$;

-- ---------------------------------------------------------------------
-- Ruxsatlar
-- ---------------------------------------------------------------------
-- Supabase yangi jadvallarga standart ALL beradi: avval olib, keyin aniq ruxsat beramiz
-- (aks holda token xeshi va joylashuv ustunlari mijozga ko'rinib qoladi).
REVOKE ALL ON public.band_activation_codes, public.band_devices, public.band_claim_failures,
              public.band_guardians, public.band_readings, public.band_events FROM anon, authenticated;
GRANT SELECT ON public.band_activation_codes TO authenticated;
GRANT SELECT (id, serial, owner_id, family_member_id, name, is_virtual, firmware, battery, settings,
              last_seen_at, last_location_at, claimed_at, created_at)
  ON public.band_devices TO authenticated;
GRANT SELECT, DELETE ON public.band_guardians TO authenticated;
GRANT SELECT ON public.band_readings TO authenticated;
GRANT SELECT ON public.band_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_band_codes(int, int, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_band_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.band_default_settings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.band_clean_settings(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_band_guardian(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_band(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.band_pair_start(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_band(text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_band(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_band(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_band_location(double precision, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_band_guardian(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_band_guardian(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_band_event(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.band_overview(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consultation_band_live(uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_band_missed_reminders(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.band_week_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.band_admin_stats() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.generate_band_codes(int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_band_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.band_default_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.band_clean_settings(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_band_guardian(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_band(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.band_pair_start(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_band(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_band(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_band(uuid, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_band_location(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_band_guardian(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_band_guardian(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_band_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.band_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultation_band_live(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_band_missed_reminders(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.band_week_summary(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.band_admin_stats() TO authenticated;
