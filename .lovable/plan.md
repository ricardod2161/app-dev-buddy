
## Diagnóstico Completo — Problemas Encontrados

### Problema Raiz (confirmado nos logs em tempo real):
```
2026-03-06T19:13:52Z ERROR ElevenLabs TTS error: 401
{"status":"detected_unusual_activity","message":"Unusual activity detected. Free Tier usage disabled..."}
```
**O ElevenLabs bloqueou a chave de API**. O TTS nunca gera áudio. Todos os outros passos funcionam (o bot responde em texto, transcreve áudio corretamente), mas a síntese de voz falha silenciosamente.

### Causa secundária:
O `process-message` captura o erro do TTS com `catch` mas só faz `console.warn` — o usuário nunca sabe que falhou, e não há fallback.

---

## O que será feito

### 1. Substituir ElevenLabs por OpenAI TTS via Lovable AI Gateway
O `LOVABLE_API_KEY` já está configurado no projeto. O gateway suporta o endpoint `/v1/audio/speech` (compatível com OpenAI TTS). Isso elimina a dependência do ElevenLabs completamente, sem precisar de chave externa.

**Vozes disponíveis mapeadas para as configurações salvas:**
```
Laura / FGY2WhTYpPnrIDTdsKH5  →  nova    (feminina, clara — selecionada)
Sarah / EXAVITQu4vr4xnSDxMaL  →  shimmer (feminina, calorosa)
Alice / Xb7hH8MSUJpSbSDYk0k2  →  alloy   (feminina, neutra)
Brian / nPczCjzI2devNBz1zQrb  →  echo    (masculino)
George / JBFqnCBsd6RMkjVDRZzb →  onyx    (masculino, profundo)
Daniel / onwK4e9ZLuTAKqWW03F9 →  fable   (masculino, expressivo)
Liam / TX3LPaxmHKxFdv7VOQHJ   →  echo    (masculino)
```

### 2. Corrigir `sendAudioReply` — formato do número
Evolution API espera número SEM o `+` (ex: `559882549505`, não `+559882549505`). O código atual passa `sender_phone` que vem com `+`. Isso pode fazer o envio falhar silenciosamente.

### 3. Adicionar logs detalhados no bloco TTS
Para nunca mais ficar no escuro sobre o que está falhando.

---

## Arquivos a modificar

```
MOD  supabase/functions/elevenlabs-tts/index.ts
  → Substituir chamada ElevenLabs → OpenAI TTS via https://ai.gateway.lovable.dev/v1/audio/speech
  → Mapear voice_id (ElevenLabs ID) → voz OpenAI (nova, shimmer, onyx, echo, alloy, fable)
  → Modelo: tts-1, formato mp3
  → Manter contrato de retorno igual: { base64, content_type }

MOD  supabase/functions/process-message/index.ts
  → Corrigir número de telefone no sendAudioReply: remover + antes de passar para Evolution
  → Adicionar console.log em cada etapa do TTS: ttsEnabled, shouldSendAudio, resultado da chamada TTS, resultado do sendAudioReply

MOD  src/pages/app/Settings.tsx
  → Atualizar label da seção para "Respostas em Áudio" (sem mencionar ElevenLabs)
  → As vozes continuam as mesmas — apenas o backend muda
```

O usuário selecionou **"Nova (feminina, clara)"** como voz, que corresponde a `tts_voice_id = FGY2WhTYpPnrIDTdsKH5` (Laura/ElevenLabs) → mapeada para `nova` no OpenAI TTS.
