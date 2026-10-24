-- 1) Vaqtga yozilish (bron): bemor shifokorning ish vaqtidan 30 daqiqalik bo'sh vaqtni tanlaydi.
--    Bron oddiy konsultatsiya: create_consultation() orqali yaratiladi (narx, tarif, navbat imtiyozi o'sha-o'sha),
--    faqat scheduled_at qo'yiladi. Vaqtiga 15 daqiqa qolganda shifokor navbatining boshiga chiqadi.
--    Bemor qabulga 2 soatdan ko'p qolganda bekor qila oladi (pul qaytadi). Shifokor rad etsa ham pul qaytadi.
-- 2) Navbat holati: bemor nechanchi o'rinda ekani va taxminiy kutish vaqti (queue_status).
--    Shifokor qabul qilganda bemorga saytda xabar chiqadi (trigger), Telegram xabarini notify-consultation yuboradi.
-- 3) Bron eslatmasi: qabulga 1 soat qolganda (dispatch-checkins cron'i, claim_booking_reminders).

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Bitta shifokorning bitta vaqtiga faqat bitta faol bron.
CREATE UNIQUE INDEX IF NOT EXISTS consultations_doctor_slot_uniq
  ON public.consultations (doctor_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS consultations_scheduled_idx
  ON public.consultations (scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'pending';

-- Mijoz o'zgartira olmaydigan ustunlarga scheduled_at va reminder_sent_at qo'shildi.
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
     OR NEW.followup_until IS DISTINCT FROM OLD.followup_until
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at THEN
    RAISE EXCEPTION 'Bu maydonlarni o''zgartirish mumkin emas' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Rad etish uchun reject_consultation() dan foydalaning' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Tugatish uchun end_consultation() dan foydalaning' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.weekday_key(_d date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[extract(isodow FROM _d)::int];
$$;

-- Shifokorning keyingi kunlardagi 30 daqiqalik vaqtlari (Toshkent vaqti), band yoki bo'shligi bilan.
CREATE OR REPLACE FUNCTION public.get_doctor_slots(_doctor_id uuid, _days int DEFAULT 7)
RETURNS TABLE (slot_at timestamptz, taken boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.slot_at,
         EXISTS (SELECT 1 FROM public.consultations c
                 WHERE c.doctor_id = _doctor_id AND c.scheduled_at = s.slot_at AND c.status IN ('pending', 'active'))
  FROM public.doctors doc
  CROSS JOIN LATERAL generate_series(0, LEAST(GREATEST(COALESCE(_days, 7), 1), 14) - 1) AS g(n)
  CROSS JOIN LATERAL (SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date + g.n) AS day) dd
  CROSS JOIN LATERAL (SELECT doc.work_hours -> public.weekday_key(dd.day) AS wh) w
  CROSS JOIN LATERAL (SELECT
      CASE WHEN jsonb_typeof(w.wh) = 'object' AND (w.wh ->> 'on') = 'true'
                AND (w.wh ->> 'from') ~ '^[0-2][0-9]:[0-5][0-9]$' THEN (w.wh ->> 'from')::time END AS t_from,
      CASE WHEN jsonb_typeof(w.wh) = 'object' AND (w.wh ->> 'on') = 'true'
                AND (w.wh ->> 'to') ~ '^[0-2][0-9]:[0-5][0-9]$' THEN (w.wh ->> 'to')::time END AS t_to) tt
  CROSS JOIN LATERAL generate_series(dd.day + tt.t_from, dd.day + tt.t_to - interval '30 minutes', interval '30 minutes') AS t(local_ts)
  CROSS JOIN LATERAL (SELECT (t.local_ts AT TIME ZONE 'Asia/Tashkent') AS slot_at) s
  WHERE doc.id = _doctor_id
    AND s.slot_at >= now() + interval '30 minutes'
  ORDER BY s.slot_at;
$$;
REVOKE EXECUTE ON FUNCTION public.get_doctor_slots(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_slots(uuid, int) TO anon, authenticated;

-- Bron: vaqtni tekshiradi, keyin oddiy konsultatsiya kabi to'lov oladi.
CREATE OR REPLACE FUNCTION public.book_consultation(_doctor_id uuid, _slot timestamptz, _family_member_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _doc_user uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Tizimga kiring' USING ERRCODE = '42501'; END IF;
  -- Bir shifokorga bir vaqtda faqat bitta bron jarayoni (ikki kishi bir vaqtni ololmaydi).
  PERFORM pg_advisory_xact_lock(hashtext('book:' || _doctor_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.get_doctor_slots(_doctor_id, 14) s WHERE s.slot_at = _slot AND NOT s.taken) THEN
    RAISE EXCEPTION 'Bu vaqt band yoki shifokor bu vaqtda ishlamaydi. Boshqa vaqtni tanlang';
  END IF;
  IF EXISTS (SELECT 1 FROM public.consultations
             WHERE patient_id = _uid AND scheduled_at = _slot AND status IN ('pending', 'active')) THEN
    RAISE EXCEPTION 'Sizda shu vaqtga boshqa yozuv bor';
  END IF;
  IF (SELECT count(*) FROM public.consultations
      WHERE patient_id = _uid AND status = 'pending' AND scheduled_at > now()) >= 3 THEN
    RAISE EXCEPTION 'Bir vaqtda 3 tadan ortiq oldindan yozuv bo''lmaydi';
  END IF;

  _id := public.create_consultation(_doctor_id, false, _family_member_id);
  UPDATE public.consultations SET scheduled_at = _slot WHERE id = _id;

  SELECT user_id INTO _doc_user FROM public.doctors WHERE id = _doctor_id;
  IF _doc_user IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, kind, title, body, data)
    VALUES (_doc_user, 'booking_new', 'Yangi yozuv',
            'Bemor ' || to_char(_slot AT TIME ZONE 'Asia/Tashkent', 'DD.MM HH24:MI') || ' ga yozildi',
            jsonb_build_object('url', '/doctor-dashboard', 'consultation_id', _id));
  END IF;
  RETURN _id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.book_consultation(uuid, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_consultation(uuid, timestamptz, uuid) TO authenticated;

-- Bemor bronni bekor qiladi (qabulga 2 soatdan ko'p qolganda). Pul va navbat to'lovi qaytadi.
CREATE OR REPLACE FUNCTION public.cancel_booking(_consultation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.consultations%ROWTYPE; _cr public.emergency_credits%ROWTYPE; _refund bigint; _fees bigint; _doc_user uuid;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF NOT FOUND OR _c.patient_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Yozuv topilmadi' USING ERRCODE = '42501';
  END IF;
  IF _c.status <> 'pending' OR _c.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Faqat kutilayotgan oldindan yozuvni bekor qilish mumkin';
  END IF;
  IF _c.scheduled_at < now() + interval '2 hours' THEN
    RAISE EXCEPTION 'Qabulga 2 soatdan kam qoldi, endi bekor qilib bo''lmaydi. Shifokorga yozing';
  END IF;

  UPDATE public.consultations SET status = 'cancelled', ended_at = now() WHERE id = _consultation_id;

  _refund := _c.price_uzs;
  SELECT * INTO _cr FROM public.emergency_credits WHERE consultation_id = _consultation_id AND status = 'open' FOR UPDATE;
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

  SELECT user_id INTO _doc_user FROM public.doctors WHERE id = _c.doctor_id;
  IF _doc_user IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, kind, title, body, data)
    VALUES (_doc_user, 'booking_cancelled', 'Yozuv bekor qilindi',
            to_char(_c.scheduled_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM HH24:MI') || ' dagi yozuvni bemor bekor qildi',
            jsonb_build_object('url', '/doctor-dashboard'));
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

-- Navbat holati: shifokor panelidagi tartib bilan bir xil (supabase/functions/_shared/queue.ts):
--   vaqti kelgan bronlar -> "birinchi navbat" -> qolganlar (Pro/Premium bir necha o'rin oldinga).
CREATE OR REPLACE FUNCTION public.queue_status(_consultation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.consultations%ROWTYPE; _pos int; _busy int; _avg numeric; _online boolean;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id;
  IF NOT FOUND OR (_c.patient_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _c.doctor_id AND d.user_id = auth.uid())) THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF _c.status <> 'pending' THEN RETURN jsonb_build_object('found', true, 'status', _c.status); END IF;

  SELECT is_online INTO _online FROM public.doctors WHERE id = _c.doctor_id;

  IF _c.scheduled_at IS NOT NULL AND _c.scheduled_at > now() + interval '15 minutes' THEN
    RETURN jsonb_build_object('found', true, 'status', 'pending', 'booked', true,
      'scheduled_at', _c.scheduled_at, 'doctor_online', COALESCE(_online, false));
  END IF;

  WITH q AS (
    SELECT c.id, c.created_at, COALESCE(c.queue_first, false) AS first, GREATEST(COALESCE(c.queue_boost, 0), 0) AS boost, c.scheduled_at,
           CASE WHEN c.scheduled_at IS NOT NULL THEN 0 WHEN COALESCE(c.queue_first, false) THEN 1 ELSE 2 END AS g
    FROM public.consultations c
    WHERE c.doctor_id = _c.doctor_id AND c.status = 'pending'
      AND (c.scheduled_at IS NULL OR c.scheduled_at <= now() + interval '15 minutes')
  ), rest AS (
    SELECT id, (row_number() OVER (ORDER BY created_at, id) - 1)::numeric AS idx FROM q WHERE g = 2
  ), keyed AS (
    SELECT q.id, q.g, q.created_at,
      CASE WHEN q.g = 0 THEN extract(epoch FROM q.scheduled_at)
           WHEN q.g = 1 THEN extract(epoch FROM q.created_at)
           WHEN q.boost > 0 THEN GREATEST(r.idx - q.boost, 0) - 0.5
           ELSE r.idx END AS k,
      COALESCE(r.idx, 0) AS idx
    FROM q LEFT JOIN rest r ON r.id = q.id
  ), ordered AS (
    SELECT id, row_number() OVER (ORDER BY g, k, idx, created_at, id) AS pos FROM keyed
  )
  SELECT pos INTO _pos FROM ordered WHERE id = _c.id;

  -- Shifokor hozir kimnidir qabul qilyaptimi (so'nggi 1 soatda boshlangan faol konsultatsiya)
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.consultations
    WHERE doctor_id = _c.doctor_id AND status = 'active' AND started_at > now() - interval '1 hour') THEN 1 ELSE 0 END INTO _busy;

  -- O'rtacha qabul vaqti: so'nggi 20 ta tugagan konsultatsiya, 5..30 daqiqa oralig'ida
  SELECT avg(LEAST(GREATEST(extract(epoch FROM (ended_at - started_at)) / 60, 5), 30)) INTO _avg
  FROM (SELECT started_at, ended_at FROM public.consultations
        WHERE doctor_id = _c.doctor_id AND status = 'completed' AND started_at IS NOT NULL AND ended_at > started_at
        ORDER BY ended_at DESC LIMIT 20) x;
  _avg := COALESCE(_avg, 10);

  RETURN jsonb_build_object('found', true, 'status', 'pending', 'booked', _c.scheduled_at IS NOT NULL,
    'scheduled_at', _c.scheduled_at, 'position', COALESCE(_pos, 1), 'ahead', GREATEST(COALESCE(_pos, 1) - 1, 0),
    'busy', _busy = 1, 'avg_minutes', round(_avg),
    'estimate_minutes', round((GREATEST(COALESCE(_pos, 1) - 1, 0) + _busy) * _avg),
    'doctor_online', COALESCE(_online, false));
END; $$;
REVOKE EXECUTE ON FUNCTION public.queue_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_status(uuid) TO authenticated;

-- Shifokor qabul qilganda bemorga saytda darhol xabar.
CREATE OR REPLACE FUNCTION public.notify_consultation_started()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'active' THEN
    INSERT INTO public.user_notifications (user_id, kind, title, body, data)
    VALUES (NEW.patient_id, 'consultation_started', 'Shifokor sizni kutmoqda',
            'Konsultatsiya boshlandi. Sahifani oching.',
            jsonb_build_object('url', '/consultation/' || NEW.id, 'consultation_id', NEW.id));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_consultation_started ON public.consultations;
CREATE TRIGGER trg_notify_consultation_started
  AFTER UPDATE OF status ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.notify_consultation_started();

-- Cron uchun: 1 soat ichida boshlanadigan bronlar (eslatma bir marta).
CREATE OR REPLACE FUNCTION public.claim_booking_reminders(_limit int DEFAULT 100)
RETURNS TABLE (consultation_id uuid, scheduled_at timestamptz, patient_id uuid, doctor_user_id uuid,
               patient_name text, doctor_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT c.id FROM public.consultations c
    WHERE c.status = 'pending' AND c.reminder_sent_at IS NULL AND c.scheduled_at IS NOT NULL
      AND c.scheduled_at BETWEEN now() AND now() + interval '60 minutes'
    ORDER BY c.scheduled_at LIMIT LEAST(GREATEST(_limit, 1), 300)
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.consultations c SET reminder_sent_at = now() FROM due WHERE c.id = due.id RETURNING c.*
  )
  SELECT upd.id, upd.scheduled_at, upd.patient_id, d.user_id,
         COALESCE(fm.full_name, pp.full_name, 'Bemor'), COALESCE(dp.full_name, 'Shifokor')
  FROM upd
  LEFT JOIN public.doctors d ON d.id = upd.doctor_id
  LEFT JOIN public.profiles dp ON dp.user_id = d.user_id
  LEFT JOIN public.profiles pp ON pp.user_id = upd.patient_id
  LEFT JOIN public.family_members fm ON fm.id = upd.family_member_id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_booking_reminders(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_reminders(int) TO service_role;
