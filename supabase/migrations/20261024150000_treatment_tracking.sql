-- Davolanish kuzatuvi: retseptdan keyin 3-kuni va 7-kuni bemordan "Ahvolingiz qanday?" deb so'raladi.
-- Bemor bir bosishda javob beradi (Telegramdagi havola yoki saytdan), shifokor natijani ko'radi,
-- "yomonlashdi" bo'lsa shifokorga darhol xabar boradi.
--  * Javob havola orqali kirishsiz ham beriladi: har bir so'rovning o'z maxfiy tokeni bor, bir marta ishlaydi.
--  * Tokenli sahifa faqat shifokor ismi va sanani ko'rsatadi (tashxis ko'rsatilmaydi).
--  * Yozish faqat server funksiyalari orqali; foydalanuvchilar faqat o'qiydi (RLS).

CREATE TABLE IF NOT EXISTS public.treatment_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  seq int NOT NULL CHECK (seq BETWEEN 1 AND 5),
  due_at timestamptz NOT NULL,
  sent_at timestamptz,
  answered_at timestamptz,
  answer text CHECK (answer IN ('better', 'same', 'worse')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  doctor_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_id, seq)
);
CREATE INDEX IF NOT EXISTS treatment_checkins_due_idx ON public.treatment_checkins (due_at)
  WHERE sent_at IS NULL AND answered_at IS NULL;
CREATE INDEX IF NOT EXISTS treatment_checkins_patient_idx ON public.treatment_checkins (patient_id, due_at DESC);
CREATE INDEX IF NOT EXISTS treatment_checkins_doctor_idx ON public.treatment_checkins (doctor_id, due_at DESC);

ALTER TABLE public.treatment_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patient views own checkins" ON public.treatment_checkins;
CREATE POLICY "Patient views own checkins" ON public.treatment_checkins
  FOR SELECT TO authenticated USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Doctor views own checkins" ON public.treatment_checkins;
CREATE POLICY "Doctor views own checkins" ON public.treatment_checkins
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND d.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff views checkins" ON public.treatment_checkins;
CREATE POLICY "Staff views checkins" ON public.treatment_checkins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

GRANT SELECT ON public.treatment_checkins TO authenticated;
GRANT ALL ON public.treatment_checkins TO service_role;

-- Retsept yozilganda 3-kun va 7-kun uchun so'rov yaratiladi (Toshkent vaqti bilan soat 10:00).
CREATE OR REPLACE FUNCTION public.create_treatment_checkins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d int;
BEGIN
  IF NEW.patient_id IS NULL OR NEW.doctor_id IS NULL THEN RETURN NEW; END IF;
  FOR _d IN SELECT unnest(ARRAY[3, 7]) LOOP
    INSERT INTO public.treatment_checkins (prescription_id, patient_id, doctor_id, seq, due_at)
    VALUES (NEW.id, NEW.patient_id, NEW.doctor_id, CASE WHEN _d = 3 THEN 1 ELSE 2 END,
      (date_trunc('day', NEW.created_at AT TIME ZONE 'Asia/Tashkent') + make_interval(days => _d) + interval '10 hours')
        AT TIME ZONE 'Asia/Tashkent')
    ON CONFLICT (prescription_id, seq) DO NOTHING;
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_create_treatment_checkins ON public.prescriptions;
CREATE TRIGGER trg_create_treatment_checkins
  AFTER INSERT ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.create_treatment_checkins();

-- Javobni yozadi (ichki). Faqat javob berilmagan so'rovga; "yomonlashdi" bo'lsa shifokorga saytda xabar.
CREATE OR REPLACE FUNCTION public.record_checkin_answer(_id uuid, _answer text, _note text)
RETURNS public.treatment_checkins LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.treatment_checkins%ROWTYPE; _doc_user uuid; _diag text;
BEGIN
  IF _answer NOT IN ('better', 'same', 'worse') THEN RAISE EXCEPTION 'Javob noto''g''ri'; END IF;
  UPDATE public.treatment_checkins
     SET answer = _answer, answered_at = now(), note = NULLIF(btrim(left(COALESCE(_note, ''), 500)), '')
   WHERE id = _id AND answered_at IS NULL
   RETURNING * INTO _row;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF _answer = 'worse' THEN
    SELECT d.user_id INTO _doc_user FROM public.doctors d WHERE d.id = _row.doctor_id;
    SELECT rx.diagnosis INTO _diag FROM public.prescriptions rx WHERE rx.id = _row.prescription_id;
    IF _doc_user IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, data)
      VALUES (_doc_user, 'treatment_worse', 'Bemor ahvoli yomonlashdi',
              COALESCE(NULLIF(_diag, ''), 'Retsept') || COALESCE(' — ' || _row.note, ''),
              jsonb_build_object('prescription_id', _row.prescription_id, 'url', '/prescription/' || _row.prescription_id));
    END IF;
  END IF;
  RETURN _row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_checkin_answer(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkin_answer(uuid, text, text) TO service_role;

-- Bemor saytdan javob beradi (kirgan holda).
CREATE OR REPLACE FUNCTION public.answer_treatment_checkin(_id uuid, _answer text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.treatment_checkins%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treatment_checkins WHERE id = _id AND patient_id = auth.uid() AND due_at <= now()) THEN
    RAISE EXCEPTION 'So''rov topilmadi yoki hali vaqti kelmagan';
  END IF;
  _row := public.record_checkin_answer(_id, _answer, _note);
  RETURN jsonb_build_object('ok', _row.id IS NOT NULL, 'already', _row.id IS NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.answer_treatment_checkin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_treatment_checkin(uuid, text, text) TO authenticated;

-- Havola orqali (kirishsiz): sahifa uchun minimal ma'lumot.
CREATE OR REPLACE FUNCTION public.get_checkin_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'found', true, 'seq', c.seq, 'answered', c.answered_at IS NOT NULL, 'answer', c.answer,
      'doctor_name', rx.doctor_name, 'prescribed_at', rx.created_at,
      'days', GREATEST(1, round(extract(epoch FROM (c.due_at - rx.created_at)) / 86400)::int))
    FROM public.treatment_checkins c JOIN public.prescriptions rx ON rx.id = c.prescription_id
    WHERE c.token = _token AND char_length(_token) = 32 AND c.due_at <= now()
  ), jsonb_build_object('found', false));
$$;
REVOKE EXECUTE ON FUNCTION public.get_checkin_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkin_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.answer_checkin_by_token(_token text, _answer text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _row public.treatment_checkins%ROWTYPE;
BEGIN
  IF char_length(COALESCE(_token, '')) <> 32 THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT id INTO _id FROM public.treatment_checkins WHERE token = _token AND due_at <= now();
  IF _id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  _row := public.record_checkin_answer(_id, _answer, _note);
  RETURN jsonb_build_object('ok', _row.id IS NOT NULL, 'already', _row.id IS NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.answer_checkin_by_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.answer_checkin_by_token(text, text, text) TO anon, authenticated;

-- Cron uchun (faqat server): vaqti kelgan so'rovlarni oladi va yuborilgan deb belgilaydi.
CREATE OR REPLACE FUNCTION public.claim_due_checkins(_limit int DEFAULT 50)
RETURNS TABLE (id uuid, token text, seq int, patient_id uuid, doctor_name text, prescribed_at timestamptz,
               days int, telegram_chat_id bigint, telegram_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT c.id FROM public.treatment_checkins c
    WHERE c.sent_at IS NULL AND c.answered_at IS NULL AND c.due_at <= now() AND c.due_at > now() - interval '3 days'
    ORDER BY c.due_at LIMIT LEAST(GREATEST(_limit, 1), 200)
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.treatment_checkins c SET sent_at = now() FROM due WHERE c.id = due.id RETURNING c.*
  )
  SELECT upd.id, upd.token, upd.seq, upd.patient_id, rx.doctor_name, rx.created_at,
         GREATEST(1, round(extract(epoch FROM (upd.due_at - rx.created_at)) / 86400)::int),
         p.telegram_chat_id, COALESCE(p.telegram_notifications_enabled, true)
  FROM upd
  JOIN public.prescriptions rx ON rx.id = upd.prescription_id
  LEFT JOIN public.profiles p ON p.user_id = upd.patient_id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_due_checkins(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_checkins(int) TO service_role;

-- Cron uchun: "yomonlashdi" javoblari, shifokorga hali Telegram orqali aytilmagan.
CREATE OR REPLACE FUNCTION public.claim_worse_checkins()
RETURNS TABLE (id uuid, prescription_id uuid, doctor_user_id uuid, patient_name text, diagnosis text, note text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (
    UPDATE public.treatment_checkins c SET doctor_notified_at = now()
    WHERE c.answer = 'worse' AND c.doctor_notified_at IS NULL AND c.answered_at > now() - interval '2 days'
    RETURNING c.*
  )
  SELECT w.id, w.prescription_id, d.user_id, rx.patient_name, rx.diagnosis, w.note
  FROM w JOIN public.prescriptions rx ON rx.id = w.prescription_id
  LEFT JOIN public.doctors d ON d.id = w.doctor_id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_worse_checkins() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_worse_checkins() TO service_role;

-- Shifokor paneli: so'nggi natijalar + bemor shu retsept bo'yicha dori eslatmalariga qanday javob bergani (faqat sonlar).
CREATE OR REPLACE FUNCTION public.doctor_treatment_overview(_days int DEFAULT 30)
RETURNS TABLE (checkin_id uuid, prescription_id uuid, patient_name text, diagnosis text, seq int,
               due_at timestamptz, answered_at timestamptz, answer text, note text,
               doses_taken int, doses_skipped int, doses_missed int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.prescription_id, rx.patient_name, rx.diagnosis, c.seq, c.due_at, c.answered_at, c.answer, c.note,
    (SELECT count(*)::int FROM public.medication_reminders r JOIN public.medication_schedules s ON s.id = r.schedule_id
      WHERE s.prescription_id = c.prescription_id AND r.status = 'taken'),
    (SELECT count(*)::int FROM public.medication_reminders r JOIN public.medication_schedules s ON s.id = r.schedule_id
      WHERE s.prescription_id = c.prescription_id AND r.status = 'skipped'),
    (SELECT count(*)::int FROM public.medication_reminders r JOIN public.medication_schedules s ON s.id = r.schedule_id
      WHERE s.prescription_id = c.prescription_id AND r.status IN ('missed') )
  FROM public.treatment_checkins c
  JOIN public.prescriptions rx ON rx.id = c.prescription_id
  WHERE EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = c.doctor_id AND d.user_id = auth.uid())
    AND c.due_at <= now() AND c.due_at > now() - make_interval(days => LEAST(GREATEST(_days, 1), 365))
  ORDER BY (c.answer = 'worse') DESC NULLS LAST, c.answered_at DESC NULLS LAST, c.due_at DESC
  LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.doctor_treatment_overview(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_treatment_overview(int) TO authenticated;
