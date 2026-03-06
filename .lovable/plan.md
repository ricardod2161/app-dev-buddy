
## What the user wants

When someone sends a WhatsApp/Telegram message like *"Anote aí 20 reais de lanche"*, the system should:
1. **Understand the intent with AI** (Gemini via Lovable AI gateway)
2. **Create a note automatically** in the database
3. **Reply on WhatsApp/Telegram** confirming the action

## Current state

- `webhook-whatsapp` and `webhook-telegram` receive messages, save to DB, but **do nothing else** — no NLP, no AI, no reply
- `send-whatsapp` exists and works to send messages back
- `LOVABLE_API_KEY` is already configured as a secret ✅
- Notes table exists in the database ✅
- workspace_settings has `bot_response_format` field ✅

## What needs to be built

### New edge function: `supabase/functions/process-message/index.ts`
A dedicated AI processing function that:
1. Receives `{ workspace_id, conversation_id, message_text, sender_phone, provider }`
2. Calls Lovable AI (Gemini 3 Flash Preview) with a smart system prompt
3. AI decides the intent and returns structured JSON via tool calling:
   - `create_note` → title + content + category
   - `create_task` → title + description + priority
   - `just_reply` → only sends a reply
4. Executes the action (insert note/task in DB)
5. Sends a reply back via `send-whatsapp` or Telegram API

### Update `webhook-whatsapp/index.ts`
After saving the incoming message, call `process-message` asynchronously (fire and forget via `fetch`) passing workspace/conversation/phone/text/provider.

### Update `webhook-telegram/index.ts`
Same — after saving, call `process-message` with provider `TELEGRAM` and chatId as the phone.

### Update `supabase/config.toml`
Add `[functions.process-message]` with `verify_jwt = false`.

## AI System Prompt (in Portuguese)
```
Você é um assistente inteligente que processa mensagens de WhatsApp/Telegram.
Analise a mensagem e decida:
- Se é um pedido para anotar algo (ex: "anote", "anota aí", "salva", "registra") → use create_note
- Se é uma tarefa/pedido (ex: "lembre", "fazer", "preciso") → use create_task  
- Caso contrário → use just_reply com uma resposta útil
Responda sempre em português brasileiro, de forma amigável e concisa.
```

## Tool calling schema
```json
tools: [
  { name: "create_note", params: { title, content, category } },
  { name: "create_task", params: { title, description, priority } },
  { name: "just_reply",  params: { message } }
]
```

## Files to create/modify

```text
NEW   supabase/functions/process-message/index.ts   ← AI brain
MOD   supabase/functions/webhook-whatsapp/index.ts  ← call process-message after saving
MOD   supabase/functions/webhook-telegram/index.ts  ← call process-message after saving
MOD   supabase/config.toml                          ← register new function
```

## Flow diagram

```text
WhatsApp msg in
      ↓
webhook-whatsapp
  saves message to DB
  calls process-message (async)
      ↓
process-message
  calls Gemini (Lovable AI)
  AI decides: create_note / create_task / just_reply
      ↓
  if create_note → INSERT into notes
  if create_task → INSERT into tasks  
  always → send reply via send-whatsapp / Telegram API
      ↓
User gets WhatsApp reply: "✅ Anotado: 20 reais de lanche"
```

No database migrations needed — notes and tasks tables already exist.
