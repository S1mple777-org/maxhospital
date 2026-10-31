-- Yaqinning ovozidagi dori eslatmasi: nabira/farzand o'z ovozini yozib qo'yadi ("Buvijon, dorini iching"),
-- dori vaqtida budilnik o'rniga shu ovoz chalinadi (ilovada — bildirishnoma ovozi, saytda — eslatma bilan).
-- Kim yoza oladi: egasining o'zi yoki u qabul qilgan yaqini (band_guardians, status = accepted).
-- Ovoz qisqa (≤ 15 s, 16 kHz WAV, base64) — jadvalda saqlanadi, RLS bilan himoyalangan.

CREATE TABLE IF NOT EXISTS public.med_voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wearer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 60),
  audio_b64 text NOT NULL CHECK (char_length(audio_b64) BETWEEN 1000 AND 700000),
  duration_ms int NOT NULL CHECK (duration_ms BETWEEN 500 AND 16000),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS med_voice_notes_wearer ON public.med_voice_notes (wearer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS med_voice_notes_one_active ON public.med_voice_notes (wearer_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.can_record_voice_for(_wearer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _wearer = auth.uid() OR EXISTS (
    SELECT 1 FROM public.band_guardians g
    WHERE g.wearer_id = _wearer AND g.guardian_id = auth.uid() AND g.status = 'accepted');
$$;

ALTER TABLE public.med_voice_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Voice notes read" ON public.med_voice_notes;
CREATE POLICY "Voice notes read" ON public.med_voice_notes FOR SELECT TO authenticated
  USING (wearer_id = auth.uid() OR recorded_by = auth.uid());
DROP POLICY IF EXISTS "Voice notes insert" ON public.med_voice_notes;
CREATE POLICY "Voice notes insert" ON public.med_voice_notes FOR INSERT TO authenticated
  WITH CHECK (recorded_by = auth.uid() AND public.can_record_voice_for(wearer_id) AND NOT is_active);
DROP POLICY IF EXISTS "Voice notes delete" ON public.med_voice_notes;
CREATE POLICY "Voice notes delete" ON public.med_voice_notes FOR DELETE TO authenticated
  USING (wearer_id = auth.uid() OR recorded_by = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.med_voice_notes TO authenticated;

-- Har bir odam uchun ko'pi bilan 10 ta; birinchi ovoz avtomatik yoqiladi; egasiga xabar.
CREATE OR REPLACE FUNCTION public.med_voice_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _who text;
BEGIN
  IF (SELECT count(*) FROM public.med_voice_notes WHERE wearer_id = NEW.wearer_id) > 10 THEN
    RAISE EXCEPTION 'Ko''pi bilan 10 ta ovoz. Eskisini o''chiring';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.med_voice_notes WHERE wearer_id = NEW.wearer_id AND is_active) THEN
    UPDATE public.med_voice_notes SET is_active = true WHERE id = NEW.id;
  END IF;
  IF NEW.recorded_by <> NEW.wearer_id THEN
    SELECT COALESCE(NULLIF(trim(full_name), ''), 'Yaqiningiz') INTO _who FROM public.profiles WHERE user_id = NEW.recorded_by;
    INSERT INTO public.user_notifications (user_id, kind, title, body, data)
    VALUES (NEW.wearer_id, 'med_voice', '🎙 ' || COALESCE(_who, 'Yaqiningiz') || ' sizga ovozli eslatma yozdi',
            'Endi dori vaqtida uning ovozi eshitiladi. Dori eslatmasi sahifasida tinglab ko''ring.',
            jsonb_build_object('url', '/medications', 'voice_id', NEW.id));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_med_voice_after_insert ON public.med_voice_notes;
CREATE TRIGGER trg_med_voice_after_insert AFTER INSERT ON public.med_voice_notes
  FOR EACH ROW EXECUTE FUNCTION public.med_voice_after_insert();

-- Qaysi ovoz chalinsin (faqat egasi tanlaydi; NULL — oddiy budilnik ovozi).
CREATE OR REPLACE FUNCTION public.set_active_voice(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Avval tizimga kiring'; END IF;
  IF _id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.med_voice_notes WHERE id = _id AND wearer_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ovoz topilmadi';
  END IF;
  UPDATE public.med_voice_notes SET is_active = false WHERE wearer_id = auth.uid() AND is_active AND id IS DISTINCT FROM _id;
  IF _id IS NOT NULL THEN UPDATE public.med_voice_notes SET is_active = true WHERE id = _id; END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_active_voice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_voice(uuid) TO authenticated;

-- Kimlar uchun ovoz yoza olaman: o'zim + meni yaqini sifatida qabul qilganlar.
CREATE OR REPLACE FUNCTION public.voice_targets()
RETURNS TABLE (user_id uuid, name text, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid(), 'Men', true
  UNION ALL
  SELECT g.wearer_id, COALESCE(NULLIF(trim(p.full_name), ''), 'Yaqinim'), false
  FROM public.band_guardians g LEFT JOIN public.profiles p ON p.user_id = g.wearer_id
  WHERE g.guardian_id = auth.uid() AND g.status = 'accepted';
$$;
REVOKE EXECUTE ON FUNCTION public.voice_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voice_targets() TO authenticated;

NOTIFY pgrst, 'reload schema';
