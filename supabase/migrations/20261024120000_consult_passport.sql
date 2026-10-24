-- Konsultatsiya paytida shifokor bemorning MaxHospital Passport'ini ko'radi.
--  * Bemor roziligi: passport'dagi "consult" kaliti (sukut bo'yicha YOQILGAN, bemor o'chira oladi).
--  * Faqat tibbiy bo'limlar ko'rinadi: qon guruhi, allergiya, kasalliklar, dorilar, eslatma, operatsiyalar,
--    emlashlar, oilaviy kasalliklar, jins, yosh, bo'y/vazn. Manzil, sug'urta, donorlik va yaqinlar ko'rinmaydi.
--  * Faqat shu konsultatsiyaning shifokori; faqat konsultatsiya faol bo'lganda yoki bepul savol davrida.
--  * Oila a'zosi uchun ochilgan konsultatsiyada shu a'zoning passport'i ochiladi.

-- save_passport: "consult" kaliti ham saqlanadi (boshqa hech narsa o'zgarmadi).
CREATE OR REPLACE FUNCTION public.save_passport(
  _family_member_id uuid, _d jsonb, _visibility jsonb, _is_enabled boolean DEFAULT true, _regenerate boolean DEFAULT false)
RETURNS public.emergency_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.emergency_cards%ROWTYPE;
  _vis jsonb;
  _birth date := NULLIF(btrim(COALESCE(_d ->> 'birth_date', '')), '')::date;
  _gender text := NULLIF(_d ->> 'gender', '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring' USING ERRCODE = '42501'; END IF;
  IF _birth IS NOT NULL AND _birth > current_date THEN RAISE EXCEPTION 'Tug''ilgan sana kelajakda bo''lishi mumkin emas'; END IF;

  _row := public.save_emergency_card(
    _family_member_id, _d ->> 'blood_type', _d ->> 'allergies', _d ->> 'conditions', _d ->> 'medications',
    _d ->> 'contact_name', _d ->> 'contact_phone', _d ->> 'notes', _is_enabled, _regenerate);

  SELECT COALESCE(jsonb_object_agg(k, (_visibility ->> k)::boolean), '{}'::jsonb) INTO _vis
  FROM unnest(ARRAY['full_name', 'birth_date', 'gender', 'body', 'address', 'blood_type', 'allergies', 'conditions',
                    'medications', 'notes', 'surgeries', 'vaccinations', 'family_history', 'contact', 'contact2',
                    'doctor', 'insurance', 'organ_donor', 'history', 'consult']) AS k
  WHERE _visibility ? k AND jsonb_typeof(_visibility -> k) = 'boolean';

  UPDATE public.emergency_cards SET
    birth_date = _birth,
    gender = _gender,
    height_cm = NULLIF(btrim(COALESCE(_d ->> 'height_cm', '')), '')::int,
    weight_kg = NULLIF(btrim(COALESCE(_d ->> 'weight_kg', '')), '')::numeric,
    address = NULLIF(btrim(COALESCE(_d ->> 'address', '')), ''),
    surgeries = NULLIF(btrim(COALESCE(_d ->> 'surgeries', '')), ''),
    vaccinations = NULLIF(btrim(COALESCE(_d ->> 'vaccinations', '')), ''),
    family_history = NULLIF(btrim(COALESCE(_d ->> 'family_history', '')), ''),
    insurance = NULLIF(btrim(COALESCE(_d ->> 'insurance', '')), ''),
    organ_donor = CASE WHEN jsonb_typeof(_d -> 'organ_donor') = 'boolean' THEN (_d ->> 'organ_donor')::boolean ELSE NULL END,
    doctor_name = NULLIF(btrim(COALESCE(_d ->> 'doctor_name', '')), ''),
    doctor_phone = NULLIF(btrim(COALESCE(_d ->> 'doctor_phone', '')), ''),
    contact2_name = NULLIF(btrim(COALESCE(_d ->> 'contact2_name', '')), ''),
    contact2_phone = NULLIF(btrim(COALESCE(_d ->> 'contact2_phone', '')), ''),
    visibility = _vis
  WHERE id = _row.id AND owner_id = auth.uid()
  RETURNING * INTO _row;
  RETURN _row;
END; $$;

-- Shifokor uchun passport. { available, shared, data }:
--   available=false -> konsultatsiya ruxsat bermaydi yoki passport yaratilmagan
--   shared=false    -> bemor passport'ni shifokorga ko'rsatmaslikni tanlagan
CREATE OR REPLACE FUNCTION public.get_consultation_passport(_consultation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.consultations%ROWTYPE;
  _e public.emergency_cards%ROWTYPE;
  _birth date;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('available', false); END IF;

  SELECT c.* INTO _c FROM public.consultations c
  JOIN public.doctors d ON d.id = c.doctor_id AND d.user_id = auth.uid()
  WHERE c.id = _consultation_id
    AND (c.status = 'active'
         OR (c.status = 'completed' AND c.followup_until IS NOT NULL AND c.followup_until > now()));
  IF NOT FOUND THEN RETURN jsonb_build_object('available', false); END IF;

  SELECT e.* INTO _e FROM public.emergency_cards e
  WHERE e.owner_id = _c.patient_id AND e.family_member_id IS NOT DISTINCT FROM _c.family_member_id
  LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('available', false, 'reason', 'no_passport'); END IF;

  IF NOT public.passport_vis(_e.visibility, 'consult', true) THEN
    RETURN jsonb_build_object('available', true, 'shared', false);
  END IF;

  _birth := COALESCE(_e.birth_date,
    (SELECT fm.birth_date FROM public.family_members fm WHERE fm.id = _e.family_member_id));

  RETURN jsonb_build_object(
    'available', true, 'shared', true,
    'data', jsonb_build_object(
      'age', CASE WHEN _birth IS NULL THEN NULL ELSE date_part('year', age(current_date, _birth))::int END,
      'gender', _e.gender,
      'height_cm', _e.height_cm,
      'weight_kg', _e.weight_kg,
      'blood_type', _e.blood_type,
      'allergies', _e.allergies,
      'conditions', _e.conditions,
      'medications', _e.medications,
      'notes', _e.notes,
      'surgeries', _e.surgeries,
      'vaccinations', _e.vaccinations,
      'family_history', _e.family_history,
      'updated_at', _e.updated_at));
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_consultation_passport(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_consultation_passport(uuid) TO authenticated;
