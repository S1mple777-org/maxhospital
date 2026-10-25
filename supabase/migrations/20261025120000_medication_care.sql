-- Dori eslatmasi budilnikdan aqlliroq:
--  1. Qayta eslatma: 10 daqiqada "Ichdim" bosilmasa, yana eslatadi (Telegram + sayt).
--  2. Oilaga xabar: 30 daqiqada ham javob bo'lmasa, qabul qilingan yaqinlarga (band_guardians) Telegram.
--     MaxBand ham shu xabarni yuboradi; ikki marta ketmasligi uchun band_notified_at ham belgilanadi.
--  3. Dori tugayotgani: qutidagi son, "Ichdim" da kamayadi, ~3 kunlik qolganda ogohlantirish.
--  4. Ichish statistikasi: foiz, ketma-ket kunlar, dori bo'yicha.
-- Yuborish dispatch-reminders orqali (pg_cron har daqiqada chaqiradi).

ALTER TABLE public.medication_reminders
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz,
  ADD COLUMN IF NOT EXISTS family_alerted_at timestamptz;

ALTER TABLE public.medication_schedules
  ADD COLUMN IF NOT EXISTS stock_count numeric(7, 1) CHECK (stock_count IS NULL OR stock_count >= 0),
  ADD COLUMN IF NOT EXISTS per_dose numeric(5, 1) NOT NULL DEFAULT 1 CHECK (per_dose > 0 AND per_dose <= 20),
  ADD COLUMN IF NOT EXISTS low_stock_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS medication_reminders_sent_open_idx
  ON public.medication_reminders (sent_at) WHERE status = 'sent' AND responded_at IS NULL;

-- ---------------------------------------------------------------------------
-- Dori zaxirasi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_medication_stock(_schedule_id uuid, _count numeric, _per_dose numeric DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  IF _count IS NOT NULL AND (_count < 0 OR _count > 100000) THEN RAISE EXCEPTION 'Dori soni noto''g''ri'; END IF;
  IF _per_dose IS NULL OR _per_dose <= 0 OR _per_dose > 20 THEN RAISE EXCEPTION 'Bir martalik miqdor 0 dan katta, 20 dan kichik bo''lsin'; END IF;
  UPDATE public.medication_schedules
     SET stock_count = _count, per_dose = _per_dose, low_stock_alerted_at = NULL, updated_at = now()
   WHERE id = _schedule_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Jadval topilmadi' USING ERRCODE = '42501'; END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_medication_stock(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_medication_stock(uuid, numeric, numeric) TO authenticated;

-- "Ichdim" -> qutidan kamayadi; "Ichdim" bekor qilinsa (boshqa holatga o'zgartirilsa) qaytadi.
CREATE OR REPLACE FUNCTION public.medication_stock_on_taken()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'taken' AND OLD.status IS DISTINCT FROM 'taken' THEN
    UPDATE public.medication_schedules SET stock_count = GREATEST(stock_count - per_dose, 0)
     WHERE id = NEW.schedule_id AND stock_count IS NOT NULL;
  ELSIF OLD.status = 'taken' AND NEW.status IS DISTINCT FROM 'taken' THEN
    UPDATE public.medication_schedules SET stock_count = stock_count + per_dose
     WHERE id = NEW.schedule_id AND stock_count IS NOT NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_medication_stock_on_taken ON public.medication_reminders;
CREATE TRIGGER trg_medication_stock_on_taken
  AFTER UPDATE OF status ON public.medication_reminders
  FOR EACH ROW EXECUTE FUNCTION public.medication_stock_on_taken();

-- Necha kunga yetadi (kuniga necha marta * bir martalik miqdor).
CREATE OR REPLACE FUNCTION public.medication_days_left(_stock numeric, _per_dose numeric, _times text[])
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _stock IS NULL OR COALESCE(cardinality(_times), 0) = 0 OR _per_dose <= 0 THEN NULL
              ELSE floor(_stock / _per_dose) / cardinality(_times) END;
$$;

-- Cron: ~3 kunlik qolganlar (bir marta; son yangilansa qayta).
CREATE OR REPLACE FUNCTION public.claim_low_stock_alerts()
RETURNS TABLE (schedule_id uuid, user_id uuid, medicine_name text, stock_count numeric, days_left numeric,
               telegram_chat_id bigint, telegram_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH low AS (
    UPDATE public.medication_schedules s SET low_stock_alerted_at = now()
    WHERE s.is_active AND s.stock_count IS NOT NULL AND s.low_stock_alerted_at IS NULL
      AND public.medication_days_left(s.stock_count, s.per_dose, s.times) <= 3
      AND (s.start_date + s.days) > (now() AT TIME ZONE 'Asia/Tashkent')::date + 1   -- kurs tugayotgan bo'lsa shart emas
    RETURNING s.*
  )
  SELECT low.id, low.user_id, low.medicine_name || COALESCE(' — ' || fm.full_name, ''), low.stock_count,
         public.medication_days_left(low.stock_count, low.per_dose, low.times),
         p.telegram_chat_id, COALESCE(p.telegram_notifications_enabled, true)
  FROM low
  LEFT JOIN public.family_members fm ON fm.id = low.family_member_id
  LEFT JOIN public.profiles p ON p.user_id = low.user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_low_stock_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_low_stock_alerts() TO service_role;

-- ---------------------------------------------------------------------------
-- Qayta eslatma (10 daqiqa) va oilaga xabar (30 daqiqa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_medication_nudges(_limit int DEFAULT 300)
RETURNS TABLE (reminder_id uuid, user_id uuid, scheduled_at timestamptz, timezone text, medicine_name text,
               dose text, instructions text, channels text[], telegram_chat_id bigint, telegram_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT r.id FROM public.medication_reminders r
    JOIN public.medication_schedules s ON s.id = r.schedule_id
    WHERE r.status = 'sent' AND r.responded_at IS NULL AND r.nudged_at IS NULL AND s.is_active
      AND r.sent_at <= now() - interval '10 minutes' AND r.sent_at > now() - interval '30 minutes'
    ORDER BY r.sent_at LIMIT LEAST(GREATEST(_limit, 1), 1000)
    FOR UPDATE OF r SKIP LOCKED
  ), upd AS (
    UPDATE public.medication_reminders r SET nudged_at = now() FROM due WHERE r.id = due.id
    RETURNING r.id, r.user_id, r.scheduled_at, r.schedule_id
  )
  SELECT upd.id, upd.user_id, upd.scheduled_at, s.timezone,
         s.medicine_name || COALESCE(' — ' || fm.full_name, ''), s.dose, s.instructions, s.channels,
         p.telegram_chat_id, COALESCE(p.telegram_notifications_enabled, true)
  FROM upd
  JOIN public.medication_schedules s ON s.id = upd.schedule_id
  LEFT JOIN public.family_members fm ON fm.id = s.family_member_id
  LEFT JOIN public.profiles p ON p.user_id = upd.user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_medication_nudges(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_medication_nudges(int) TO service_role;

-- 30 daqiqada javob yo'q: "o'tkazib yuborildi" deb belgilanadi va qabul qilingan yaqinlarga xabar.
-- Faqat o'zi ichadigan dorilar uchun (oila a'zosining dorisini akkaunt egasining o'zi kuzatadi).
CREATE OR REPLACE FUNCTION public.claim_missed_for_family(_limit int DEFAULT 300)
RETURNS TABLE (reminder_id uuid, patient_name text, medicine_name text, dose text, scheduled_at timestamptz,
               timezone text, guardian_ids uuid[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT r.id FROM public.medication_reminders r
    JOIN public.medication_schedules s ON s.id = r.schedule_id
    WHERE r.status = 'sent' AND r.responded_at IS NULL AND r.family_alerted_at IS NULL
      AND r.sent_at <= now() - interval '30 minutes' AND r.sent_at > now() - interval '6 hours'
    ORDER BY r.sent_at LIMIT LEAST(GREATEST(_limit, 1), 1000)
    FOR UPDATE OF r SKIP LOCKED
  ), upd AS (
    UPDATE public.medication_reminders r
       SET status = 'missed', family_alerted_at = now(),
           band_notified_at = COALESCE(r.band_notified_at, now())     -- MaxBand ikkinchi marta yubormasin
      FROM due WHERE r.id = due.id
    RETURNING r.id, r.user_id, r.scheduled_at, r.schedule_id, r.band_notified_at
  )
  SELECT upd.id, COALESCE(p.full_name, 'Yaqiningiz'), s.medicine_name, s.dose, upd.scheduled_at, s.timezone,
         ARRAY(SELECT g.guardian_id FROM public.band_guardians g
               WHERE g.wearer_id = upd.user_id AND g.status = 'accepted')
  FROM upd
  JOIN public.medication_schedules s ON s.id = upd.schedule_id
  LEFT JOIN public.profiles p ON p.user_id = upd.user_id
  WHERE s.family_member_id IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_missed_for_family(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_missed_for_family(int) TO service_role;

-- ---------------------------------------------------------------------------
-- Ichish statistikasi (Toshkent kunlari bo'yicha)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.medication_adherence(_days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _d int := LEAST(GREATEST(COALESCE(_days, 7), 1), 90);
  _from timestamptz; _res jsonb; _streak int := 0; _day date; _today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  _due int; _taken int;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  _from := ((_today - (_d - 1))::timestamp) AT TIME ZONE 'Asia/Tashkent';

  -- Hisobga olinadi: vaqti o'tgan eslatmalar (hali 30 daqiqa ichida "kutilayotgan"lar emas)
  WITH r AS (
    SELECT r.status, s.medicine_name, s.family_member_id, (r.scheduled_at AT TIME ZONE 'Asia/Tashkent')::date AS day
    FROM public.medication_reminders r JOIN public.medication_schedules s ON s.id = r.schedule_id
    WHERE r.user_id = _uid AND r.scheduled_at >= _from AND r.scheduled_at <= now()
      AND NOT (r.status IN ('pending', 'sent') AND r.scheduled_at > now() - interval '30 minutes')
  )
  SELECT jsonb_build_object(
    'days', _d,
    'total', count(*),
    'taken', count(*) FILTER (WHERE status = 'taken'),
    'skipped', count(*) FILTER (WHERE status = 'skipped'),
    'missed', count(*) FILTER (WHERE status NOT IN ('taken', 'skipped')),
    'percent', CASE WHEN count(*) = 0 THEN NULL ELSE round(100.0 * count(*) FILTER (WHERE status = 'taken') / count(*)) END,
    'by_medicine', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', m.medicine_name, 'taken', m.taken, 'total', m.total,
               'percent', round(100.0 * m.taken / m.total)) ORDER BY m.taken::numeric / m.total, m.medicine_name)
      FROM (SELECT medicine_name, count(*) FILTER (WHERE status = 'taken') AS taken, count(*) AS total
            FROM r GROUP BY medicine_name) m), '[]'::jsonb),
    'by_day', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d.day, 'taken', d.taken, 'total', d.total) ORDER BY d.day)
      FROM (SELECT day, count(*) FILTER (WHERE status = 'taken') AS taken, count(*) AS total FROM r GROUP BY day) d), '[]'::jsonb)
  ) INTO _res FROM r;

  -- Ketma-ket kunlar: bugundan (bugun hali yakunlanmagan bo'lsa kechadan) orqaga, barcha dorilar ichilgan kunlar.
  _day := _today;
  FOR i IN 0..89 LOOP
    SELECT count(*), count(*) FILTER (WHERE r.status = 'taken') INTO _due, _taken
    FROM public.medication_reminders r
    WHERE r.user_id = _uid AND (r.scheduled_at AT TIME ZONE 'Asia/Tashkent')::date = _day AND r.scheduled_at <= now()
      AND NOT (r.status IN ('pending', 'sent') AND r.scheduled_at > now() - interval '30 minutes');
    IF _due = 0 THEN
      EXIT WHEN _day < _today;          -- dori yo'q kun: zanjir tugaydi (bugun bo'lsa — kechadan davom)
    ELSIF _taken < _due THEN
      EXIT;
    ELSE
      _streak := _streak + 1;
    END IF;
    _day := _day - 1;
  END LOOP;

  RETURN _res || jsonb_build_object('streak', _streak);
END; $$;
REVOKE EXECUTE ON FUNCTION public.medication_adherence(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.medication_adherence(int) TO authenticated;
