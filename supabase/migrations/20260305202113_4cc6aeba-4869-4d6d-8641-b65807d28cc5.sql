
-- ============================================================
-- FUNÇÃO HELPER: atualizar updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- TABELA: workspaces
-- ============================================================
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: workspace_members
-- ============================================================
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Função security definer para verificar membership (evita recursão)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

-- Função para obter workspace do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_workspace_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = _user_id LIMIT 1;
$$;

-- ============================================================
-- TABELA: user_profiles (dados extras do usuário)
-- ============================================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABELA: integrations (WhatsApp + Telegram)
-- ============================================================
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('EVOLUTION','CLOUD','TELEGRAM')),
  api_url TEXT,
  api_key_encrypted TEXT,
  instance_id TEXT,
  phone_number TEXT,
  webhook_secret TEXT,
  telegram_bot_token_encrypted TEXT,
  telegram_chat_id TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: whitelist_numbers
-- ============================================================
CREATE TABLE public.whitelist_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, phone_e164)
);
ALTER TABLE public.whitelist_numbers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: conversations
-- ============================================================
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  provider TEXT DEFAULT 'WHATSAPP' CHECK (provider IN ('WHATSAPP','TELEGRAM')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: messages
-- ============================================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','audio','image','file')),
  body_text TEXT,
  media_url TEXT,
  provider_message_id TEXT,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: notes
-- ============================================================
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES public.messages(id),
  title TEXT,
  content TEXT,
  category TEXT,
  tags JSONB DEFAULT '[]',
  project TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABELA: attachments
-- ============================================================
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
  type TEXT,
  url TEXT,
  filename TEXT,
  mime TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: tasks
-- ============================================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  due_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  tags JSONB DEFAULT '[]',
  project TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABELA: reminders
-- ============================================================
CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT,
  message TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','telegram','email')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','canceled','error')),
  target_phone TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: reports
-- ============================================================
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('daily','weekly','monthly','custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: webhook_logs
-- ============================================================
CREATE TABLE public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  provider TEXT,
  event_type TEXT,
  payload_json JSONB,
  status TEXT DEFAULT 'ok' CHECK (status IN ('ok','error','auth_error','rate_limited')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: processed_webhook_events (idempotência)
-- ============================================================
CREATE TABLE public.processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id TEXT UNIQUE NOT NULL,
  workspace_id UUID,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: workspace_settings
-- ============================================================
CREATE TABLE public.workspace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_categories JSONB DEFAULT '["Trabalho","Pessoal","Ideia","Reunião"]',
  default_tags JSONB DEFAULT '["importante","urgente","revisão"]',
  bot_response_format TEXT DEFAULT 'medio' CHECK (bot_response_format IN ('curto','medio','detalhado')),
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  language TEXT DEFAULT 'pt-BR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_workspace_settings_updated_at
  BEFORE UPDATE ON public.workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- ÍNDICES OBRIGATÓRIOS
-- ============================================================
CREATE INDEX idx_messages_workspace ON public.messages(workspace_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_notes_workspace ON public.notes(workspace_id);
CREATE INDEX idx_tasks_workspace ON public.tasks(workspace_id);
CREATE INDEX idx_reminders_remind_at ON public.reminders(remind_at) WHERE status = 'scheduled';
CREATE INDEX idx_webhook_logs_workspace ON public.webhook_logs(workspace_id, created_at DESC);
CREATE INDEX idx_whitelist_workspace ON public.whitelist_numbers(workspace_id, phone_e164);
CREATE INDEX idx_conversations_workspace ON public.conversations(workspace_id);
CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);

-- ============================================================
-- RLS POLICIES — workspaces
-- ============================================================
CREATE POLICY "Membros podem ver seus workspaces"
  ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "Membros podem atualizar seus workspaces"
  ON public.workspaces FOR UPDATE
  USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "Qualquer usuário autenticado pode criar workspace"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- RLS POLICIES — workspace_members
-- ============================================================
CREATE POLICY "Membros podem ver membros do workspace"
  ON public.workspace_members FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Usuários autenticados podem inserir membership"
  ON public.workspace_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- RLS POLICIES — user_profiles
-- ============================================================
CREATE POLICY "Usuários podem ver seus perfis"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus perfis"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus perfis"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES — integrations
-- ============================================================
CREATE POLICY "Membros podem ver integrações"
  ON public.integrations FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir integrações"
  ON public.integrations FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar integrações"
  ON public.integrations FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar integrações"
  ON public.integrations FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — whitelist_numbers
-- ============================================================
CREATE POLICY "Membros podem ver whitelist"
  ON public.whitelist_numbers FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir na whitelist"
  ON public.whitelist_numbers FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar whitelist"
  ON public.whitelist_numbers FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar da whitelist"
  ON public.whitelist_numbers FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — conversations
-- ============================================================
CREATE POLICY "Membros podem ver conversas"
  ON public.conversations FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir conversas"
  ON public.conversations FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar conversas"
  ON public.conversations FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — messages
-- ============================================================
CREATE POLICY "Membros podem ver mensagens"
  ON public.messages FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir mensagens"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — notes
-- ============================================================
CREATE POLICY "Membros podem ver notas"
  ON public.notes FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir notas"
  ON public.notes FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar notas"
  ON public.notes FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar notas"
  ON public.notes FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — attachments
-- ============================================================
CREATE POLICY "Membros podem ver anexos"
  ON public.attachments FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir anexos"
  ON public.attachments FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar anexos"
  ON public.attachments FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — tasks
-- ============================================================
CREATE POLICY "Membros podem ver tarefas"
  ON public.tasks FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir tarefas"
  ON public.tasks FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar tarefas"
  ON public.tasks FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar tarefas"
  ON public.tasks FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — reminders
-- ============================================================
CREATE POLICY "Membros podem ver lembretes"
  ON public.reminders FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir lembretes"
  ON public.reminders FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar lembretes"
  ON public.reminders FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar lembretes"
  ON public.reminders FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — reports
-- ============================================================
CREATE POLICY "Membros podem ver relatórios"
  ON public.reports FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir relatórios"
  ON public.reports FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem deletar relatórios"
  ON public.reports FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- RLS POLICIES — webhook_logs
-- ============================================================
CREATE POLICY "Membros podem ver logs"
  ON public.webhook_logs FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service pode inserir logs"
  ON public.webhook_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service pode atualizar logs"
  ON public.webhook_logs FOR UPDATE
  USING (true);

-- ============================================================
-- RLS POLICIES — processed_webhook_events
-- ============================================================
CREATE POLICY "Service pode ler eventos processados"
  ON public.processed_webhook_events FOR SELECT
  USING (true);

CREATE POLICY "Service pode inserir eventos processados"
  ON public.processed_webhook_events FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- RLS POLICIES — workspace_settings
-- ============================================================
CREATE POLICY "Membros podem ver configurações"
  ON public.workspace_settings FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem inserir configurações"
  ON public.workspace_settings FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Membros podem atualizar configurações"
  ON public.workspace_settings FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================
-- TRIGGER: Auto-criar perfil ao registrar
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
