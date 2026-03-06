## O que o usuário quer

Duas funcionalidades integradas:

1. **Respostas em áudio via voz (ElevenLabs TTS)** — quando o usuário enviar uma mensagem de texto ou áudio no WhatsApp/Telegram, o bot responde também com um áudio de voz sintetizada pela ElevenLabs.
2. **Notificações de lembretes em áudio** — quando um lembrete vence (executado pelo `process-reminders`), além do texto, envia um áudio de voz com a mensagem do lembrete.

---

## Arquitetura

```text
NOVO: supabase/functions/elevenlabs-tts/index.ts
  ← Recebe { text, voice_id? } → chama ElevenLabs TTS API → retorna audio/mpeg

process-message/index.ts (MOD)
  ← Após montar replyText, chama elevenlabs-tts
  ← Envia áudio via Evolution sendAudio / Telegram sendVoice
  ← Envia também o texto (fallback visual)

process-reminders/index.ts (MOD)
  ← Gera áudio TTS para cada lembrete via elevenlabs-tts
  ← Envia áudio via Evolution sendAudio / Telegram sendVoice
  ← Mantém envio de texto como fallback
```

---

## Passos

### 1. Precisamos do ELEVENLABS_API_KEY

O sistema ainda não tem essa secret configurada (não aparece na lista de secrets existentes). Precisaremos pedi-la ao usuário.

### 2. Nova edge function: `elevenlabs-tts`

Arquivo: `supabase/functions/elevenlabs-tts/index.ts`

- Recebe `{ text: string, voice_id?: string }`
- Chama `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`
- Retorna o áudio em `base64` + `content_type` em JSON (para facilitar envio via WhatsApp/Telegram)
- Voice ID padrão: `nPczCjzI2devNBz1zQrb` (Brian — voz masculina natural)
- Registrar `verify_jwt = false` no config.toml

### 3. Nova função de envio de áudio: `sendAudioReply`

Nos arquivos `process-message` e `process-reminders`, criar uma função `sendAudioReply` que:

**Para Evolution API:**

```
POST {api_url}/message/sendMedia/{instance}
Body: {
  number: phone,
  mediatype: "audio",
  media: "data:audio/mpeg;base64,{base64}",
  mimetype: "audio/mpeg"
}
```

**Para Telegram:**

```
POST https://api.telegram.org/bot{token}/sendVoice
Body: {
  chat_id: phone,
  voice: "data:audio/ogg;base64,{base64}"   ← via InputFile / URL
}
```

> Para Telegram é necessário enviar como arquivo. Usaremos `sendVoice` com `voice` como URL pública — mas como não temos storage público, vamos enviar como `voice` com multipart ou armazenar temporariamente no Supabase Storage. **Solução mais simples**: para Telegram, enviar o áudio como mensagem de voz via upload multipart (`FormData`).

**Para CLOUD (Meta):**
Meta Cloud API suporta `type: "audio"` com `link` para URL pública. Sem storage público disponível ainda, faremos fallback de texto para Cloud + Evolution enviaremos o base64 diretamente.

### 4. Modificar `process-message/index.ts`

Após a linha `sendReply(...)` (texto), adicionar chamada opcional de TTS:

```typescript
// Gerar e enviar áudio de resposta (opcional, não bloquear se falhar)
try {
  const ttsRes = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ text: replyText }),
  })
  if (ttsRes.ok) {
    const { base64, content_type } = await ttsRes.json()
    await sendAudioReply({ integration, phone: sender_phone, base64, content_type })
  }
} catch (e) {
  console.warn('TTS optional step failed, skipping:', e)
}
```

### 5. Modificar `process-reminders/index.ts`

Para cada lembrete, após enviar o texto, gerar áudio:

```typescript
const reminderText = `⏰ Lembrete${reminder.title ? ': ' + reminder.title : ''}. ${reminder.message}`
// 1. Envia texto (atual)
// 2. Gera TTS e envia áudio
```

### 6. Configuração do config.toml

Adicionar:

```toml
[functions.elevenlabs-tts]
verify_jwt = false
```

---

## Resumo dos arquivos

```
NEW  supabase/functions/elevenlabs-tts/index.ts
MOD  supabase/functions/process-message/index.ts   ← envio de áudio após texto
MOD  supabase/functions/process-reminders/index.ts ← notificação em áudio
MOD  supabase/config.toml                          ← verify_jwt para nova função
```

---

## Pré-requisito: API Key da ElevenLabs

O usuário precisa fornecer a API Key da ElevenLabs. Para obtê-la:

1. Acesse [elevenlabs.io](https://elevenlabs.io) → Sign In
2. Vá em **Profile → API Keys**
3. Copie ou gere uma nova chave

A chave será armazenada com segurança como secret `ELEVENLABS_API_KEY`.

**Nota importante**: O plano gratuito do ElevenLabs oferece 10.000 caracteres/mês. Para uso intenso, um plano pago é recomendado. mais so quero que responda em audio quando eu pedir em áudio 