ALTER TABLE public.webhook_logs 
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_action text,
  ADD COLUMN IF NOT EXISTS response_ms integer;

ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_logs;