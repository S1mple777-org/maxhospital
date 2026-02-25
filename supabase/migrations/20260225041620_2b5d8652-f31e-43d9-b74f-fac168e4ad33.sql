
-- Create consultation_ratings table
CREATE TABLE public.consultation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(consultation_id)
);

ALTER TABLE public.consultation_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can create ratings" ON public.consultation_ratings
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Anyone can view ratings" ON public.consultation_ratings
FOR SELECT TO authenticated
USING (true);

-- Enable realtime for consultation_ratings
ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_ratings;
