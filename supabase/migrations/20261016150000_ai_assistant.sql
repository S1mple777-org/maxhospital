-- =====================================================================
-- MaxHospital AI-yordamchi
--  * medical_books   : admin yuklagan tibbiy kitoblar (PDF)
--  * book_chunks     : kitob matni bo'laklari + Gemini embedding vektorlari
--  * health_measurements : shifokor ko'rigida kiritilgan raqamli ko'rsatkichlar
--  * ai_chat_logs    : AI so'rovlari statistikasi (savol matni saqlanmaydi)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- Kitoblar
-- ---------------------------------------------------------------------
CREATE TABLE public.medical_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'uz' CHECK (language IN ('uz', 'ru', 'en')),
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message text,
  page_count int NOT NULL DEFAULT 0,
  chunk_count int NOT NULL DEFAULT 0,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.medical_books TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_books TO authenticated;
GRANT ALL ON public.medical_books TO service_role;

ALTER TABLE public.medical_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ready books" ON public.medical_books
  FOR SELECT USING (status = 'ready');
CREATE POLICY "Staff can view all books" ON public.medical_books
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Staff can insert books" ON public.medical_books
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Staff can update books" ON public.medical_books
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Staff can delete books" ON public.medical_books
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- Holat ustunlarini faqat server (edge funksiya) o'zgartiradi.
CREATE OR REPLACE FUNCTION public.protect_book_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending';
      NEW.error_message := NULL;
      NEW.page_count := 0;
      NEW.chunk_count := 0;
      NEW.uploaded_by := auth.uid();
    ELSE
      NEW.status := OLD.status;
      NEW.error_message := OLD.error_message;
      NEW.page_count := OLD.page_count;
      NEW.chunk_count := OLD.chunk_count;
      NEW.storage_path := OLD.storage_path;
      NEW.uploaded_by := OLD.uploaded_by;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_book_status
  BEFORE INSERT OR UPDATE ON public.medical_books
  FOR EACH ROW EXECUTE FUNCTION public.protect_book_status();

-- ---------------------------------------------------------------------
-- Kitob bo'laklari (vektor qidiruv). To'g'ridan-to'g'ri o'qish yopiq:
-- faqat edge funksiya service role orqali ishlatadi.
-- ---------------------------------------------------------------------
CREATE TABLE public.book_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES public.medical_books(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  page_number int NOT NULL,
  content text NOT NULL,
  embedding extensions.vector(768) NOT NULL
);

GRANT ALL ON public.book_chunks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.book_chunks_id_seq TO service_role;

ALTER TABLE public.book_chunks ENABLE ROW LEVEL SECURITY;

CREATE INDEX book_chunks_book_id_idx ON public.book_chunks (book_id);
CREATE INDEX book_chunks_embedding_idx ON public.book_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_book_chunks(
  query_embedding extensions.vector(768),
  match_count int DEFAULT 6,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  id bigint,
  book_id uuid,
  book_title text,
  book_author text,
  page_number int,
  content text,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT c.id, c.book_id, b.title, b.author, c.page_number, c.content,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.book_chunks c
  JOIN public.medical_books b ON b.id = c.book_id AND b.status = 'ready'
  WHERE 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT LEAST(match_count, 12);
$$;

REVOKE EXECUTE ON FUNCTION public.match_book_chunks(extensions.vector, int, float) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_book_chunks(extensions.vector, int, float) TO service_role;

-- ---------------------------------------------------------------------
-- Ko'rik ko'rsatkichlari
-- ---------------------------------------------------------------------
CREATE TABLE public.health_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  metric text NOT NULL CHECK (metric IN (
    'bp_systolic', 'bp_diastolic', 'pulse', 'temperature', 'spo2',
    'glucose', 'weight', 'cholesterol', 'hemoglobin'
  )),
  value numeric NOT NULL CHECK (value > 0 AND value < 1000),
  unit text NOT NULL,
  note text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.health_measurements TO authenticated;
GRANT ALL ON public.health_measurements TO service_role;

ALTER TABLE public.health_measurements ENABLE ROW LEVEL SECURITY;

CREATE INDEX health_measurements_patient_idx
  ON public.health_measurements (patient_id, metric, measured_at DESC);

CREATE POLICY "Patients view own measurements" ON public.health_measurements
  FOR SELECT TO authenticated USING (auth.uid() = patient_id);

CREATE POLICY "Doctors view their patients measurements" ON public.health_measurements
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.consultations c
      JOIN public.doctors d ON d.id = c.doctor_id
      WHERE d.user_id = auth.uid() AND c.patient_id = health_measurements.patient_id
    )
  );

CREATE POLICY "Staff view all measurements" ON public.health_measurements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- Shifokor faqat o'z konsultatsiyasi bemori uchun yozadi.
CREATE POLICY "Doctors add measurements for own consultations" ON public.health_measurements
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      JOIN public.doctors d ON d.id = c.doctor_id
      WHERE c.id = health_measurements.consultation_id
        AND c.patient_id = health_measurements.patient_id
        AND d.id = health_measurements.doctor_id
        AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Doctors delete own measurements" ON public.health_measurements
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- ---------------------------------------------------------------------
-- AI statistikasi (maxfiylik uchun savol/javob matni saqlanmaydi)
-- ---------------------------------------------------------------------
CREATE TABLE public.ai_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  mode text NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat', 'trends')),
  triage text NOT NULL CHECK (triage IN ('emergency', 'doctor', 'self_care')),
  emergency_rule text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  source_count int NOT NULL DEFAULT 0,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_chat_logs TO authenticated;
GRANT ALL ON public.ai_chat_logs TO service_role;

ALTER TABLE public.ai_chat_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX ai_chat_logs_user_time_idx ON public.ai_chat_logs (user_id, created_at DESC);

CREATE POLICY "Users view own ai logs" ON public.ai_chat_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff view ai logs" ON public.ai_chat_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- ---------------------------------------------------------------------
-- PDF saqlash joyi (yopiq)
-- ---------------------------------------------------------------------
-- The private medical-books bucket is provisioned using the storage tool.

CREATE POLICY "Staff upload medical books" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical-books'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)));
CREATE POLICY "Staff read medical books" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'medical-books'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)));
CREATE POLICY "Staff delete medical books" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'medical-books'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)));
