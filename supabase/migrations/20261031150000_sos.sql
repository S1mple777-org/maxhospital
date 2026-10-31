-- SOS — favqulodda rejim.
--  * Ilovadagi SOS tugmasi (sos edge funksiyasi) va MaxBand SOS/yiqilish (band_events trigger) —
--    yaqinlarga Telegram + ilova (bepul) va SMS (pullik).
--  * 103 ga avtomatik qo'ng'iroq yo'q (foydalanuvchi talabi).
--  * SMS puli balansdan; yetmasa — qarzga (emergency_credits, consultation_id = NULL, reason = 'sos_sms').
-- Qayta ishga tushirish xavfsiz.

CREATE TABLE IF NOT EXISTS public.sos_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  phone text NOT NULL CHECK (phone ~ '^998[0-9]{9}$'),
  relation text CHECK (char_length(relation) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);
ALTER TABLE public.sos_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own SOS contacts" ON public.sos_contacts;
CREATE POLICY "Own SOS contacts" ON public.sos_contacts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sos_contacts TO authenticated;

-- Ko'pi bilan 5 ta raqam
CREATE OR REPLACE FUNCTION public.sos_contacts_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.sos_contacts WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Ko''pi bilan 5 ta SOS raqami qo''shish mumkin';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sos_contacts_limit ON public.sos_contacts;
CREATE TRIGGER trg_sos_contacts_limit BEFORE INSERT ON public.sos_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sos_contacts_limit();

CREATE TABLE IF NOT EXISTS public.sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sos', 'fall')),
  source text NOT NULL CHECK (source IN ('app', 'band')),
  band_event_id uuid UNIQUE,
  lat double precision, lng double precision, accuracy real,
  created_at timestamptz NOT NULL DEFAULT now(),
  safe_at timestamptz,
  notified_app int NOT NULL DEFAULT 0,
  notified_telegram int NOT NULL DEFAULT 0,
  sms_sent int NOT NULL DEFAULT 0,
  sms_failed int NOT NULL DEFAULT 0,
  sms_cost_uzs bigint NOT NULL DEFAULT 0,
  debt_added_uzs bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sos_events_user ON public.sos_events (user_id, created_at DESC);
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own SOS events" ON public.sos_events;
CREATE POLICY "Own SOS events" ON public.sos_events FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.sos_events TO authenticated;

-- Qarz sababi (eski yozuvlar — konsultatsiya)
ALTER TABLE public.emergency_credits ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'consultation';

-- SMS puli: balansdan, yetmagani ochiq qarzga qo'shiladi (yoki yangi qarz ochiladi). Faqat server.
CREATE OR REPLACE FUNCTION public.sos_charge(_user uuid, _cost bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal bigint; _pay bigint; _debt bigint; _cr uuid;
BEGIN
  IF _cost IS NULL OR _cost <= 0 THEN RETURN jsonb_build_object('paid', 0, 'debt', 0); END IF;
  SELECT balance_uzs INTO _bal FROM public.profiles WHERE user_id = _user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('paid', 0, 'debt', 0); END IF;
  _pay := LEAST(GREATEST(_bal, 0), _cost);
  _debt := _cost - _pay;
  IF _pay > 0 THEN UPDATE public.profiles SET balance_uzs = balance_uzs - _pay WHERE user_id = _user; END IF;
  IF _debt > 0 THEN
    SELECT id INTO _cr FROM public.emergency_credits WHERE user_id = _user AND status = 'open' FOR UPDATE;
    IF FOUND THEN
      UPDATE public.emergency_credits SET amount_uzs = amount_uzs + _debt WHERE id = _cr;
    ELSE
      INSERT INTO public.emergency_credits (user_id, consultation_id, amount_uzs, reason) VALUES (_user, NULL, _debt, 'sos_sms');
    END IF;
  END IF;
  RETURN jsonb_build_object('paid', _pay, 'debt', _debt);
END; $$;
REVOKE EXECUTE ON FUNCTION public.sos_charge(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_charge(uuid, bigint) TO service_role;

-- MaxBand SOS / yiqilish: Telegram va ilova xabarini device-api o'zi yuboradi; SMS uchun sos funksiyasini
-- darhol chaqiramiz (pg_net, kutmasdan). Faqat o'zi taqib yurgan bilaguzuk (oila a'zosiniki emas).
CREATE OR REPLACE FUNCTION public.band_event_sos_sms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind IN ('sos', 'fall') AND NEW.family_member_id IS NULL
     AND EXISTS (SELECT 1 FROM public.sos_contacts WHERE user_id = NEW.owner_id) THEN
    PERFORM public.call_edge_function('sos', jsonb_build_object('action', 'band', 'event_id', NEW.id));
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'band_event_sos_sms: %', SQLERRM;   -- SOS yozuvi hech qachon xato tufayli yo'qolmasin
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_band_event_sos_sms ON public.band_events;
CREATE TRIGGER trg_band_event_sos_sms AFTER INSERT ON public.band_events
  FOR EACH ROW EXECUTE FUNCTION public.band_event_sos_sms();

NOTIFY pgrst, 'reload schema';
