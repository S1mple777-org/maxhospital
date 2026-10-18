-- =====================================================================
-- MaxHospital: tariflar va limitlarning boshlang'ich qiymatlari.
-- Migratsiyalar (0002, 0003, 0004) qo'llangandan KEYIN bir marta ishga tushiriladi.
-- Qayta ishga tushirish xavfsiz: mavjud qatorlar o'zgarmaydi (owner o'zgartirgan narxlar saqlanadi).
-- =====================================================================

INSERT INTO public.subscription_plans (id, name, price_uzs, period_days, sms_enabled, sort_order)
VALUES ('pro', 'Pro', 19000, 30, false, 1),
       ('premium', 'Premium', 39000, 30, true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.plan_limits (
  plan_id, ai_daily_questions, video_free_minutes, health_ai, lab_reads_monthly, emergency_credit_uzs,
  queue_boost, queue_first_monthly, queue_first_price_uzs, followup_hours, second_opinions_monthly,
  home_diary, weekly_report, emergency_card, family_members)
VALUES
  ('free',    5,    10, false, 0,  50000,  0, 0, NULL,  0,  0, false, false, false, 0),
  ('pro',     50,   20, true,  5,  100000, 4, 1, 15000, 72, 0, true,  true,  true,  0),
  ('premium', NULL, 30, true,  20, 150000, 6, 3, 10000, 72, 1, true,  true,  true,  4)
ON CONFLICT (plan_id) DO NOTHING;
