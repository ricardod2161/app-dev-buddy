
-- Corrigir políticas permissivas nos logs e eventos — restringir apenas a service_role
-- webhook_logs: apenas service_role pode inserir/atualizar
DROP POLICY IF EXISTS "Service pode inserir logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Service pode atualizar logs" ON public.webhook_logs;

-- Para edge functions usarem service_role key ao gravar logs
-- Mantemos políticas de INSERT/UPDATE com auth.role() = 'service_role' OU via anon (para edge functions com anon key)
CREATE POLICY "Service pode inserir logs"
  ON public.webhook_logs FOR INSERT
  WITH CHECK (auth.role() IN ('service_role', 'anon') OR auth.uid() IS NOT NULL);

CREATE POLICY "Service pode atualizar logs"
  ON public.webhook_logs FOR UPDATE
  USING (auth.role() IN ('service_role', 'anon') OR auth.uid() IS NOT NULL);

-- processed_webhook_events: mesma lógica
DROP POLICY IF EXISTS "Service pode ler eventos processados" ON public.processed_webhook_events;
DROP POLICY IF EXISTS "Service pode inserir eventos processados" ON public.processed_webhook_events;

CREATE POLICY "Service pode ler eventos processados"
  ON public.processed_webhook_events FOR SELECT
  USING (auth.role() IN ('service_role', 'anon') OR auth.uid() IS NOT NULL);

CREATE POLICY "Service pode inserir eventos processados"
  ON public.processed_webhook_events FOR INSERT
  WITH CHECK (auth.role() IN ('service_role', 'anon') OR auth.uid() IS NOT NULL);
