-- Rejalashtiruvchi bazaning o'zida (pg_cron + pg_net): GitHub secret'lariga bog'liq emas.
--  * Har daqiqada  dispatch-reminders  (dori eslatmalari: Telegram, sayt, SMS)
--  * Har 5 daqiqada dispatch-checkins  (davolanish kuzatuvi, bron eslatmalari)
-- Maxfiy token baza ichida yaratiladi va Vault'da saqlanadi; funksiyalar uni check_cron_token()
-- orqali tekshiradi. Shuning uchun hech qanday kalitni qo'lda nusxalash kerak emas.
-- Qayta ishga tushirish xavfsiz.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'maxhospital_cron_token') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'maxhospital_cron_token',
      'pg_cron -> edge functions (dispatch-reminders, dispatch-checkins)');
  END IF;
END $$;

-- Faqat server funksiyalari (service_role) chaqira oladi.
CREATE OR REPLACE FUNCTION public.check_cron_token(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT char_length(COALESCE(_token, '')) >= 32 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'maxhospital_cron_token' AND decrypted_secret = _token);
$$;
REVOKE EXECUTE ON FUNCTION public.check_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_token(text) TO service_role;

-- Funksiyani chaqiradigan yordamchi (cron ichida ishlatiladi).
CREATE OR REPLACE FUNCTION public.call_edge_function(_name text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT net.http_post(
    url := 'https://sgmeuwbvfffopmczjwcv.supabase.co/functions/v1/' || _name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'maxhospital_cron_token')),
    body := _body,
    timeout_milliseconds := 55000);
$$;
REVOKE EXECUTE ON FUNCTION public.call_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('maxhospital-dispatch-reminders', 'maxhospital-dispatch-checkins');
  PERFORM cron.schedule('maxhospital-dispatch-reminders', '* * * * *',
    $job$ SELECT public.call_edge_function('dispatch-reminders') $job$);
  PERFORM cron.schedule('maxhospital-dispatch-checkins', '*/5 * * * *',
    $job$ SELECT public.call_edge_function('dispatch-checkins') $job$);
END $$;
