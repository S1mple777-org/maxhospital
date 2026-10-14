-- =====================================================================
-- Security hardening
--  * Users can no longer change their own balance / ban / Telegram / 2FA
--    fields directly.
--  * Private profile columns (phone, balance, Telegram ids, link codes,
--    ban info) are no longer readable by everyone.
--  * Payments, refunds, extra video minutes and ending a consultation now
--    happen in server-side functions, atomically.
--  * Doctors only see their own patients' prescriptions.
--  * Ratings must belong to the patient's own completed consultation and
--    the doctor's average is recalculated server-side.
--  * get_user_id_by_email is no longer callable from the browser.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES: protected columns
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Server-side code (service role, SECURITY DEFINER functions) is trusted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Admins and the owner may manage balances and bans from the panels.
  IF public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.telegram_chat_id IS DISTINCT FROM OLD.telegram_chat_id
       OR NEW.telegram_link_code IS DISTINCT FROM OLD.telegram_link_code
       OR NEW.two_fa_enabled IS DISTINCT FROM OLD.two_fa_enabled THEN
      RAISE EXCEPTION 'Bu maydonlarni o''zgartirish mumkin emas' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.balance_uzs IS DISTINCT FROM OLD.balance_uzs
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.telegram_chat_id IS DISTINCT FROM OLD.telegram_chat_id
     OR NEW.telegram_link_code IS DISTINCT FROM OLD.telegram_link_code
     OR NEW.telegram_notifications_enabled IS DISTINCT FROM OLD.telegram_notifications_enabled
     OR NEW.two_fa_enabled IS DISTINCT FROM OLD.two_fa_enabled THEN
    RAISE EXCEPTION 'Bu maydonlarni o''zgartirish mumkin emas' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- Only public columns are readable directly. Private data goes through the
-- functions below.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, full_name, avatar_url, created_at, updated_at)
  ON public.profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.staff_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC;
END;
$$;

-- Doctors' and admins' phone numbers stay visible on public pages;
-- patients' numbers do not.
CREATE OR REPLACE FUNCTION public.get_public_phone(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone FROM public.profiles p
  WHERE p.user_id = _user_id
    AND (
      EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id = _user_id)
      OR public.has_role(_user_id, 'admin'::app_role)
    );
$$;


-- Owner / admin tops up a user's balance atomically.
CREATE OR REPLACE FUNCTION public.admin_add_balance(_user_id uuid, _amount bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Miqdor musbat bo''lishi kerak';
  END IF;
  UPDATE public.profiles SET balance_uzs = balance_uzs + _amount
  WHERE user_id = _user_id
  RETURNING balance_uzs INTO _new;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foydalanuvchi topilmadi';
  END IF;
  RETURN _new;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. CONSULTATIONS: payments and status changes on the server
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create consultations" ON public.consultations;
DROP POLICY IF EXISTS "Patients can update own consultations" ON public.consultations;

CREATE OR REPLACE FUNCTION public.protect_consultation_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
     OR NEW.department_id IS DISTINCT FROM OLD.department_id
     OR NEW.price_uzs IS DISTINCT FROM OLD.price_uzs THEN
    RAISE EXCEPTION 'Bu maydonlarni o''zgartirish mumkin emas' USING ERRCODE = '42501';
  END IF;
  -- Cancelling must go through reject_consultation() so the patient is refunded.
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Rad etish uchun reject_consultation() dan foydalaning' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_consultation_columns ON public.consultations;
CREATE TRIGGER protect_consultation_columns
BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.protect_consultation_columns();

-- Patient creates a consultation; price comes from the department and the
-- balance is charged in the same transaction.
CREATE OR REPLACE FUNCTION public.create_consultation(_doctor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _dept_id uuid;
  _price bigint;
  _balance bigint;
  _banned boolean;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Tizimga kiring' USING ERRCODE = '42501';
  END IF;

  SELECT d.department_id INTO _dept_id FROM public.doctors d WHERE d.id = _doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shifokor topilmadi';
  END IF;
  IF _dept_id IS NULL THEN
    RAISE EXCEPTION 'Shifokor bo''limga biriktirilmagan';
  END IF;

  SELECT COALESCE(dep.price_uzs, 0) INTO _price FROM public.departments dep WHERE dep.id = _dept_id;

  SELECT p.balance_uzs, p.is_banned INTO _balance, _banned
  FROM public.profiles p WHERE p.user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil topilmadi';
  END IF;
  IF _banned THEN
    RAISE EXCEPTION 'Hisobingiz bloklangan' USING ERRCODE = '42501';
  END IF;
  IF _balance < _price THEN
    RAISE EXCEPTION 'Balansingizda yetarli mablag'' yo''q';
  END IF;

  UPDATE public.profiles SET balance_uzs = balance_uzs - _price WHERE user_id = _uid;

  INSERT INTO public.consultations (patient_id, doctor_id, department_id, price_uzs)
  VALUES (_uid, _doctor_id, _dept_id, _price)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- Doctor rejects a pending request; the patient gets the money back.
CREATE OR REPLACE FUNCTION public.reject_consultation(_consultation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.consultations%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konsultatsiya topilmadi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _c.doctor_id AND d.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  IF _c.status <> 'pending' THEN
    RAISE EXCEPTION 'Faqat kutilayotgan so''rovni rad etish mumkin';
  END IF;

  UPDATE public.consultations SET status = 'cancelled', ended_at = now() WHERE id = _consultation_id;
  UPDATE public.profiles SET balance_uzs = balance_uzs + _c.price_uzs WHERE user_id = _c.patient_id;
END;
$$;

-- Either participant ends an active consultation.
CREATE OR REPLACE FUNCTION public.end_consultation(_consultation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.consultations%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konsultatsiya topilmadi';
  END IF;
  IF _c.patient_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _c.doctor_id AND d.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  IF _c.status IN ('completed', 'cancelled') THEN
    RETURN; -- already ended
  END IF;
  IF _c.status <> 'active' THEN
    RAISE EXCEPTION 'Konsultatsiya hali boshlanmagan';
  END IF;

  UPDATE public.consultations SET status = 'completed', ended_at = now() WHERE id = _consultation_id;
END;
$$;

-- Patient pays for one extra video minute (price fixed on the server).
CREATE OR REPLACE FUNCTION public.charge_extra_video_minute(_consultation_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _price constant bigint := 20000;
  _c public.consultations%ROWTYPE;
  _balance bigint;
BEGIN
  SELECT * INTO _c FROM public.consultations WHERE id = _consultation_id;
  IF NOT FOUND OR _c.patient_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE = '42501';
  END IF;
  IF _c.status <> 'active' THEN
    RAISE EXCEPTION 'Konsultatsiya faol emas';
  END IF;

  SELECT balance_uzs INTO _balance FROM public.profiles WHERE user_id = auth.uid() FOR UPDATE;
  IF _balance < _price THEN
    RAISE EXCEPTION 'Balans yetarli emas';
  END IF;

  UPDATE public.profiles SET balance_uzs = balance_uzs - _price
  WHERE user_id = auth.uid()
  RETURNING balance_uzs INTO _balance;
  RETURN _balance;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. PRESCRIPTIONS: a doctor only sees prescriptions they wrote
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Doctors can view own prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can view own prescriptions" ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.consultations c
      JOIN public.doctors d ON d.id = c.doctor_id
      WHERE c.id = prescriptions.consultation_id AND d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 4. RATINGS: only for your own completed consultation; average on server
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Patients can create ratings" ON public.consultation_ratings;
CREATE POLICY "Patients can create ratings" ON public.consultation_ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = patient_id
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_ratings.consultation_id
        AND c.patient_id = auth.uid()
        AND c.doctor_id = consultation_ratings.doctor_id
        AND c.status = 'completed'
    )
  );

CREATE OR REPLACE FUNCTION public.refresh_doctor_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.doctors
  SET rating = (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM public.consultation_ratings r WHERE r.doctor_id = NEW.doctor_id)
  WHERE id = NEW.doctor_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_doctor_rating ON public.consultation_ratings;
CREATE TRIGGER refresh_doctor_rating
AFTER INSERT ON public.consultation_ratings
FOR EACH ROW EXECUTE FUNCTION public.refresh_doctor_rating();

-- ---------------------------------------------------------------------
-- 5. FUNCTION PERMISSIONS
-- ---------------------------------------------------------------------
-- Only edge functions (service role) may look users up by email.
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

-- Trigger functions are not meant to be called directly.
REVOKE EXECUTE ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_consultation_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_doctor_rating() FROM PUBLIC, anon, authenticated;

-- App functions: signed-in users only.
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_list_profiles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_consultation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.charge_extra_video_minute(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_balance(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_extra_video_minute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_balance(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_phone(uuid) TO anon, authenticated;
