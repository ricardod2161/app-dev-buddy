ALTER TABLE public.workspace_settings
  ADD COLUMN IF NOT EXISTS daily_briefing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_briefing_time text NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS daily_briefing_last_sent date;