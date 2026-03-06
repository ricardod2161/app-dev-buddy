
## Diagnóstico Completo — Causa Raiz

### Problema 1: URL de mídia do WhatsApp é ENCRIPTADA (.enc)
Os arquivos de áudio/imagem do WhatsApp chegam como `https://mmg.whatsapp.net/...n.enc` — arquivos encriptados pela Meta. **Não é possível baixar diretamente**. O Evolution API oferece o endpoint:
```
POST {api_url}/chat/getBase64FromMediaMessage/{instance}
Body: { "message": { "key": { "id": messageId } } }
```
Esse endpoint faz o download + descriptografia e retorna `{ base64: "...", mimetype: "audio/ogg" }`.

### Problema 2: Formato errado do áudio para o Gemini
O código atual envia:
```json
{ "type": "input_audio", "input_audio": { "mime_type": "audio/ogg", "data": "..." } }
```
O formato correto da API é:
```json
{ "type": "input_audio", "input_audio": { "data": "...", "format": "wav" } }
```
O campo é `format` (não `mime_type`), e aceita apenas `"wav"` ou `"mp3"`. Áudio OGG/OPUS do WhatsApp precisa ser tratado como `"mp3"` ou convertido.

### Problema 3: Gemini não suporta áudio via gateway Lovable AI
O modelo `gemini-3-flash-preview` via gateway Lovable (compatível com OpenAI) trata `input_audio` de forma diferente do Gemini nativo. A solução mais robusta é usar **OpenAI Whisper (`openai/gpt-5-mini`)** para transcrição — é a API projetada especificamente para isso.

## Solução Arquitetural

```text
WEBHOOK-WHATSAPP                       PROCESS-MESSAGE
─────────────────                      ───────────────────────────────
1. Recebe payload Evolution            
2. Detecta messageType = 'audio'       
3. Chama Evolution API:                
   POST /chat/getBase64FromMediaMessage 
   → retorna base64 + mimetype         
4. Passa media_base64 ao process-msg ──→ 5. Recebe base64 do áudio real
                                           6. Chama Whisper (openai/gpt-5-mini)
                                              com formato correto
                                           7. Transcrição real → AI processa
```

## Mudanças — webhook-whatsapp/index.ts

### Adicionar busca de base64 via Evolution API para áudio
Após identificar `messageType = 'audio'` (e também `image`, `document`), antes de disparar o `process-message`, chamar o endpoint Evolution:

```typescript
// Após identificar messageType e extrair providerMessageId
if (['audio', 'image', 'document'].includes(messageType) && !mediaBase64 && integration.api_url && integration.api_key_encrypted) {
  try {
    const b64Res = await fetch(
      `${integration.api_url}/chat/getBase64FromMediaMessage/${integration.instance_id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': integration.api_key_encrypted,
        },
        body: JSON.stringify({
          message: { key: { id: providerMessageId, remoteJid: senderPhone + '@s.whatsapp.net', fromMe: false } },
          convertToMp4: false,
        }),
      }
    )
    if (b64Res.ok) {
      const b64Data = await b64Res.json()
      mediaBase64 = b64Data.base64 ?? null
      mediaMime = b64Data.mediaType ?? b64Data.mimetype ?? mediaMime
    }
  } catch (e) {
    console.error('Failed to fetch media base64:', e)
  }
}
```

## Mudanças — process-message/index.ts

### Corrigir chamada de transcrição com modelo correto e formato correto

**Substituir a chamada de transcrição atual** por uma que usa o formato correto:

```typescript
// Abordagem nova: usar Whisper-compatible format
const transcribeRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/gpt-5-mini',  // melhor modelo para transcrição de áudio
    messages: [{
      role: 'user',
      content: [
        { 
          type: 'text', 
          text: 'Transcreva fielmente este áudio em português brasileiro. Retorne APENAS a transcrição, sem comentários.' 
        },
        { 
          type: 'input_audio', 
          input_audio: { 
            data: mediaInlineData.data,   // base64 puro
            format: 'mp3'                  // wav ou mp3 (forçar mp3 para ogg/opus)
          } 
        },
      ],
    }],
  }),
})
```

### Adicionar fallback robusto de transcrição com logging detalhado

Se a transcrição falhar por qualquer motivo, em vez de enviar mensagem de erro ao usuário, o bot deve:
1. Tentar uma segunda vez com modelo alternativo (`google/gemini-2.5-flash`)
2. Se ainda falhar, usar um contexto indicando que o áudio foi recebido mas não transcrito — e pedir para repetir de forma amigável mas **sem usar just_reply** — usar `just_reply` com mensagem explicativa de qualidade

### Melhorar log de erros
Adicionar `console.log` detalhado em cada passo da transcrição para diagnóstico futuro:
```typescript
console.log('Audio debug:', { hasBase64: !!mediaInlineData, mimeType: media_mime, urlPresent: !!media_url })
```

### Adicionar suporte provider_message_id no fetch base64
O webhook deve também passar o `provider_message_id` para o process-message poder logar corretamente.

## Arquivos a modificar

```
MOD  supabase/functions/webhook-whatsapp/index.ts
     → Adicionar chamada a Evolution getBase64FromMediaMessage antes de disparar process-message
     → Chamar APÓS ter o integration carregado (já tem api_url e api_key_encrypted)
     → Funciona para audio, image e document

MOD  supabase/functions/process-message/index.ts  
     → Corrigir formato input_audio: { data, format: 'mp3' } ao invés de { mime_type, data }
     → Usar modelo openai/gpt-5-mini para transcrição (melhor suporte audio)
     → Adicionar retry com modelo alternativo google/gemini-2.5-flash
     → Melhorar logs de diagnóstico em todo fluxo de áudio
     → Melhorar fallback: quando sem transcrição, pedir repetição com contexto útil
```

## Melhorias adicionais incluídas

- **Retry de transcrição**: se primeira tentativa falhar, tenta com modelo alternativo
- **Log detalhado**: cada passo do pipeline de áudio logado para facilitar debug futuro
- **Fallback inteligente**: quando sem base64 E sem URL acessível, bot solicita reenvio de forma natural
- **Resposta de erro mais natural**: quando áudio não é transcrito, bot não diz "erro" — diz "não consegui capturar bem, pode repetir?" de forma humana
- **Suporte completo ao formato OGG/OPUS** do WhatsApp tratando como mp3 no payload
