
-- Enable realtime for consultations only (messages already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
