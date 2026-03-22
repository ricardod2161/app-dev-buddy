CREATE TABLE public.user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  meta_diaria numeric NOT NULL DEFAULT 40.00,
  total_guardado_mes numeric NOT NULL DEFAULT 0.00,
  ultima_reserva_data date NULL,
  ultima_reserva_valor numeric NULL DEFAULT 40.00,
  mes_referencia text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workspace_id)
);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver memoria"
  ON public.user_memory FOR SELECT
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir memoria"
  ON public.user_memory FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar memoria"
  ON public.user_memory FOR UPDATE
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service pode gerenciar memoria"
  ON public.user_memory FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_user_memory_updated_at
  BEFORE UPDATE ON public.user_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();