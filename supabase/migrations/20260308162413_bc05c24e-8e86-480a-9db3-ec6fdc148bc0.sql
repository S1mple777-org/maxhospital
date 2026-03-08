
CREATE TABLE public.forced_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  channel_username text NOT NULL,
  channel_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(channel_id)
);

ALTER TABLE public.forced_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view forced_subscriptions"
  ON public.forced_subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Owner can manage forced_subscriptions"
  ON public.forced_subscriptions FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role));
