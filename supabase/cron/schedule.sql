-- =====================================================================
-- Ixtiyoriy: bazaning o'zida jadval bo'yicha ishlar (pg_cron + pg_net + Vault).
-- Faqat O'Z Supabase loyihangizda, SQL Editor orqali qo'lda ishga tushiriladi
-- (Lovable Cloud migratsiyalari Vault'ga kirishga ruxsat bermaydi).
-- Oldin Vault'ga qo'shing: reminders_function_url, reminders_cron_secret, weekly_report_function_url.
-- Bu fayl ishlatilmasa ham hammasi ishlaydi: GitHub Actions zaxira cron'lari
-- (.github/workflows/reminders-cron.yml va weekly-report-cron.yml) shu ishlarni bajaradi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rejalashtirilgan ishlar (pg_cron). Mavjud bo'lmasa migratsiya baribir o'tadi;
-- unda MEDICATIONS.md dagi GitHub Actions zaxira variantidan foydalaning.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron unavailable: %', SQLERRM;
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_net unavailable: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule('maxhospital-renew-subscriptions', '7 * * * *',
        'SELECT public.renew_subscriptions()');

      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        -- Har daqiqada eslatmalarni yuboruvchi funksiyani chaqiradi.
        -- URL va maxfiy kalit Vault'da saqlanadi (MEDICATIONS.md, 2-qadam).
        PERFORM cron.schedule('maxhospital-dispatch-reminders', '* * * * *', $cron$
          SELECT net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_function_url'),
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')
            ),
            body := '{}'::jsonb
          )
          WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'reminders_function_url');
        $cron$);
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'cron jobs not scheduled: %', SQLERRM;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Haftalik hisobot uchun cron (pg_cron + pg_net + Vault). Yo'q bo'lsa migratsiya baribir o'tadi;
-- zaxira: .github/workflows/weekly-report-cron.yml
-- ---------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'maxhospital-weekly-report';
    -- Yakshanba 20:00 Toshkent = 15:00 UTC
    PERFORM cron.schedule('maxhospital-weekly-report', '0 15 * * 0', $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_report_function_url'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
        body := '{"mode":"cron"}'::jsonb)
      WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'weekly_report_function_url');
    $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'weekly report cron not scheduled: %', SQLERRM;
END
$cron$;
