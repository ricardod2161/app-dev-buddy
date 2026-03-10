
## Análise completa do sistema

### Situação atual dos logs
A tabela `webhook_logs` armazena: `provider`, `event_type`, `status`, `error`, `payload_json`. **Não há nenhuma coluna para dados de IA** (modelo usado, tempo de resposta, ação executada). Isso precisa ser adicionado.

### O que vai ser feito

---

**1. Migração SQL — adicionar colunas AI ao `webhook_logs`**

```sql
ALTER TABLE public.webhook_logs 
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_action text,
  ADD COLUMN IF NOT EXISTS response_ms integer;
```

- `ai_model`: qual modelo foi usado (`google/gemini-3-flash-preview`, `google/gemini-2.5-pro`, etc.)
- `ai_action`: ferramenta chamada (`create_note`, `delete_task`, `just_reply`, etc.)
- `response_ms`: tempo total de processamento em ms

---

**2. `supabase/functions/process-message/index.ts` — gravar métricas AI**

Adicionar `startTime = Date.now()` no início do processamento. Após o AI call, antes do `sendReply`, fazer um `UPDATE` no `webhook_log` correspondente com:
```typescript
// No final do processamento bem-sucedido:
await supabase.from('webhook_logs')
  .update({ 
    ai_model: usedModel,
    ai_action: fnName,
    response_ms: Date.now() - startTime
  })
  .eq('id', logId)  // logId é passado no body pelo webhook-whatsapp
```

O `logId` já é criado no `webhook-whatsapp/index.ts` e passado para `process-message` como parte do body — precisamos adicioná-lo ao body do `ProcessMessageBody` interface.

---

**3. `src/pages/app/Logs.tsx` — painel de AI em tempo real**

Transformar a página com **duas abas** via `<Tabs>`:

**Aba 1: "Webhooks"** — tabela existente (mantida igual)

**Aba 2: "IA em Tempo Real"** — novo painel com:
- Cards de estatísticas no topo:
  - Total de mensagens processadas (hoje)
  - Tempo médio de resposta (ms → exibir como "2.3s")
  - Modelo mais usado
  - Ação mais frequente
- Tabela com colunas: Data/Hora | Provider | Ação IA | Modelo | Tempo
- Realtime subscription via Supabase channel em `webhook_logs` — ao chegar novo log com `ai_action` preenchido, invalida a query automaticamente
- Badge colorido por ação: `create_note` (azul), `create_task` (verde), `delete_*` (vermelho), `just_reply` (cinza), `weekly_summary` (roxo), etc.
- Badge colorido por modelo: flash (amarelo), pro (azul), flash-lite (cinza)

---

**4. Melhorias gerais identificadas no sistema**

Enquanto analiso os arquivos, identifico mais oportunidades:

**a) `webhook-whatsapp/index.ts`**: O `logId` já existe mas **não é passado para `process-message`**. O process-message não consegue atualizar o log com dados AI. Precisamos passar `log_id` no body do `fetch` para `process-message`.

**b) `src/types/database.ts`**: Adicionar as 3 novas colunas ao `WebhookLog` interface.

**c) `src/pages/app/Logs.tsx`**: Adicionar Realtime subscription para auto-refresh — atualmente a lista só atualiza no reload.

**d) `webhook-telegram/index.ts`**: Mesma correção de passar `log_id` para o process-message.

---

### Arquivos alterados

```
NEW migration              — ADD COLUMN ai_model, ai_action, response_ms
MOD webhook-whatsapp       — passar log_id no body para process-message
MOD webhook-telegram       — idem
MOD process-message        — receber log_id, gravar startTime, UPDATE webhook_log com métricas AI
MOD src/types/database.ts  — adicionar ai_model, ai_action, response_ms ao WebhookLog
MOD src/pages/app/Logs.tsx — duas abas: Webhooks + IA em Tempo Real com stats, tabela e Realtime
```
