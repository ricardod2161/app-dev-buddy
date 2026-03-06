
## Root Cause Analysis

### Problem 1: Audio → Wrong AI behavior
The audio transcription works perfectly (logs confirm it). But the AI chose `just_reply` and gave a motivational comment. Root cause: the system prompt instruction for audio says "🎤 Áudio transcrito — trate como texto normal" but the AI doesn't know what to DO with a long philosophical speech. Fix: teach the AI that for audio content that isn't a command, it should summarize + ask what to do ("Quer criar uma nota? Uma tarefa?").

### Problem 2: Financial category mismatch — `Finanças` vs `Financeiro`
Database shows notes saved as `category: 'Finanças'` (with accent, plural) AND `category: 'Financeiro'`. The `financial_summary` dual-query only looks for `category = 'Financeiro'` or `content ILIKE '%reais%'`. Note "Rapadura e Doce" is `category: 'Geral'` (not caught). Note "Gasto com lanche" is `category: 'Finanças'` (not caught by exact match for 'Financeiro').

Fix: normalize category matching to catch all variants: `Financeiro`, `Finanças`, `Financeiras`, `financeiro`, etc.

### Problem 3: Note "Rapadura e Doce" → `category: Geral`
The `extractFinancialValues` / `hasFinancialContent` check runs in code but the DB shows `Geral`. The AI called `create_note` with `category: 'Geral'` and the auto-detect code at line 583 checked: `hasFinancialContent("Rapadura e Doce Rapadura e Doce - 15 reais")` — this SHOULD match "15 reais". But the DB shows Geral. Something broke between the code and the DB insert. Actually: looking at the DB entry: `content: "Rapadura e Doce - 15 reais"`. `hasFinancialContent` regex: `/R\$|reais|real|\d+\s*(reais|real)/i` — "15 reais" would match `\d+\s*(reais|real)`. So `finalCategory` = 'Financeiro', but the DB shows 'Geral'. This implies the code version that ran when the message was processed was the old code (before our update to fix categories). The current code SHOULD fix this going forward.

### Problem 4: `financial_summary` "Nenhum gasto"
When user asks "me der o relatório de quanto gastei hoje", the dual-query looks for:
- `category = 'Financeiro'` → finds nothing (because notes were saved as 'Finanças' or 'Geral')  
- `content ILIKE '%reais%'` → should find "Gasto com lanche" (content: "Gasto de 20 reais com lanche") and "Rapadura e Doce" (content: "Rapadura e Doce - 15 reais")

So the `untaggedNotes` query SHOULD find them. But wait — the query has `.neq('category', 'Financeiro')` which would include them. And then `.or('title.ilike.%reais%,...,content.ilike.%reais%,...)` — "20 reais" and "15 reais" in content would match. 

The real issue: dates. The notes from today exist. Unless the `dateFrom` calculation is wrong (timezone issue — server runs UTC, `todayStart.setHours(0,0,0,0)` uses server's local UTC midnight, but notes may be in a different timezone context).

Also a **critical bug** at line 674-733: `fnArgs.period` for financial_summary — the AI might be calling with `period: 'hoje'` but the `dateFrom` sets `setHours(0,0,0,0)` to UTC midnight. The notes `created_at: 2026-03-06 13:24:25+00` should be within today UTC. This should work.

Actually, looking more carefully: the `financial_summary` `untaggedNotes` query excludes `category = 'Financeiro'` via `.neq('category', 'Financeiro')`, which means it INCLUDES `category = 'Finanças'`. But the content filter: `title.ilike.%reais%,content.ilike.%reais%` — "Gasto de 20 reais com lanche" contains "reais", this should match.

Wait — the `or()` filter in Supabase has a specific syntax requirement: when combining with other chained `.eq()` or `.neq()` filters, the `or()` applies at the table level. The issue might be that `.neq('category', 'Financeiro')` AND `.or('...')` are being combined as AND conditions, which should work fine.

Let me check if it's a model issue. The AI model `google/gemini-2.5-flash` might sometimes fail to call `financial_summary` for "me der o relatório" — perhaps it's calling `list_notes` or `just_reply` instead.

### Core fixes needed:

1. **Upgrade model** from `google/gemini-2.5-flash` to `google/gemini-3-flash-preview` — smarter, better at tool selection
2. **Fix financial category normalization** — accept `Financeiro`, `Finanças`, `Financeiras` variants in both `create_note` detection and `financial_summary` query
3. **Audio handling behavior** — when audio transcription is a long speech (not a command), bot should summarize + offer to create note/task
4. **Add `save_audio_transcript` action** — dedicated tool for when user sends audio that should be saved as a note
5. **Improve system prompt audio instructions** — be specific: detect if audio is a command vs content to save
6. **Telegram audio support** — webhook-telegram currently ignores voice messages, add support
7. **`just_reply` anti-pattern for audio** — explicitly instruct AI that for audio messages, `just_reply` should only be used if the user is clearly asking a question with no actionable content
8. **Add `delete_note` tool** — referenced in plan but never implemented
9. **Multi-action support** — add `create_note_and_reminder` combined tool for "anote X e me lembra de Y" patterns
10. **Smart financial keywords** — teach AI to recognize "gastei", "comprei", "paguei", "custou" as financial triggers even without R$ symbol

## Files to Modify

```
MOD  supabase/functions/process-message/index.ts  ← main AI brain overhaul
MOD  supabase/functions/webhook-telegram/index.ts ← add voice/photo support
```

## Detailed Changes

### `process-message/index.ts`

**1. Model upgrade** (lines 222 and 370):
Change `google/gemini-2.5-flash` → `google/gemini-3-flash-preview` in both the transcription call and the main AI call.

**2. Fix financial detection** — expand `hasFinancialContent` and category normalization:
```typescript
function hasFinancialContent(text: string): boolean {
  return /R\$|reais|real|\d+\s*(reais|real)|gastei|comprei|paguei|custou|gasto de|compra de/i.test(text)
}

function normalizeFinancialCategory(cat: string | null): boolean {
  if (!cat) return false
  const lower = cat.toLowerCase()
  return lower.includes('financ') || lower.includes('gasto') || lower.includes('compra')
}
```

**3. Fix `financial_summary` dual-query** — instead of `neq('category', 'Financeiro')`, search ALL notes and deduplicate:
```typescript
// Single broader query — get all notes in period with any financial signal
const { data: allNotes } = await supabase
  .from('notes')
  .select('id, title, content, category, created_at')
  .eq('workspace_id', workspace_id)
  .gte('created_at', dateFrom.toISOString())
  .order('created_at', { ascending: false })

// Filter in-code for financial ones
const financialNotes = (allNotes ?? []).filter(n => {
  const isFinancialCat = normalizeFinancialCategory(n.category)
  const text = `${n.title} ${n.content}`
  return isFinancialCat || hasFinancialContent(text)
})
```

**4. Enhanced audio system prompt** — update audio instructions section:
```
## Tratamento de Áudio 🎤
Quando receber áudio transcrito:
- Se for um COMANDO (ex: "anota que...", "cria tarefa de...", "me lembra...") → execute o comando
- Se for CONTEÚDO para salvar (ex: reflexão, ideia, anotação falada) → use create_note e pergunte se confirma
- Se for uma PERGUNTA ou CONVERSA → responda normalmente com just_reply
- NUNCA apenas comente sobre o conteúdo sem oferecer uma ação

Para áudios longos (>200 palavras): sempre resuma no título da nota e coloque o conteúdo completo
```

**5. New `save_transcript` tool** — for long audio content:
```typescript
{
  name: 'save_transcript',
  description: 'Salva a transcrição de um áudio como nota. Use para áudios longos que não são comandos diretos.',
  parameters: {
    title: string,      // resumo curto do conteúdo
    transcript: string, // transcrição completa
    summary: string,    // resumo de 2-3 frases
    reply_message: string // confirmação + resumo para o usuário
  }
}
```

**6. Add `delete_note` tool**:
```typescript
{
  name: 'delete_note',
  description: 'Remove/deleta uma nota pelo título.',
  parameters: { note_title: string, reply_message: string }
}
```

**7. Improved financial auto-save** — in `create_note` execution, also normalize category:
```typescript
const isFinancial = normalizeFinancialCategory(fnArgs.category) || hasFinancialContent(`${fnArgs.title} ${fnArgs.content}`)
const finalCategory = isFinancial ? 'Financeiro' : (fnArgs.category ?? 'Geral')
```

**8. Enhanced system prompt financial section** — add keyword triggers:
```
Palavras que indicam gasto financeiro: "gastei", "comprei", "paguei", "custou", "vale", "valeu", "custa", "quanto fica", "me cobrou", "R$", "reais", "dinheiro"
```

### `webhook-telegram/index.ts`

Add voice/audio/photo extraction (Telegram file_id → download URL via getFile API):
```typescript
// After extracting messageText, also check for:
const voice = message.voice as Record<string, unknown>
const audio = message.audio as Record<string, unknown>  
const photo = (message.photo as Record<string, unknown>[])?.pop() // largest size
const document = message.document as Record<string, unknown>

let messageType = 'text'
let mediaFileId: string | null = null
let mediaMime: string | null = null

if (voice) { messageType = 'audio'; mediaFileId = voice.file_id as string; mediaMime = 'audio/ogg' }
else if (audio) { messageType = 'audio'; mediaFileId = audio.file_id as string; mediaMime = audio.mime_type as string ?? 'audio/mpeg' }
else if (photo) { messageType = 'image'; mediaFileId = photo.file_id as string; mediaMime = 'image/jpeg' }
else if (document) { messageType = 'document'; mediaFileId = document.file_id as string; mediaMime = document.mime_type as string }

// Resolve file_id → download URL
let mediaUrl: string | null = null
if (mediaFileId && integration.telegram_bot_token_encrypted) {
  const fileRes = await fetch(`https://api.telegram.org/bot${integration.telegram_bot_token_encrypted}/getFile?file_id=${mediaFileId}`)
  if (fileRes.ok) {
    const fileData = await fileRes.json()
    const filePath = fileData.result?.file_path
    if (filePath) mediaUrl = `https://api.telegram.org/file/bot${integration.telegram_bot_token_encrypted}/${filePath}`
  }
}
```

Pass `message_type`, `media_url`, `media_mime` to `process-message`.

## Summary of all improvements
| Issue | Root Cause | Fix |
|---|---|---|
| Audio → just comment | AI model + bad instructions | Upgrade model + explicit audio handling instructions + `save_transcript` tool |
| Financial "Nenhum gasto" | Category mismatch ('Finanças' ≠ 'Financeiro') + dual-query not broad enough | Single broad query + in-code filtering with `normalizeFinancialCategory()` |
| Notes saved as 'Geral' | AI not picking financial category | Better prompt + `hasFinancialContent` auto-override |
| Telegram ignores voice | Webhook doesn't extract audio | Add voice/photo/document extraction + getFile API |
| Old AI model | Using gemini-2.5-flash | Upgrade to gemini-3-flash-preview |
