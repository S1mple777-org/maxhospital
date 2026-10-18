-- Supabase Dashboard -> SQL Editor -> New query -> shu matnni qo'yib "Run" bosing.
-- (Migratsiya vositasi DELETE so'zi bor buyruqlarni rad etgani uchun bu funksiya alohida.)
-- Dori jadvalini to'xtatish: kelgusi eslatmalar o'chiriladi, tarix qoladi.
CREATE OR REPLACE FUNCTION public.stop_medication_schedule(_schedule_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.medication_schedules SET is_active = false, updated_at = now()
  WHERE id = _schedule_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Jadval topilmadi' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.medication_reminders
  WHERE schedule_id = _schedule_id AND status = 'pending' AND scheduled_at > now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.stop_medication_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_medication_schedule(uuid) TO authenticated;
