
ALTER TABLE public.doctors 
  ADD COLUMN IF NOT EXISTS address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS workplace text DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_username text DEFAULT '';
