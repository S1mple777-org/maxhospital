
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'doctor', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  phone TEXT,
  balance_uzs BIGINT NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  ban_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Departments table
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'stethoscope',
  price_uzs BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Doctors table
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  bio_uz TEXT,
  bio_ru TEXT,
  bio_en TEXT,
  experience_years INT NOT NULL DEFAULT 0,
  is_online BOOLEAN NOT NULL DEFAULT false,
  patients_count INT NOT NULL DEFAULT 0,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- News/Posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_uz TEXT NOT NULL,
  title_ru TEXT NOT NULL,
  title_en TEXT NOT NULL,
  content_uz TEXT NOT NULL,
  content_ru TEXT NOT NULL,
  content_en TEXT NOT NULL,
  image_url TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Consultations table
CREATE TABLE public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  price_uzs BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- Messages table for chat
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'image', 'video', 'file')),
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies

-- Profiles: everyone can read, users can update own
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner can update any profile" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'owner'));

-- User roles: only admin/owner can manage
CREATE POLICY "Anyone can read roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Owner can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Admin can manage doctor roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') AND role = 'doctor');

-- Departments: public read, owner can manage
CREATE POLICY "Anyone can view departments" ON public.departments FOR SELECT USING (true);
CREATE POLICY "Owner can manage departments" ON public.departments FOR ALL USING (public.has_role(auth.uid(), 'owner'));

-- Doctors: public read, admin/owner can manage
CREATE POLICY "Anyone can view doctors" ON public.doctors FOR SELECT USING (true);
CREATE POLICY "Admin can manage doctors" ON public.doctors FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner can manage doctors" ON public.doctors FOR ALL USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Doctors can update own" ON public.doctors FOR UPDATE USING (auth.uid() = user_id);

-- Posts: public read, admin can manage
CREATE POLICY "Anyone can view published posts" ON public.posts FOR SELECT USING (is_published = true);
CREATE POLICY "Admin can manage posts" ON public.posts FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner can manage posts" ON public.posts FOR ALL USING (public.has_role(auth.uid(), 'owner'));

-- Consultations: patients and doctors can see their own
CREATE POLICY "Users can view own consultations" ON public.consultations FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY "Doctors can view assigned consultations" ON public.consultations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.doctors WHERE doctors.user_id = auth.uid() AND doctors.id = consultations.doctor_id)
);
CREATE POLICY "Users can create consultations" ON public.consultations FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Doctors can update consultations" ON public.consultations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.doctors WHERE doctors.user_id = auth.uid() AND doctors.id = consultations.doctor_id)
);

-- Messages: consultation participants can read/write
CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = consultation_id
    AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))
  )
);
CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = consultation_id
    AND (c.patient_id = auth.uid() OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id = auth.uid() AND d.id = c.doctor_id))
  )
);

-- Insert default departments
INSERT INTO public.departments (name_uz, name_ru, name_en, icon, price_uzs) VALUES
  ('Travmatologiya', 'Травматология', 'Traumatology', 'bone', 150000),
  ('Kardiologiya', 'Кардиология', 'Cardiology', 'heart', 200000),
  ('Nevrologiya', 'Неврология', 'Neurology', 'brain', 180000),
  ('Pediatriya', 'Педиатрия', 'Pediatrics', 'baby', 120000),
  ('Dermatologiya', 'Дерматология', 'Dermatology', 'fingerprint', 130000),
  ('Oftalmologiya', 'Офтальмология', 'Ophthalmology', 'eye', 160000),
  ('Stomatologiya', 'Стоматология', 'Dentistry', 'smile-plus', 140000),
  ('Terapiya', 'Терапия', 'Therapy', 'stethoscope', 100000);
