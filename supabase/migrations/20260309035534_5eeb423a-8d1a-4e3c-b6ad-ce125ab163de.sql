
-- Allow patients to update their own consultations (e.g. to end them)
CREATE POLICY "Patients can update own consultations"
ON public.consultations
FOR UPDATE
USING (auth.uid() = patient_id);
