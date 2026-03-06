import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map ElevenLabs voice IDs → OpenAI voice names (Lovable AI Gateway)
const VOICE_MAP: Record<string, string> = {
  'FGY2WhTYpPnrIDTdsKH5': 'nova',    // Laura/Nova  — feminina clara (padrão)
  'EXAVITQu4vr4xnSDxMaL': 'shimmer', // Sarah       — feminina suave
  'TX3LPaxmHKxFdv7VOQHJ': 'echo',    // Liam        — masculina jovem
  'nPczCjzI2devNBz1zQrb': 'echo',    // Brian       — masculina neutra
  'JBFqnCBsd6RMkjVDRZzb': 'onyx',    // George      — masculina grave
  'onwK4e9ZLuTAKqWW03F9': 'fable',   // Daniel      — masculina calorosa
  'Xb7hH8MSUJpSbSDYk0k2': 'alloy',   // Alice       — feminina versátil
  'CwhRBWXzGAHq8TQ4Fs17': 'onyx',    // Roger       — masculina profunda
}

const DEFAULT_VOICE = 'nova'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { text, voice_id } = await req.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'text é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      console.error('[TTS] LOVABLE_API_KEY não configurada')
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Map ElevenLabs voice_id → OpenAI voice name
    const selectedVoiceId = voice_id ?? 'FGY2WhTYpPnrIDTdsKH5'
    const openAIVoice = VOICE_MAP[selectedVoiceId] ?? DEFAULT_VOICE
    
    // Limit text to avoid excessive usage
    const limitedText = text.replace(/^\[Áudio\]:\s*/i, '').slice(0, 3000)

    console.log(`[TTS] voice_id=${selectedVoiceId} → openai_voice=${openAIVoice} | texto_len=${limitedText.length}`)

    // Call Lovable AI Gateway OpenAI TTS endpoint
    const response = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: openAIVoice,
        input: limitedText,
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[TTS] Gateway error ${response.status}:`, errText.slice(0, 500))
      return new Response(
        JSON.stringify({ error: `TTS gateway error: ${response.status}`, detail: errText.slice(0, 300) }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Gateway returns binary MP3 audio
    const audioBuffer = await response.arrayBuffer()
    const base64 = base64Encode(audioBuffer)

    console.log(`[TTS] Áudio gerado com sucesso via Lovable Gateway — ${audioBuffer.byteLength} bytes | voice=${openAIVoice}`)

    return new Response(
      JSON.stringify({ base64, content_type: 'audio/mpeg' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[TTS] Erro inesperado:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
