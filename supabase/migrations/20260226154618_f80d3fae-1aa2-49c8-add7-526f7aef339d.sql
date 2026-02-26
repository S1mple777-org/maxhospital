
-- =============================================
-- 1. Fix ALL RLS policies to PERMISSIVE
-- =============================================

-- consultations: drop restrictive, recreate as permissive
DROP POLICY IF EXISTS "Doctors can update consultations" ON public.consultations;
DROP POLICY IF EXISTS "Doctors can view assigned consultations" ON public.consultations;
DROP POLICY IF EXISTS "Users can create consultations" ON public.consultations;
DROP POLICY IF EXISTS "Users can view own consultations" ON public.consultations;

CREATE POLICY "Users can view own consultations" ON public.consultations FOR SELECT TO authenticated USING (auth.uid() = patient_id);
CREATE POLICY "Doctors can view assigned consultations" ON public.consultations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM doctors WHERE doctors.user_id = auth.uid() AND doctors.id = consultations.doctor_id));
CREATE POLICY "Users can create consultations" ON public.consultations FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Doctors can update consultations" ON public.consultations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM doctors WHERE doctors.user_id = auth.uid() AND doctors.id = consultations.doctor_id));

-- messages: drop restrictive, recreate as permissive
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;

CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = messages.consultation_id AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))));

CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM consultations c WHERE c.id = messages.consultation_id AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))));

-- consultation_ratings: drop restrictive, recreate as permissive
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.consultation_ratings;
DROP POLICY IF EXISTS "Patients can create ratings" ON public.consultation_ratings;

CREATE POLICY "Anyone can view ratings" ON public.consultation_ratings FOR SELECT USING (true);
CREATE POLICY "Patients can create ratings" ON public.consultation_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);

-- =============================================
-- 2. Add consultation max_end_time & extended
-- =============================================
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS max_end_time timestamptz;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS extended boolean NOT NULL DEFAULT false;

-- =============================================
-- 3. Create admin_settings table for admin subtypes
-- =============================================
CREATE TYPE public.admin_type AS ENUM ('financial', 'dept_head', 'journalist');

CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  admin_type admin_type NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  monthly_limit bigint NOT NULL DEFAULT 0,
  month_spent bigint NOT NULL DEFAULT 0,
  month_reset_at timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage admin_settings" ON public.admin_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Admins can view own settings" ON public.admin_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
