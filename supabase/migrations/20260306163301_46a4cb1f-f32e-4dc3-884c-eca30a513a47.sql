ALTER TABLE public.workspace_settings
  ADD COLUMN IF NOT EXISTS tts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tts_voice_id text NOT NULL DEFAULT 'nPczCjzI2devNBz1zQrb';