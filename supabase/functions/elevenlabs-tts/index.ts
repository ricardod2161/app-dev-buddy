import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map ElevenLabs voice IDs → voice names for the API
const DEFAULT_VOICE_ID = 'FGY2WhTYpPnrIDTdsKH5' // Laura — feminina, clara (voz padrão Nova escolhida pelo usuário)

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

    // Use the new connector key (ELEVENLABS_API_KEY_1) with fallback to the original
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY_1') ?? Deno.env.get('ELEVENLABS_API_KEY')
    if (!ELEVENLABS_API_KEY) {
      console.error('[TTS] Nenhuma chave ElevenLabs encontrada')
      return new Response(JSON.stringify({ error: 'ElevenLabs API key não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const voiceId = voice_id ?? DEFAULT_VOICE_ID
    console.log(`[TTS] voice_id=${voiceId} | texto_len=${text.length}`)

    // Limit text to avoid excessive API usage
    const limitedText = text.slice(0, 3000)

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: limitedText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[TTS] ElevenLabs error ${response.status}:`, errText.slice(0, 500))
      return new Response(JSON.stringify({ error: `ElevenLabs error: ${response.status}`, detail: errText.slice(0, 300) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const audioBuffer = await response.arrayBuffer()
    const base64 = base64Encode(audioBuffer)

    console.log(`[TTS] Áudio gerado com sucesso — ${audioBuffer.byteLength} bytes`)

    return new Response(
      JSON.stringify({ base64, content_type: 'audio/mpeg' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[TTS] Erro inesperado:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
