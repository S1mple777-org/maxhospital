-- MaxScore: kunlik sog'liq odatlari bali (0–100). Bu tashxis emas — foydalanuvchi o'z sog'lig'iga
-- qanchalik g'amxo'rlik qilayotganini ko'rsatadi:
--   Dori      35  — o'sha kungi eslatmalardan "Ichdim" ulushi (dori bo'lmasa hisobga olinmaydi)
--   Harakat   30  — MaxBand qadamlari (7000 = to'liq) yoki MaxFitness mashqi bajarilgan bo'lsa to'liq
--   Nazorat   20  — o'sha kuni bosim/qand/puls o'lchangan (uy o'lchovi yoki MaxBand)
--   Passport  15  — favqulodda tibbiy karta to'ldirilgan (qon guruhi, tug'ilgan sana, yaqin raqami)
-- Qo'llanilmaydigan qism chiqariladi va qolganlari 100 ga moslanadi.

CREATE OR REPLACE FUNCTION public.max_score_day(_user uuid, _day date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _from timestamptz := (_day::timestamp) AT TIME ZONE 'Asia/Tashkent';
  _to   timestamptz := ((_day + 1)::timestamp) AT TIME ZONE 'Asia/Tashkent';
  _due int; _taken int; _steps real; _fit boolean; _checked boolean; _passport boolean;
  _meds numeric; _move numeric; _chk numeric; _pp numeric; _w numeric := 0; _s numeric := 0;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE r.status = 'taken') INTO _due, _taken
  FROM public.medication_reminders r JOIN public.medication_schedules s ON s.id = r.schedule_id
  WHERE r.user_id = _user AND s.family_member_id IS NULL
    AND r.scheduled_at >= _from AND r.scheduled_at < _to AND r.scheduled_at <= now() - interval '30 minutes';

  SELECT max(value) INTO _steps FROM public.band_readings
  WHERE owner_id = _user AND family_member_id IS NULL AND kind = 'steps' AND measured_at >= _from AND measured_at < _to;

  SELECT EXISTS (SELECT 1 FROM public.fitness_sessions WHERE user_id = _user AND day = _day) INTO _fit;

  SELECT EXISTS (SELECT 1 FROM public.health_measurements WHERE patient_id = _user AND measured_at >= _from AND measured_at < _to)
      OR EXISTS (SELECT 1 FROM public.band_readings WHERE owner_id = _user AND family_member_id IS NULL
                 AND kind IN ('hr', 'spo2') AND measured_at >= _from AND measured_at < _to)
    INTO _checked;

  SELECT EXISTS (SELECT 1 FROM public.emergency_cards WHERE owner_id = _user AND family_member_id IS NULL
                 AND COALESCE(blood_type, '') <> '' AND birth_date IS NOT NULL AND COALESCE(contact_phone, '') <> '')
    INTO _passport;

  IF _due > 0 THEN _meds := _taken::numeric / _due; _w := _w + 35; _s := _s + 35 * _meds; END IF;
  _move := GREATEST(CASE WHEN _fit THEN 1 ELSE 0 END, LEAST(1, COALESCE(_steps, 0) / 7000.0));
  _w := _w + 30; _s := _s + 30 * _move;
  _chk := CASE WHEN _checked THEN 1 ELSE 0 END; _w := _w + 20; _s := _s + 20 * _chk;
  _pp := CASE WHEN _passport THEN 1 ELSE 0 END; _w := _w + 15; _s := _s + 15 * _pp;

  RETURN jsonb_build_object(
    'day', _day,
    'score', round(100 * _s / _w),
    'meds', CASE WHEN _due > 0 THEN jsonb_build_object('taken', _taken, 'due', _due, 'value', round(_meds, 2)) END,
    'move', jsonb_build_object('steps', COALESCE(round(_steps), 0), 'fitness', _fit, 'value', round(_move, 2)),
    'check', _checked,
    'passport', _passport);
END; $$;
REVOKE EXECUTE ON FUNCTION public.max_score_day(uuid, date) FROM PUBLIC, anon, authenticated;

-- Mening MaxScore'im: bugun, 7 kun, ketma-ket kunlar (≥ 70), yutuqlar va oila reytingi.
CREATE OR REPLACE FUNCTION public.my_max_score()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  _week jsonb; _streak int := 0; _d date; _sc int; _family jsonb; _badges text[] := '{}';
  _meds_full boolean; _steps_max numeric;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_agg(public.max_score_day(_uid, d::date) ORDER BY d) INTO _week
  FROM generate_series(_today - 6, _today, interval '1 day') d;

  -- Ketma-ket: kechadan orqaga (bugun hali tugamagan; bugun ≥70 bo'lsa u ham qo'shiladi)
  IF (public.max_score_day(_uid, _today)->>'score')::int >= 70 THEN _streak := 1; END IF;
  _d := _today - 1;
  FOR i IN 1..60 LOOP
    _sc := (public.max_score_day(_uid, _d)->>'score')::int;
    EXIT WHEN _sc < 70;
    _streak := _streak + 1; _d := _d - 1;
  END LOOP;

  SELECT bool_and((x->'meds') IS NULL OR (x->'meds'->>'value')::numeric >= 1) AND bool_or((x->'meds') IS NOT NULL),
         max((x->'move'->>'steps')::numeric)
    INTO _meds_full, _steps_max FROM jsonb_array_elements(_week) x;
  IF _streak >= 3 THEN _badges := _badges || 'streak3'; END IF;
  IF _streak >= 7 THEN _badges := _badges || 'streak7'; END IF;
  IF _meds_full THEN _badges := _badges || 'meds_week'; END IF;
  IF _steps_max >= 10000 THEN _badges := _badges || 'steps10k'; END IF;
  IF EXISTS (SELECT 1 FROM public.fitness_sessions WHERE user_id = _uid AND day > _today - 7 HAVING count(*) >= 3) THEN
    _badges := _badges || 'fitness3';
  END IF;

  -- Oila: yaqinlik qabul qilingan odamlar (ikki tomonga), faqat ism va bal
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', COALESCE(NULLIF(trim(p.full_name), ''), 'Yaqinim'),
           'today', (public.max_score_day(f.id, _today)->>'score')::int,
           'avg7', (SELECT round(avg((public.max_score_day(f.id, d::date)->>'score')::int))
                    FROM generate_series(_today - 6, _today, interval '1 day') d))
         ORDER BY p.full_name), '[]'::jsonb)
    INTO _family
  FROM (SELECT DISTINCT CASE WHEN g.wearer_id = _uid THEN g.guardian_id ELSE g.wearer_id END AS id
        FROM public.band_guardians g
        WHERE g.status = 'accepted' AND (g.wearer_id = _uid OR g.guardian_id = _uid)) f
  LEFT JOIN public.profiles p ON p.user_id = f.id
  WHERE f.id <> _uid;

  RETURN jsonb_build_object(
    'today', _week->-1,
    'week', _week,
    'avg7', (SELECT round(avg((x->>'score')::int)) FROM jsonb_array_elements(_week) x),
    'streak', _streak,
    'badges', to_jsonb(_badges),
    'family', _family);
END; $$;
REVOKE EXECUTE ON FUNCTION public.my_max_score() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_max_score() TO authenticated;

NOTIFY pgrst, 'reload schema';
