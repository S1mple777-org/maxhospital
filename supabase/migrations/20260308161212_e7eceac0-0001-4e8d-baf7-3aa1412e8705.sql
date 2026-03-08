
CREATE TABLE public.prescriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE CASCADE NOT NULL,
  doctor_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  patient_name text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  medicines jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  doctor_name text NOT NULL DEFAULT '',
  doctor_title text NOT NULL DEFAULT '',
  department_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- Doctors can create prescriptions for their consultations
CREATE POLICY "Doctors can create prescriptions" ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.user_id = auth.uid() AND d.id = (
        SELECT c.doctor_id FROM public.consultations c WHERE c.id = prescriptions.consultation_id
      )
    )
  );

-- Doctors can view prescriptions they created
CREATE POLICY "Doctors can view own prescriptions" ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

-- Patients can view their prescriptions
CREATE POLICY "Patients can view own prescriptions" ON public.prescriptions
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());
