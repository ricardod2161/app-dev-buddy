
## Analysis of current state

The bot already works (screenshot shows it creating notes from audio and text). What's missing to make it truly elite:

1. **No financial intelligence** — user sent "Anote uma rapadura e um doce 15 reais" → bot created "Rapadura e Doce" but didn't extract the financial value. When user asked "me der o relatório de quanto gastei hoje" → bot just said "Aqui estão suas notas de hoje:" but didn't compute a sum.

2. **No update/delete tools** — can't mark a task done, can't delete a reminder, can't edit a note via WhatsApp

3. **No search tool** — can't search notes by content/keyword

4. **No financial summary** — can't sum up expenses from notes tagged as financial

5. **No smart date awareness** — no awareness of today's date/time in the prompt

6. **No multi-action** — AI can only call ONE tool per message. If user says "Anote X e me lembra de Y", it picks one.

7. **No `bot_personality` / custom system prompt** — users can't tweak the bot's behavior text

8. **System prompt is weak** — doesn't instruct the AI to be proactive, spot patterns, give summaries intelligently

9. **No expense tracking intelligence** — when creating a financial note, should auto-extract: item name + value + category (Food, Transport, etc.)

10. **No welcome message** for new contacts

## What the "most intelligent and unique" assistant needs

### New Tools to add
- `search_notes` — search notes by keyword/date range
- `update_task_status` — mark task as done/in_progress via WhatsApp
- `financial_summary` — sum notes with monetary values for a given day/week/month, returning total spent
- `delete_reminder` — cancel a reminder
- `create_multiple` — create note + reminder simultaneously (multi-action workaround)

### System prompt overhaul
- Inject current date/time in timezone-aware format (already have timezone in settings)
- Add financial intelligence instructions: detect R$ amounts, extract item + value pairs
- Add proactive suggestions: "Você gastou R$35 hoje. Quer criar um orçamento?"
- Personality: more human, contextual, remembers things from this session

### Financial note enhancement
When `create_note` is called and content has R$ values:
- Auto-categorize as "Financeiro"
- Store structured content: `{ item: "rapadura", value: 10, item2: "doce", value2: 15, total: 25 }`

### `financial_summary` tool
- Fetches notes from `notes` table where category = 'Financeiro' (or tags contain 'gasto', 'despesa')
- Parses values from content using regex
- Returns formatted summary: "💰 *Gastos de hoje:*\n• Rapadura: R$10\n• Doce: R$15\n---\nTotal: *R$25,00*"

### Settings page: add "Bot Personality" textarea
Allow users to add a custom instruction appended to the system prompt (e.g., "Seja mais formal" or "Sempre dê dicas de economia").

## Files to modify

```text
MOD  supabase/functions/process-message/index.ts   ← new tools, smarter prompt, date injection, financial logic
MOD  src/pages/app/Settings.tsx                     ← add "Personalidade do Bot" textarea
MOD  src/types/database.ts                          ← add bot_personality field
NEW  supabase/migrations/...sql                     ← ADD COLUMN bot_personality to workspace_settings
```

## Detailed changes

### 1. Database migration
```sql
ALTER TABLE public.workspace_settings 
  ADD COLUMN IF NOT EXISTS bot_personality text DEFAULT NULL;
```

### 2. Settings UI
New card "Personalidade Personalizada" with a `<Textarea>` where user writes free-form instructions. Examples shown inline:
- "Seja mais formal e use linguagem profissional"
- "Sempre sugira formas de economizar quando registrar gastos"
- "Me chame pelo nome João"

### 3. process-message overhaul

**Smarter system prompt:**
```
Você é ${botName}, um assistente pessoal de elite integrado ao WhatsApp/Telegram.
Data/hora atual: ${now in user's timezone}
Você tem memória desta conversa e contexto completo do usuário.

## Inteligência Financeira
Quando o usuário mencionar gastos ou compras com valor (ex: "20 reais de lanche", "R$50 de gasolina"):
→ Use create_note com category="Financeiro", extraia item e valor no conteúdo em formato estruturado
→ Confirme: "✅ Registrado: Lanche - R$20,00"

## Contexto atual
- ${N} notas salvas | ${M} tarefas pendentes | ${K} lembretes agendados  
- Notas recentes: [lista]
- Tarefas em aberto: [lista]
- Próximos lembretes: [lista]

## Regras
- ${formatInstruction}
- Use SEMPRE português brasileiro
- Seja proativo: se detectar padrões, sugira ações
- Para múltiplas ações numa mensagem, priorize a mais importante e informe que pode fazer as outras
- ${bot_personality ?? ''}
```

**New tools:**
```
search_notes(query, date_from?, date_to?) → searches notes.title + notes.content ILIKE
update_task_status(task_title_or_id, new_status) → UPDATE tasks
financial_summary(period: 'hoje'|'semana'|'mes') → parses R$ from financial notes
list_reminders(status?) → lists upcoming/all reminders  
delete_note(title) → soft delete by title match
```

**Date injection:**
```typescript
const tz = settings?.timezone ?? 'America/Sao_Paulo'
const now = new Date().toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })
// → "quinta-feira, 6 de março de 2026 às 10:48"
```

**Financial parsing helper (in-function):**
```typescript
function extractFinancialValues(text: string): { items: {name: string, value: number}[], total: number }
// Regex: R?\$?\s*(\d+[,.]?\d*) → extract all monetary values
```

**`financial_summary` execution:**
```typescript
// Fetch notes from last N days with category Financeiro or containing R$
// Parse values from content
// Return formatted list + total
```

**`search_notes` execution:**
```typescript
await supabase.from('notes')
  .select('title, content, category, created_at')
  .eq('workspace_id', workspace_id)
  .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
  .order('created_at', { ascending: false })
  .limit(10)
```

**`update_task_status` execution:**
```typescript
// Search for task by title fuzzy match, then update status
```

**`list_reminders` execution:**
```typescript
await supabase.from('reminders')
  .select('title, remind_at, status, channel')
  .eq('workspace_id', workspace_id)
  .eq('status', 'scheduled')
  .gte('remind_at', new Date().toISOString())
  .order('remind_at')
  .limit(5)
```

### 4. Smarter context injection
Instead of just 5 recent notes, also fetch:
- Pending reminders count + next reminder
- Today's financial notes total (if any)

This gives AI a richer picture to respond with.

## Summary of improvements

| Feature | Before | After |
|---|---|---|
| Financial tracking | Creates generic note | Extracts values, categorizes as Financeiro, confirms with R$ amount |
| Reports | Just lists notes | Computes real totals per day/week/month |
| Task management | Create only | Create + mark done via WhatsApp |
| Date awareness | None | Full date/time in user's timezone in every prompt |
| Search | None | Search notes by keyword |
| Reminders | Create only | Create + list upcoming |
| Personality | Fixed | Customizable via Settings |
| Context | 5 notes + 5 tasks | Notes + tasks + reminders + today's spend total |
