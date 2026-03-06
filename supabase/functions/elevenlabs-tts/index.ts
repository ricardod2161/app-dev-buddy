import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map ElevenLabs voice IDs → OpenAI TTS voice names
// User selected: Nova (feminina, clara) as default
const VOICE_MAP: Record<string, string> = {
  'FGY2WhTYpPnrIDTdsKH5': 'nova',    // Laura → Nova (feminina, clara) ← default
  'EXAVITQu4vr4xnSDxMaL': 'shimmer', // Sarah → Shimmer (feminina, calorosa)
  'Xb7hH8MSUJpSbSDYk0k2': 'alloy',   // Alice → Alloy (feminina, neutra)
  'XrExE9yKIg1WjnnlVkGX': 'alloy',   // Matilda → Alloy
  'cgSgspJ2msm6clMCkdW9': 'shimmer', // Jessica → Shimmer
  'nPczCjzI2devNBz1zQrb': 'echo',    // Brian → Echo (masculino)
  'JBFqnCBsd6RMkjVDRZzb': 'onyx',    // George → Onyx (masculino, profundo)
  'IKne3meq5aSn9XLyUdCD': 'echo',    // Charlie → Echo
  'TX3LPaxmHKxFdv7VOQHJ': 'echo',    // Liam → Echo
  'onwK4e9ZLuTAKqWW03F9': 'fable',   // Daniel → Fable (masculino, expressivo)
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
      console.error('TTS: LOVABLE_API_KEY não configurada')
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Map ElevenLabs voice_id → OpenAI TTS voice name
    const openaiVoice = (voice_id && VOICE_MAP[voice_id]) ?? DEFAULT_VOICE
    console.log(`TTS: voice_id=${voice_id} → openai_voice=${openaiVoice}`)

    // Limit text to avoid excessive usage
    const limitedText = text.slice(0, 4096)

    const response = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: limitedText,
        voice: openaiVoice,
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`TTS Gateway error: ${response.status}`, errText.slice(0, 500))
      return new Response(JSON.stringify({ error: `TTS gateway error: ${response.status}`, detail: errText.slice(0, 300) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const audioBuffer = await response.arrayBuffer()
    const base64 = base64Encode(audioBuffer)

    console.log(`TTS: áudio gerado com sucesso — ${audioBuffer.byteLength} bytes, voz=${openaiVoice}`)

    return new Response(
      JSON.stringify({ base64, content_type: 'audio/mpeg' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('elevenlabs-tts error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
