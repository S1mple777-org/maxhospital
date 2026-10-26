-- Fitness reja: bemor anketasi -> kod tuzgan 4 haftalik reja (supabase/functions/_shared/fitness.ts).
-- Xavf belgisi bo'lsa reja shifokor tasdig'idan keyin boshlanadi (PAR-Q+ tamoyili).
-- Har mashqdan keyin his-tuyg'u (RPE 1–10) va og'riq yoziladi; yuklama koeffitsienti shunga qarab o'zgaradi.
-- Qayta ishga tushirish xavfsiz.

CREATE TABLE IF NOT EXISTS public.fitness_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending_doctor', 'active', 'rejected', 'archived')),
  risk_reasons text[] NOT NULL DEFAULT '{}',
  questionnaire jsonb NOT NULL,
  plan jsonb NOT NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_note text,
  reviewed_at timestamptz,
  start_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Tashkent')::date,
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_time time NOT NULL DEFAULT '08:00',
  adapt_factor numeric NOT NULL DEFAULT 1 CHECK (adapt_factor BETWEEN 0.5 AND 1.5),
  adapted_week int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fitness_plans_one_open ON public.fitness_plans (user_id)
  WHERE status IN ('pending_doctor', 'active');
CREATE INDEX IF NOT EXISTS fitness_plans_doctor ON public.fitness_plans (doctor_id, status);

CREATE TABLE IF NOT EXISTS public.fitness_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.fitness_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  week int NOT NULL,
  rpe int NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  pain boolean NOT NULL DEFAULT false,
  note text CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day)
);

-- Bir kunda bitta eslatma
CREATE TABLE IF NOT EXISTS public.fitness_reminder_log (
  plan_id uuid NOT NULL REFERENCES public.fitness_plans(id) ON DELETE CASCADE,
  day date NOT NULL,
  PRIMARY KEY (plan_id, day)
);

-- Telegram navbati (shifokorga: tasdiqlash/og'riq; bemorga: javob). Cron yuboradi.
CREATE TABLE IF NOT EXISTS public.fitness_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.fitness_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  html text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fitness_alerts_unsent ON public.fitness_alerts (created_at) WHERE sent_at IS NULL;

ALTER TABLE public.fitness_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitness_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitness_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitness_alerts ENABLE ROW LEVEL SECURITY;

-- O'qish: bemor o'zinikini, shifokor o'ziga biriktirilganini. Yozish faqat RPC orqali.
DROP POLICY IF EXISTS "Own fitness plans" ON public.fitness_plans;
CREATE POLICY "Own fitness plans" ON public.fitness_plans FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS "Own fitness sessions" ON public.fitness_sessions;
CREATE POLICY "Own fitness sessions" ON public.fitness_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.fitness_plans fp JOIN public.doctors d ON d.id = fp.doctor_id
                    WHERE fp.id = plan_id AND d.user_id = auth.uid()));
GRANT SELECT ON public.fitness_plans, public.fitness_sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- Xavf sabablari serverda qayta hisoblanadi (anketadagi "ha" javoblar va og'ir holatlar)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fitness_risk_reasons(_q jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY(SELECT DISTINCT r FROM (
    SELECT CASE f
      WHEN 'chest_pain' THEN 'Ko''krakda og''riq'
      WHEN 'dizzy_faint' THEN 'Bosh aylanishi / hushdan ketish'
      WHEN 'heart_told' THEN 'Yurak kasalligi'
      WHEN 'recent_surgery' THEN 'So''nggi 3 oyda operatsiya'
      WHEN 'pregnant' THEN 'Homiladorlik'
      WHEN 'very_high_bp' THEN 'Qon bosimi 180/110 dan yuqori'
      WHEN 'hypo_often' THEN 'Qand tez-tez tushib ketadi'
      WHEN 'doctor_limit' THEN 'Shifokor faollikni cheklagan'
      ELSE 'Boshqa xavf belgisi' END AS r
    FROM jsonb_array_elements_text(COALESCE(_q->'red_flags', '[]')) f
    UNION ALL SELECT 'Yurak kasalligi' WHERE COALESCE(_q->'conditions', '[]') ? 'heart'
    UNION ALL SELECT 'Homiladorlik' WHERE COALESCE(_q->'conditions', '[]') ? 'pregnancy'
    UNION ALL SELECT '70+ yosh va hozir harakat qilinmaydi'
      WHERE COALESCE((_q->>'age')::numeric, 0) >= 70 AND _q->>'level' = 'none'
    UNION ALL SELECT 'Tana massasi indeksi juda yuqori'
      WHERE COALESCE((_q->>'height_cm')::numeric, 0) >= 100
        AND (_q->>'weight_kg')::numeric / ((_q->>'height_cm')::numeric / 100) ^ 2 >= 40
  ) x ORDER BY r);
$$;

CREATE OR REPLACE FUNCTION public.fitness_patient_name(_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(trim(full_name), ''), 'Bemor') FROM public.profiles WHERE user_id = _user
  UNION ALL SELECT 'Bemor' LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fitness_patient_name(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fitness_esc(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT replace(replace(replace(_t, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- Shifokorga xabar (sayt + Telegram navbati)
CREATE OR REPLACE FUNCTION public.fitness_notify(_user uuid, _plan uuid, _title text, _body text, _url text, _html text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.user_notifications (user_id, kind, title, body, data)
    VALUES (_user, 'fitness', _title, _body, jsonb_build_object('url', _url, 'plan_id', _plan));
  INSERT INTO public.fitness_alerts (plan_id, user_id, html) VALUES (_plan, _user, _html);
$$;
REVOKE EXECUTE ON FUNCTION public.fitness_notify(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rejani saqlash
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_fitness_plan(
  _questionnaire jsonb, _plan jsonb, _doctor_id uuid DEFAULT NULL,
  _start_date date DEFAULT NULL, _reminder_time time DEFAULT '08:00')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _risk text[];
  _status text;
  _doc_user uuid;
  _id uuid;
  _today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  _start date := GREATEST(COALESCE(_start_date, _today), _today);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring'; END IF;
  IF jsonb_typeof(_questionnaire) <> 'object' OR jsonb_typeof(_plan->'weeks') <> 'array'
     OR octet_length(_plan::text) > 200000 THEN
    RAISE EXCEPTION 'Reja noto''g''ri';
  END IF;
  IF _start > _today + 30 THEN RAISE EXCEPTION 'Boshlanish sanasi juda uzoq'; END IF;

  _risk := public.fitness_risk_reasons(_questionnaire);
  IF cardinality(_risk) > 0 THEN
    IF _doctor_id IS NULL THEN
      RAISE EXCEPTION 'Bu reja uchun shifokor tasdig''i kerak — shifokorni tanlang';
    END IF;
    -- Faqat bemor bilan konsultatsiya o'tkazgan shifokor
    SELECT d.user_id INTO _doc_user FROM public.doctors d
     WHERE d.id = _doctor_id AND EXISTS (
       SELECT 1 FROM public.consultations c WHERE c.doctor_id = d.id AND c.patient_id = _uid
         AND c.status IN ('completed', 'active'));
    IF _doc_user IS NULL THEN
      RAISE EXCEPTION 'Faqat siz bilan konsultatsiya o''tkazgan shifokorni tanlash mumkin';
    END IF;
    _status := 'pending_doctor';
  ELSE
    _status := 'active';
    -- Xavfsiz rejada ham shifokorni ixtiyoriy biriktirish mumkin (u ko'rib boradi)
    IF _doctor_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.consultations c WHERE c.doctor_id = _doctor_id AND c.patient_id = _uid
           AND c.status IN ('completed', 'active')) THEN
      _doctor_id := NULL;
    END IF;
  END IF;

  UPDATE public.fitness_plans SET status = 'archived', updated_at = now()
   WHERE user_id = _uid AND status IN ('pending_doctor', 'active');

  INSERT INTO public.fitness_plans (user_id, status, risk_reasons, questionnaire, plan, doctor_id, start_date, reminder_time)
  VALUES (_uid, _status, _risk, _questionnaire, _plan, _doctor_id, _start, COALESCE(_reminder_time, '08:00'))
  RETURNING id INTO _id;

  IF _status = 'pending_doctor' THEN
    PERFORM public.fitness_notify(_doc_user, _id, 'Fitness rejani tasdiqlang',
      public.fitness_patient_name(_uid) || ': ' || array_to_string(_risk, ', '),
      '/doctor-dashboard',
      '🏃 <b>Fitness rejani tasdiqlang</b>' || E'\n\n' || '👤 ' || public.fitness_esc(public.fitness_patient_name(_uid))
        || E'\n' || 'Sabab: ' || public.fitness_esc(array_to_string(_risk, ', ')));
  END IF;
  RETURN jsonb_build_object('id', _id, 'status', _status, 'risk_reasons', to_jsonb(_risk));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_fitness_plan(jsonb, jsonb, uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fitness_plan(jsonb, jsonb, uuid, date, time) TO authenticated;

-- Shifokor: tasdiqlash yoki rad etish
CREATE OR REPLACE FUNCTION public.review_fitness_plan(_plan_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.fitness_plans;
  _today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  _n text := NULLIF(left(trim(COALESCE(_note, '')), 1000), '');
BEGIN
  SELECT fp.* INTO _p FROM public.fitness_plans fp JOIN public.doctors d ON d.id = fp.doctor_id
   WHERE fp.id = _plan_id AND d.user_id = auth.uid() FOR UPDATE OF fp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  IF _p.status <> 'pending_doctor' THEN RAISE EXCEPTION 'Reja allaqachon ko''rib chiqilgan'; END IF;
  IF NOT _approve AND _n IS NULL THEN RAISE EXCEPTION 'Rad etish sababini yozing'; END IF;

  UPDATE public.fitness_plans SET
    status = CASE WHEN _approve THEN 'active' ELSE 'rejected' END,
    doctor_note = _n, reviewed_at = now(), updated_at = now(),
    start_date = GREATEST(start_date, _today)
  WHERE id = _plan_id;

  PERFORM public.fitness_notify(_p.user_id, _plan_id,
    CASE WHEN _approve THEN 'Fitness reja tasdiqlandi ✅' ELSE 'Fitness reja tasdiqlanmadi' END,
    COALESCE(_n, CASE WHEN _approve THEN 'Shifokor rejangizni tasdiqladi. Boshlashingiz mumkin.' ELSE '' END),
    '/fitness',
    CASE WHEN _approve THEN '✅ <b>Fitness rejangiz tasdiqlandi</b>' ELSE '❌ <b>Fitness reja tasdiqlanmadi</b>' END
      || COALESCE(E'\n\nShifokor izohi: ' || public.fitness_esc(_n), ''));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_fitness_plan(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_fitness_plan(uuid, boolean, text) TO authenticated;

-- Shifokor kabineti: tasdiq kutayotgan va kuzatuvdagi rejalar
CREATE OR REPLACE FUNCTION public.list_fitness_for_doctor()
RETURNS TABLE (plan_id uuid, status text, patient_id uuid, patient_name text, risk_reasons text[],
               questionnaire jsonb, created_at timestamptz, sessions bigint, last_pain boolean, avg_rpe numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fp.id, fp.status, fp.user_id, public.fitness_patient_name(fp.user_id), fp.risk_reasons,
         fp.questionnaire, fp.created_at,
         (SELECT count(*) FROM public.fitness_sessions s WHERE s.plan_id = fp.id),
         (SELECT s.pain FROM public.fitness_sessions s WHERE s.plan_id = fp.id ORDER BY s.day DESC LIMIT 1),
         (SELECT round(avg(s.rpe), 1) FROM public.fitness_sessions s WHERE s.plan_id = fp.id)
  FROM public.fitness_plans fp
  JOIN public.doctors d ON d.id = fp.doctor_id
  WHERE d.user_id = auth.uid() AND fp.status IN ('pending_doctor', 'active')
  ORDER BY (fp.status = 'pending_doctor') DESC, fp.created_at DESC
  LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.list_fitness_for_doctor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_fitness_for_doctor() TO authenticated;

-- Eslatma sozlamasi
CREATE OR REPLACE FUNCTION public.set_fitness_reminder(_plan_id uuid, _enabled boolean, _time time)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fitness_plans SET reminder_enabled = _enabled, reminder_time = COALESCE(_time, reminder_time), updated_at = now()
   WHERE id = _plan_id AND user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.set_fitness_reminder(uuid, boolean, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_fitness_reminder(uuid, boolean, time) TO authenticated;

-- Bemor rejani to'xtatadi
CREATE OR REPLACE FUNCTION public.archive_fitness_plan(_plan_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fitness_plans SET status = 'archived', updated_at = now()
   WHERE id = _plan_id AND user_id = auth.uid() AND status IN ('pending_doctor', 'active', 'rejected');
$$;
REVOKE EXECUTE ON FUNCTION public.archive_fitness_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_fitness_plan(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mashqni yozish + moslashuv (adaptFactor() bilan bir xil qoidalar)
--   og'riq      -> darhol ×0.85 va shifokorga xabar
--   hafta oxiri: o'rtacha RPE ≥ 8 -> ×0.9; ≤ 4 va hammasi bajarilgan -> ×1.1
--   0.5..1.5 oralig'ida; shifokor tasdiqlagan (xavfli) rejada 1.0 dan oshmaydi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_fitness_session(_plan_id uuid, _day date, _rpe int, _pain boolean DEFAULT false, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.fitness_plans;
  _today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  _week int;
  _f numeric;
  _cap numeric;
  _planned int;
  _done int;
  _avg numeric;
  _changed text := NULL;
  _doc_user uuid;
BEGIN
  SELECT * INTO _p FROM public.fitness_plans WHERE id = _plan_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reja topilmadi'; END IF;
  IF _p.status <> 'active' THEN RAISE EXCEPTION 'Reja faol emas'; END IF;
  IF _day IS NULL OR _day > _today OR _day < _today - 7 OR _day < _p.start_date THEN
    RAISE EXCEPTION 'Sana noto''g''ri';
  END IF;
  IF _rpe IS NULL OR _rpe NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Qiyinlik 1 dan 10 gacha'; END IF;

  _week := (_day - _p.start_date) / 7 + 1;
  INSERT INTO public.fitness_sessions (plan_id, user_id, day, week, rpe, pain, note)
  VALUES (_plan_id, _p.user_id, _day, _week, _rpe, COALESCE(_pain, false), NULLIF(left(trim(COALESCE(_note, '')), 500), ''))
  ON CONFLICT (plan_id, day) DO UPDATE SET rpe = EXCLUDED.rpe, pain = EXCLUDED.pain, note = EXCLUDED.note;

  _f := _p.adapt_factor;
  _cap := CASE WHEN cardinality(_p.risk_reasons) > 0 THEN 1.0 ELSE 1.5 END;

  IF COALESCE(_pain, false) THEN
    _f := _f * 0.85;
    _changed := 'pain';
    SELECT d.user_id INTO _doc_user FROM public.doctors d WHERE d.id = _p.doctor_id;
    IF _doc_user IS NOT NULL THEN
      PERFORM public.fitness_notify(_doc_user, _plan_id, 'Bemor mashqda og''riq sezdi',
        public.fitness_patient_name(_p.user_id) || COALESCE(': ' || NULLIF(trim(_note), ''), ''),
        '/doctor-dashboard',
        '⚠️ <b>Mashqda og''riq</b>' || E'\n\n' || '👤 ' || public.fitness_esc(public.fitness_patient_name(_p.user_id))
          || COALESCE(E'\nIzoh: ' || public.fitness_esc(NULLIF(trim(_note), '')), ''));
    END IF;
  ELSIF _week > _p.adapted_week THEN
    -- O'tgan haftaning yakuni (bir marta)
    _planned := jsonb_array_length(COALESCE(_p.plan->'days', '[]'));
    SELECT count(*), avg(rpe) INTO _done, _avg FROM public.fitness_sessions
     WHERE plan_id = _plan_id AND week = _week - 1;
    IF _avg IS NOT NULL AND _avg >= 8 THEN _f := _f * 0.9; _changed := 'hard';
    ELSIF _avg IS NOT NULL AND _avg <= 4 AND _done >= _planned AND _planned > 0 THEN _f := _f * 1.1; _changed := 'easy';
    END IF;
  END IF;

  _f := round(LEAST(_cap, GREATEST(0.5, _f)), 2);

  UPDATE public.fitness_plans SET adapt_factor = _f, adapted_week = GREATEST(adapted_week, _week), updated_at = now()
   WHERE id = _plan_id;
  RETURN jsonb_build_object('adapt_factor', _f, 'previous', _p.adapt_factor, 'reason', _changed, 'week', _week);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_fitness_session(uuid, date, int, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_fitness_session(uuid, date, int, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cron (dispatch-reminders): bugungi mashq eslatmasi va Telegram navbati
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_fitness_reminders(_limit int DEFAULT 300)
RETURNS TABLE (plan_id uuid, user_id uuid, label text, week int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH now_t AS (
    SELECT (now() AT TIME ZONE 'Asia/Tashkent') AS ts, (now() AT TIME ZONE 'Asia/Tashkent')::date AS d
  ), due AS (
    SELECT fp.id, fp.user_id, fp.plan, LEAST(4, (n.d - fp.start_date) / 7 + 1) AS wk,
           (SELECT ord - 1 FROM jsonb_array_elements_text(fp.plan->'days') WITH ORDINALITY AS t(k, ord)
             WHERE k = public.weekday_key(n.d)) AS idx, n.d
    FROM public.fitness_plans fp, now_t n
    WHERE fp.status = 'active' AND fp.reminder_enabled AND fp.start_date <= n.d
      AND n.ts >= n.d + fp.reminder_time
      AND n.ts < n.d + fp.reminder_time + interval '3 hours'          -- kech qolgan eslatmani yubormaymiz
      AND fp.plan->'days' ? public.weekday_key(n.d)
      AND NOT EXISTS (SELECT 1 FROM public.fitness_sessions s WHERE s.plan_id = fp.id AND s.day = n.d)
    LIMIT _limit
  ), ins AS (
    INSERT INTO public.fitness_reminder_log (plan_id, day)
    SELECT id, d FROM due ON CONFLICT DO NOTHING
    RETURNING plan_id
  )
  SELECT due.id, due.user_id,
         COALESCE(due.plan->'weeks'->(due.wk - 1)->'sessions'->(due.idx::int)->>'label', 'Mashq'),
         due.wk::int
  FROM due JOIN ins ON ins.plan_id = due.id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_fitness_reminders(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fitness_reminders(int) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_fitness_alerts(_limit int DEFAULT 100)
RETURNS TABLE (user_id uuid, html text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fitness_alerts a SET sent_at = now()
   WHERE a.id IN (SELECT id FROM public.fitness_alerts WHERE sent_at IS NULL ORDER BY created_at LIMIT _limit
                  FOR UPDATE SKIP LOCKED)
  RETURNING a.user_id, a.html;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_fitness_alerts(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fitness_alerts(int) TO service_role;

NOTIFY pgrst, 'reload schema';
