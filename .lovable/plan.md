
## Diagnóstico Completo do Sistema

After reading all key files, here is a full engineering assessment with all improvements and the integration guide.

### Current State — What's Working
- Auth, routing, layouts, dark mode — solid
- All 10 pages exist with Supabase CRUD
- Kanban has `useDroppable`, sidebar is mobile-responsive
- Logs bug (Select value="") already fixed

### Missing & Broken — Critical Gaps

**1. Edge Functions ausentes** — `webhook-whatsapp` e `webhook-telegram` NÃO EXISTEM. Só existem `send-whatsapp` e `process-reminders`. Sem esses handlers, nenhuma mensagem do WhatsApp ou Telegram chega no sistema.

**2. Página de Lembretes ausente** — A tabela `reminders` existe, `process-reminders` edge function existe, mas não há UI para criar/editar/cancelar lembretes.

**3. `testConnection` é falso** — Simula com `setTimeout`, não testa de verdade. Deveria chamar a API real.

**4. Edge Function `generate-report` ausente** — Reports.tsx gera conteúdo localmente no frontend; não persiste via edge function.

**5. Seed de dados** — Dashboard sempre em zero para novos usuários.

---

## O que Implementar

### Grupo A — Edge Functions (backend real)

**`webhook-whatsapp`** — Recebe eventos da Evolution API e Meta Cloud:
- Valida assinatura HMAC-SHA256 do webhook secret
- Idempotência via `processed_webhook_events`
- Cria/atualiza `conversations` + insere `messages`
- Verifica whitelist
- Registra em `webhook_logs`

**`webhook-telegram`** — Recebe updates do Telegram Bot:
- Verifica token no header `X-Telegram-Bot-Api-Secret-Token`
- Cria/atualiza conversas com `provider=TELEGRAM`
- Insere mensagens
- Registra logs

**`generate-report`** — Agrega dados e salva relatório:
- Busca notas, tarefas e mensagens do período
- Gera conteúdo formatado
- Insere em `reports`

### Grupo B — UI Pages

**Página Lembretes `/app/reminders`**:
- Tabela com status badge (scheduled/sent/canceled/error)
- Formulário com título, mensagem, canal (whatsapp/telegram), telefone destino, data/hora
- `chrono-node` para parsing de linguagem natural ("amanhã às 10h")
- Cancelar lembrete (update status=canceled)

### Grupo C — Melhorias na página de Integrações

**`testConnection` real**:
- Evolution: `GET {api_url}/instance/connectionState/{instance_id}` com `apikey` header
- Telegram: `GET https://api.telegram.org/bot{token}/getMe`

**Guia visual de configuração**:
- Seção "Como Configurar" expansível com `Accordion`
- Evolution: passo a passo (URL, API Key, Instance ID, configurar webhook)
- Telegram: passo a passo (BotFather → token → configurar webhook)
- Botão "Configurar Webhook Automaticamente" para Telegram (chama `setWebhook` na API)

### Grupo D — Polish & Funcionalidade

**Seed automático no registro**: criar 2 notas + 2 tarefas de exemplo ao criar workspace

**NavBar**: adicionar Lembretes entre Tarefas e Relatórios

---

## Arquivos a Criar/Editar

```text
CRIAR:
  supabase/functions/webhook-whatsapp/index.ts   ← pipeline completo
  supabase/functions/webhook-telegram/index.ts   ← pipeline telegram
  supabase/functions/generate-report/index.ts    ← geração real de relatório
  src/pages/app/Reminders.tsx                    ← CRUD lembretes

EDITAR:
  src/pages/app/Integrations.tsx    ← teste real + guia + auto-webhook telegram
  src/pages/app/Reports.tsx         ← chamar edge function generate-report
  src/pages/auth/Register.tsx       ← seed automático após cadastro
  src/components/AppSidebar.tsx     ← adicionar Lembretes no nav
  src/App.tsx                       ← adicionar rota /app/reminders
```

---

## Guia de Configuração das Integrações

### Evolution API (WhatsApp)
```text
1. Ter uma instância Evolution API rodando (self-hosted ou cloud)
2. Preencher "URL da API": https://sua-evolution.com
3. Preencher "API Key": chave da instância
4. Preencher "Instance ID": nome da instância (ex: minha-instancia)
5. Preencher "Número": +55119999900000
6. Preencher "Webhook Secret": qualquer string segura
7. No painel da Evolution, configurar webhook:
   URL: https://qymbrzhrfcstvwkvrgnm.supabase.co/functions/v1/webhook-whatsapp
   Events: messages.upsert, connection.update
8. Ativar integração e clicar Salvar
```

### Telegram Bot
```text
1. Abrir @BotFather no Telegram
2. Enviar /newbot → definir nome e username
3. Copiar o token (ex: 123456789:ABCdef...)
4. Preencher "Bot Token" na integração
5. Clicar "Configurar Webhook Automaticamente" (ou manualmente:
   curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook
        -d url=https://qymbrzhrfcstvwkvrgnm.supabase.co/functions/v1/webhook-telegram)
6. Ativar integração e clicar Salvar
7. Enviar /start para o bot para obter o Chat ID (se quiser enviar mensagens pro bot)
```

---

## Execution Plan

1. Create `webhook-whatsapp` edge function — full 10-step pipeline
2. Create `webhook-telegram` edge function
3. Create `generate-report` edge function
4. Improve `Integrations.tsx` — real test + guide accordion + auto-configure webhook
5. Create `Reminders.tsx` page
6. Add reminders to sidebar + App.tsx routes
7. Update `Reports.tsx` to call edge function
8. Seed data on register
