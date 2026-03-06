
## Complete System Audit — Findings & Fix Plan

### What the logs revealed (confirmed with live testing)

**Text messages: WORKING perfectly**
- `process-message` executes correctly: AI responds, saves to DB, sends reply via Evolution API
- Confirmed: `just_reply` → status 200, message saved to DB

**Audio TTS: FAILING with ONE specific error**
```
[TTS] Falha na geração de áudio: status=502
{"error":"ElevenLabs error: 401",
 "detail":"Unusual activity detected. Free Tier usage disabled..."}
```

**Root cause:** ElevenLabs is blocking **both** API keys (`ELEVENLABS_API_KEY` and `ELEVENLABS_API_KEY_1`) because Supabase Edge Function servers are in a datacenter — ElevenLabs treats this as a "proxy/VPN" and blocks Free Tier usage. The Standard Connector key also fails for the same reason.

**ElevenLabs only offers a paid plan to bypass this.** Since ElevenLabs is not viable without a paid account, the fix is to replace TTS with the **Lovable AI Gateway** using the `google/gemini-3-pro-image-preview` model which supports multimodal output including audio generation, OR more reliably use the `/v1/audio/speech` OpenAI TTS endpoint which IS documented as supported by the gateway — the previous attempt failed because the wrong model name was used (`tts-1` is correct, but was tested against wrong endpoint path).

The most reliable solution confirmed by the stack overflow context: rebuild `elevenlabs-tts` to call the Lovable AI Gateway with OpenAI's TTS endpoint correctly — `https://ai.gateway.lovable.dev/v1/audio/speech` with model `tts-1` and voice `nova`. The previous attempt at this failed because `base64` field name was wrong (`audio` vs `base64`).

**Secondary issue found:** The `dispatchReply` function in `process-message` sends text replies but the logs show no delivery errors — text IS reaching Evolution API. However, for audio, `sendWhatsAppAudio` requires the phone in format `559882549505` (no `+`), and the `+` is being correctly stripped. The audio fails only because ElevenLabs returns 401.

---

## Files to modify

```
MOD  supabase/functions/elevenlabs-tts/index.ts
  → Replace ElevenLabs API call with Lovable AI Gateway OpenAI TTS
  → Endpoint: https://ai.gateway.lovable.dev/v1/audio/speech
  → Model: tts-1, voice: nova (mapped from voice_id)
  → The gateway returns binary audio — read as arrayBuffer → base64
  → Return { base64, content_type: 'audio/mpeg' } (same contract, no code change needed elsewhere)

MOD  supabase/functions/process-message/index.ts
  → Fix: the `dispatchReply` function does NOT await the Evolution fetch response → errors silently
  → Add response check + log for text message delivery (currently fire-and-forget)
  → Improve the `userRequestedAudio` regex to catch "manda áudio", "responde em áudio", "me manda áudio"
  → Fix: when TTS fails (502/401), send a fallback text message telling the user TTS is unavailable instead of silently doing nothing
  → Add `provider_message_id` field to OUT messages to avoid confusion in idempotency check
```

### Voice mapping (ElevenLabs ID → OpenAI voice)
```text
FGY2WhTYpPnrIDTdsKH5 (Laura/Nova)  → nova
EXAVITQu4vr4xnSDxMaL (Sarah)       → shimmer
TX3LPaxmHKxFdv7VOQHJ (Liam)        → echo
nPczCjzI2devNBz1zQrb (Brian)        → echo
JBFqnCBsd6RMkjVDRZzb (George)      → onyx
onwK4e9ZLuTAKqWW03F9 (Daniel)       → fable
Xb7hH8MSUJpSbSDYk0k2 (Alice)       → alloy
```

### Confirmed flow after fix
```text
User sends audio/text requesting audio
  → webhook-whatsapp (200 OK) ✅ already working
  → process-message: AI reply generated ✅ already working
  → elevenlabs-tts (now → Lovable Gateway OpenAI TTS /v1/audio/speech)
      → returns binary MP3 as arrayBuffer → base64
  → sendAudioReply → Evolution sendWhatsAppAudio (phone=559882549505, no +) ✅
  → WhatsApp delivers PTT voice note ✅
```
