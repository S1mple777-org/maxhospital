-- MaxHospital Passport: favqulodda kartani to'liq tibbiy pasportga aylantirish.
-- Bemor har bir maydonni QR orqali ko'rinadigan yoki yashirin qilib belgilaydi (visibility).
-- Eski kartalar o'zgarmaydi: visibility bo'sh bo'lsa, avvalgi maydonlar ko'rinadi, yangilari yashirin.

ALTER TABLE public.emergency_cards
  ADD COLUMN IF NOT EXISTS birth_date date CHECK (birth_date IS NULL OR birth_date > DATE '1900-01-01'),
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IS NULL OR gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS height_cm int CHECK (height_cm IS NULL OR height_cm BETWEEN 30 AND 260),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5, 1) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS address text CHECK (address IS NULL OR char_length(address) <= 200),
  ADD COLUMN IF NOT EXISTS surgeries text CHECK (surgeries IS NULL OR char_length(surgeries) <= 500),
  ADD COLUMN IF NOT EXISTS vaccinations text CHECK (vaccinations IS NULL OR char_length(vaccinations) <= 500),
  ADD COLUMN IF NOT EXISTS family_history text CHECK (family_history IS NULL OR char_length(family_history) <= 500),
  ADD COLUMN IF NOT EXISTS insurance text CHECK (insurance IS NULL OR char_length(insurance) <= 100),
  ADD COLUMN IF NOT EXISTS organ_donor boolean,
  ADD COLUMN IF NOT EXISTS doctor_name text CHECK (doctor_name IS NULL OR char_length(doctor_name) <= 100),
  ADD COLUMN IF NOT EXISTS doctor_phone text CHECK (doctor_phone IS NULL OR doctor_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  ADD COLUMN IF NOT EXISTS contact2_name text CHECK (contact2_name IS NULL OR char_length(contact2_name) <= 100),
  ADD COLUMN IF NOT EXISTS contact2_phone text CHECK (contact2_phone IS NULL OR contact2_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  ADD COLUMN IF NOT EXISTS visibility jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ko'rinish kaliti: bemor belgilamagan bo'lsa, _def qiymati olinadi.
CREATE OR REPLACE FUNCTION public.passport_vis(_v jsonb, _k text, _def boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(_v -> _k) = 'boolean' THEN (_v ->> _k)::boolean ELSE _def END;
$$;

-- Saqlash: asosiy maydonlar mavjud save_emergency_card orqali (tarif tekshiruvi shu yerda),
-- qolganlari va ko'rinish sozlamalari shu funksiyada.
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

  -- faqat ma'lum kalitlar va faqat true/false qiymatlar saqlanadi
  SELECT COALESCE(jsonb_object_agg(k, (_visibility ->> k)::boolean), '{}'::jsonb) INTO _vis
  FROM unnest(ARRAY['full_name', 'birth_date', 'gender', 'body', 'address', 'blood_type', 'allergies', 'conditions',
                    'medications', 'notes', 'surgeries', 'vaccinations', 'family_history', 'contact', 'contact2',
                    'doctor', 'insurance', 'organ_donor']) AS k
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

-- QR orqali ochish (login kerak emas). Faqat bemor "ko'rinsin" deb belgilagan maydonlar qaytadi.
DROP FUNCTION IF EXISTS public.get_emergency_card(text);
CREATE FUNCTION public.get_emergency_card(_token text)
RETURNS TABLE (full_name text, birth_year int, gender text, height_cm int, weight_kg numeric, address text,
               blood_type text, allergies text, conditions text, medications text, notes text,
               surgeries text, vaccinations text, family_history text,
               contact_name text, contact_phone text, contact2_name text, contact2_phone text,
               doctor_name text, doctor_phone text, insurance text, organ_donor boolean, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE WHEN public.passport_vis(e.visibility, 'full_name', true) THEN COALESCE(fm.full_name, p.full_name) END,
    CASE WHEN public.passport_vis(e.visibility, 'birth_date', true)
         THEN EXTRACT(year FROM COALESCE(e.birth_date, fm.birth_date))::int END,
    CASE WHEN public.passport_vis(e.visibility, 'gender', false) THEN e.gender END,
    CASE WHEN public.passport_vis(e.visibility, 'body', false) THEN e.height_cm END,
    CASE WHEN public.passport_vis(e.visibility, 'body', false) THEN e.weight_kg END,
    CASE WHEN public.passport_vis(e.visibility, 'address', false) THEN e.address END,
    CASE WHEN public.passport_vis(e.visibility, 'blood_type', true) THEN e.blood_type END,
    CASE WHEN public.passport_vis(e.visibility, 'allergies', true) THEN e.allergies END,
    CASE WHEN public.passport_vis(e.visibility, 'conditions', true) THEN e.conditions END,
    CASE WHEN public.passport_vis(e.visibility, 'medications', true) THEN e.medications END,
    CASE WHEN public.passport_vis(e.visibility, 'notes', true) THEN e.notes END,
    CASE WHEN public.passport_vis(e.visibility, 'surgeries', false) THEN e.surgeries END,
    CASE WHEN public.passport_vis(e.visibility, 'vaccinations', false) THEN e.vaccinations END,
    CASE WHEN public.passport_vis(e.visibility, 'family_history', false) THEN e.family_history END,
    CASE WHEN public.passport_vis(e.visibility, 'contact', true) THEN e.contact_name END,
    CASE WHEN public.passport_vis(e.visibility, 'contact', true) THEN e.contact_phone END,
    CASE WHEN public.passport_vis(e.visibility, 'contact2', false) THEN e.contact2_name END,
    CASE WHEN public.passport_vis(e.visibility, 'contact2', false) THEN e.contact2_phone END,
    CASE WHEN public.passport_vis(e.visibility, 'doctor', false) THEN e.doctor_name END,
    CASE WHEN public.passport_vis(e.visibility, 'doctor', false) THEN e.doctor_phone END,
    CASE WHEN public.passport_vis(e.visibility, 'insurance', false) THEN e.insurance END,
    CASE WHEN public.passport_vis(e.visibility, 'organ_donor', false) THEN e.organ_donor END,
    e.updated_at
  FROM public.emergency_cards e
  LEFT JOIN public.family_members fm ON fm.id = e.family_member_id
  LEFT JOIN public.profiles p ON p.user_id = e.owner_id
  WHERE e.token = _token AND e.is_enabled AND char_length(_token) = 32;
$$;

REVOKE EXECUTE ON FUNCTION public.get_emergency_card(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_emergency_card(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_passport(uuid, jsonb, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_passport(uuid, jsonb, jsonb, boolean, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.passport_vis(jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.passport_vis(jsonb, text, boolean) TO anon, authenticated, service_role;
