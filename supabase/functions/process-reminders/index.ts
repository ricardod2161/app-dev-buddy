import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const now = new Date().toISOString()
    const { data: reminders } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'scheduled')
      .lte('remind_at', now)

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let processed = 0
    for (const reminder of reminders) {
      try {
        if (reminder.target_phone && reminder.workspace_id) {
          const reminderText = `⏰ Lembrete${reminder.title ? ': ' + reminder.title : ''}. ${reminder.message}`

          // 1. Send text message
          const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`
          const res = await fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
            body: JSON.stringify({ workspace_id: reminder.workspace_id, phone: reminder.target_phone, text: reminderText }),
          })

          if (res.ok) {
            await supabase.from('reminders').update({ status: 'sent' }).eq('id', reminder.id)

            // 2. Send TTS audio notification — only if tts_enabled in workspace settings
            try {
              const { data: wsSettings } = await supabase
                .from('workspace_settings')
                .select('tts_enabled, tts_voice_id')
                .eq('workspace_id', reminder.workspace_id)
                .maybeSingle()

              const ttsEnabled = (wsSettings as Record<string, unknown> | null)?.tts_enabled === true
              const ttsVoiceId = ((wsSettings as Record<string, unknown> | null)?.tts_voice_id as string) ?? 'nPczCjzI2devNBz1zQrb'

              if (ttsEnabled) {
                const ttsRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/elevenlabs-tts`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                  },
                  body: JSON.stringify({ text: reminderText, voice_id: ttsVoiceId }),
                })

                if (ttsRes.ok) {
                  const { base64, content_type } = await ttsRes.json()
                  await sendReminderAudio({
                    supabase,
                    workspace_id: reminder.workspace_id,
                    phone: reminder.target_phone,
                    base64,
                    content_type,
                  })
                } else {
                  console.warn('TTS for reminder failed:', ttsRes.status)
                }
              }
            } catch (ttsErr) {
              console.warn('TTS reminder audio failed (non-blocking):', ttsErr)
            }
          } else {
            await supabase.from('reminders').update({ status: 'error', error_message: 'Falha ao enviar' }).eq('id', reminder.id)
          }
        } else {
          await supabase.from('reminders').update({ status: 'sent' }).eq('id', reminder.id)
        }
        processed++
      } catch (e) {
        await supabase.from('reminders').update({ status: 'error', error_message: e.message }).eq('id', reminder.id)
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function sendReminderAudio({
  supabase,
  workspace_id,
  phone,
  base64,
  content_type,
}: {
  supabase: ReturnType<typeof createClient>
  workspace_id: string
  phone: string
  base64: string
  content_type: string
}) {
  try {
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('is_active', true)
      .in('provider', ['EVOLUTION', 'TELEGRAM'])
      .maybeSingle()

    if (!integration) {
      console.warn('sendReminderAudio: no active integration found')
      return
    }

    if (integration.provider === 'EVOLUTION') {
      await fetch(`${integration.api_url}/message/sendMedia/${integration.instance_id}`, {
        method: 'POST',
        headers: {
          apikey: (integration.api_key_encrypted as string) ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: phone,
          mediatype: 'audio',
          media: `data:${content_type};base64,${base64}`,
          mimetype: content_type,
        }),
      })
    } else if (integration.provider === 'TELEGRAM') {
      const chatId = phone.startsWith('tg:') ? phone.slice(3) : phone
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'audio/mpeg' })

      const form = new FormData()
      form.append('chat_id', chatId)
      form.append('voice', blob, 'lembrete.mp3')

      await fetch(`https://api.telegram.org/bot${integration.telegram_bot_token_encrypted}/sendVoice`, {
        method: 'POST',
        body: form,
      })
    }
  } catch (err) {
    console.warn('sendReminderAudio error:', err)
  }
}
