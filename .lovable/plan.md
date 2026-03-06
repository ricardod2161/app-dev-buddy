
## Objetivo
Tornar o bot significativamente mais inteligente e profissional, capaz de:
1. **Entender áudios** (transcrição via Gemini multimodal)
2. **Analisar imagens** (descrever e anotar automaticamente)
3. **Histórico de conversa** para respostas contextuais
4. **Mais ações**: criar lembretes, responder sobre notas/tarefas existentes
5. **Prompt de sistema melhorado** com personalidade profissional

## O que precisa ser feito

### 1. Webhooks: extrair mídia (áudio, imagem, documento)

**`webhook-whatsapp/index.ts`**
- Extrair `messageType` do payload Evolution/Meta: audio, image, document, sticker, video
- Extrair `media_url` quando disponível (Evolution retorna base64 ou URL em `data.message.audioMessage`, `imageMessage`, etc.)
- Passar `message_type`, `media_url`, `media_base64` para `process-message`

**`webhook-telegram/index.ts`**
- Extrair `voice`, `audio`, `photo`, `document` do payload Telegram
- Telegram retorna `file_id` → precisamos fazer fetch `getFile` para obter URL de download
- Passar tipo e URL para `process-message`

### 2. `process-message/index.ts` — Remodelação completa

**Interface expandida:**
```
ProcessMessageBody {
  workspace_id, conversation_id, message_text,
  sender_phone, provider,
  message_type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker'
  media_url?: string         // URL pública ou signed URL
  media_base64?: string      // base64 para Evolution
  media_mime?: string        // 'audio/ogg', 'image/jpeg' etc.
}
```

**Fluxo de processamento:**

```
1. Se audio/voice:
   → Gemini multimodal com inline_data base64 (audio/ogg)
   → Transcrever o áudio primeiro
   → Usar texto transcrito como input para o AI de intenção

2. Se image:
   → Gemini Vision com inline_data base64 (image/jpeg)
   → Descrever imagem + perguntar ao usuário o que fazer

3. Se document:
   → Extrair texto/resumo via Gemini

4. Se text (normal):
   → Fluxo atual
```

**Novo sistema de mensagens para o AI (multipart):**
```json
messages: [
  { role: "system", content: systemPrompt },
  { role: "user", content: [
      { type: "text", text: "Mensagem do usuário" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }  // se imagem
  ]}
]
```

**Histórico de conversa:**
- Buscar últimas 8 mensagens da tabela `messages` para a `conversation_id`
- Incluir no array `messages` do AI como contexto
- O AI pode responder "você me pediu pra anotar X antes" etc.

**Novas ferramentas (tools):**
- `create_note` (existente, melhorado)
- `create_task` (existente, melhorado)
- `create_reminder` → INSERT em `reminders` com data extraída via chrono-node no backend
- `list_notes` → busca notas recentes e retorna resumo
- `list_tasks` → busca tarefas pendentes
- `just_reply` (existente)

**Prompt de sistema melhorado:**
```
Você é um assistente pessoal inteligente integrado ao WhatsApp/Telegram.
Você tem memória de conversa, entende contexto, e ajuda a organizar a vida do usuário.
Você pode: criar notas, tarefas, lembretes, consultar registros existentes e responder perguntas.

Para áudios: você receberá a transcrição do áudio.
Para imagens: você receberá a descrição da imagem e pode sugerir ações.

Seja sempre amigável, use emojis com moderação, confirme ações realizadas.
Responda em português brasileiro.
```

### 3. Arquivos a modificar

```text
MOD  supabase/functions/webhook-whatsapp/index.ts   ← extrair mídia Evolution/Meta
MOD  supabase/functions/webhook-telegram/index.ts   ← extrair voz/foto/doc Telegram
MOD  supabase/functions/process-message/index.ts    ← tudo: multimodal, histórico, novas tools
```

### 4. Fluxo de áudio (Evolution API)

A Evolution retorna no payload:
```json
data.message.audioMessage.url  (URL da mídia)
data.message.base64             (base64 da mídia, se configurado)
```
→ Enviamos o base64 para Gemini como `inline_data`:
```json
{ "inline_data": { "mime_type": "audio/ogg", "data": "<base64>" } }
```
O Gemini 2.5 Flash/Pro consegue transcrever áudios nesse formato.

### 5. Fluxo de imagem

Evolution retorna:
```json
data.message.imageMessage.url
data.message.base64
data.message.imageMessage.caption  (legenda da foto)
```
→ Enviamos como `image_url` com `data:image/jpeg;base64,...`
→ O AI descreve e decide a ação (anotar, criar tarefa, responder)

### Nenhuma migração de banco necessária
A tabela `reminders` já existe. A tabela `messages` já tem `media_url`. O campo `type` em messages já aceita string livre.
