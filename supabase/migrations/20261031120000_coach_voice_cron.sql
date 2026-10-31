-- MaxFitness ovozli murabbiy: har daqiqada faol rejalar uchun yetishmayotgan ovoz iboralarini yaratadi
-- (Gemini TTS bepul tarifi daqiqasiga ~3 so'rov). "coach-voice" bucket'ini funksiyaning o'zi yaratadi.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'maxhospital-coach-voice-warm';
  PERFORM cron.schedule('maxhospital-coach-voice-warm', '* * * * *',
    $job$ SELECT public.call_edge_function('coach-voice', '{"warm":true}'::jsonb) $job$);
END $$;
