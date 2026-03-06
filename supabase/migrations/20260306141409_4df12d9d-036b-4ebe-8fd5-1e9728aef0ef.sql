CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  name text NOT NULL,
  notes text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, phone_e164)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver contatos"
  ON public.contacts FOR SELECT
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir contatos"
  ON public.contacts FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar contatos"
  ON public.contacts FOR UPDATE
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar contatos"
  ON public.contacts FOR DELETE
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_contacts_workspace_phone ON public.contacts(workspace_id, phone_e164);