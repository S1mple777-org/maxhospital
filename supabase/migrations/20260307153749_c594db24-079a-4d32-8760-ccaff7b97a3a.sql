
-- Add telegram fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id bigint;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_link_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_notifications_enabled boolean DEFAULT true;

-- Create telegram auth requests table
CREATE TABLE IF NOT EXISTS telegram_auth_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  request_type text NOT NULL DEFAULT 'login',
  status text NOT NULL DEFAULT 'pending',
  action_link text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '5 minutes'
);

ALTER TABLE telegram_auth_requests ENABLE ROW LEVEL SECURITY;

-- Helper function to find user by email
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_input text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'auth', 'public'
AS $$
  SELECT id FROM auth.users WHERE email = email_input LIMIT 1;
$$;
