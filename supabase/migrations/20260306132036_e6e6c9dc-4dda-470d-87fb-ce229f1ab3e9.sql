-- Remove the restrictive check constraint on conversations.provider
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_provider_check;

-- Add updated constraint that accepts all valid providers including EVOLUTION and CLOUD
ALTER TABLE public.conversations ADD CONSTRAINT conversations_provider_check 
  CHECK (provider IN ('WHATSAPP', 'TELEGRAM', 'EVOLUTION', 'CLOUD'));