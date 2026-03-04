
-- Fix ALL RLS policies to be PERMISSIVE instead of RESTRICTIVE

-- === consultations ===
DROP POLICY IF EXISTS "Users can view own consultations" ON public.consultations;
DROP POLICY IF EXISTS "Doctors can view assigned consultations" ON public.consultations;
DROP POLICY IF EXISTS "Users can create consultations" ON public.consultations;
DROP POLICY IF EXISTS "Doctors can update consultations" ON public.consultations;

CREATE POLICY "Users can view own consultations" ON public.consultations FOR SELECT TO authenticated USING (auth.uid() = patient_id);
CREATE POLICY "Doctors can view assigned consultations" ON public.consultations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM doctors WHERE doctors.user_id = auth.uid() AND doctors.id = consultations.doctor_id));
CREATE POLICY "Users can create consultations" ON public.consultations FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Doctors can update consultations" ON public.consultations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM doctors WHERE doctors.user_id = auth.uid() AND doctors.id = consultations.doctor_id));

-- === messages ===
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;

CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = messages.consultation_id AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))));
CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM consultations c WHERE c.id = messages.consultation_id AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))));

-- === consultation_ratings ===
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.consultation_ratings;
DROP POLICY IF EXISTS "Patients can create ratings" ON public.consultation_ratings;

CREATE POLICY "Anyone can view ratings" ON public.consultation_ratings FOR SELECT USING (true);
CREATE POLICY "Patients can create ratings" ON public.consultation_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);

-- === profiles ===
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner can update any profile" ON public.profiles;

CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

-- === departments ===
DROP POLICY IF EXISTS "Anyone can view departments" ON public.departments;
DROP POLICY IF EXISTS "Owner can manage departments" ON public.departments;

CREATE POLICY "Anyone can view departments" ON public.departments FOR SELECT USING (true);
CREATE POLICY "Owner can manage departments" ON public.departments FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

-- === doctors ===
DROP POLICY IF EXISTS "Anyone can view doctors" ON public.doctors;
DROP POLICY IF EXISTS "Doctors can update own" ON public.doctors;
DROP POLICY IF EXISTS "Admin can manage doctors" ON public.doctors;
DROP POLICY IF EXISTS "Owner can manage doctors" ON public.doctors;

CREATE POLICY "Anyone can view doctors" ON public.doctors FOR SELECT USING (true);
CREATE POLICY "Doctors can update own" ON public.doctors FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage doctors" ON public.doctors FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner can manage doctors" ON public.doctors FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

-- === posts ===
DROP POLICY IF EXISTS "Anyone can view published posts" ON public.posts;
DROP POLICY IF EXISTS "Admin can manage posts" ON public.posts;
DROP POLICY IF EXISTS "Owner can manage posts" ON public.posts;

CREATE POLICY "Anyone can view published posts" ON public.posts FOR SELECT USING (is_published = true);
CREATE POLICY "Admin can manage posts" ON public.posts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner can manage posts" ON public.posts FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

-- === user_roles ===
DROP POLICY IF EXISTS "Anyone can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owner can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin can manage doctor roles" ON public.user_roles;

CREATE POLICY "Anyone can read roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Owner can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Admin can manage doctor roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND role = 'doctor'::app_role);

-- === admin_settings ===
DROP POLICY IF EXISTS "Admins can view own settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Owner can manage admin_settings" ON public.admin_settings;

CREATE POLICY "Admins can view own settings" ON public.admin_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner can manage admin_settings" ON public.admin_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
