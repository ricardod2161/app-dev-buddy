import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? ''

const DAYS_PT = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function formatDatePt(date: Date): string {
  return `${DAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fetch all workspaces with daily_briefing_enabled = true
  const { data: settingsList, error: settingsErr } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('daily_briefing_enabled', true)

  if (settingsErr || !settingsList?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let processed = 0

  for (const settings of settingsList) {
    try {
      const timezone = settings.timezone ?? 'America/Sao_Paulo'
      const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
      const currentHHMM = `${String(nowInTz.getHours()).padStart(2, '0')}:${String(nowInTz.getMinutes()).padStart(2, '0')}`
      const todayDate = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`

      // Check if already sent today
      if (settings.daily_briefing_last_sent === todayDate) continue

      // Check time window: within 15 minutes of configured time
      const [confH, confM] = (settings.daily_briefing_time ?? '07:00').split(':').map(Number)
      const confMinutes = confH * 60 + confM
      const curMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes()
      if (curMinutes < confMinutes || curMinutes >= confMinutes + 15) continue

      const workspace_id = settings.workspace_id

      // Find phone to send to (most recent conversation OR most recent reminder)
      let targetPhone: string | null = null

      const { data: convs } = await supabase
        .from('conversations')
        .select('contact_phone')
        .eq('workspace_id', workspace_id)
        .order('last_message_at', { ascending: false })
        .limit(1)

      if (convs?.length) {
        targetPhone = convs[0].contact_phone
      } else {
        const { data: rems } = await supabase
          .from('reminders')
          .select('target_phone')
          .eq('workspace_id', workspace_id)
          .not('target_phone', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
        if (rems?.length) targetPhone = rems[0].target_phone
      }

      if (!targetPhone) continue

      // Fetch pending tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('title, due_at, priority')
        .eq('workspace_id', workspace_id)
        .in('status', ['todo', 'doing'])
        .order('due_at', { ascending: true })
        .limit(5)

      // Fetch today's reminders
      const todayStart = `${todayDate}T00:00:00`
      const todayEnd = `${todayDate}T23:59:59`
      const { data: todayReminders } = await supabase
        .from('reminders')
        .select('title, message, remind_at')
        .eq('workspace_id', workspace_id)
        .eq('status', 'scheduled')
        .gte('remind_at', todayStart)
        .lte('remind_at', todayEnd)
        .order('remind_at', { ascending: true })
        .limit(3)

      const botName = settings.bot_name ?? 'Assistente'
      const dateStr = formatDatePt(nowInTz)

      const taskList = tasks?.length
        ? tasks.map((t: { title: string; due_at: string | null; priority: string | null }) => {
            const due = t.due_at ? ` (vence ${new Date(t.due_at).toLocaleDateString('pt-BR')})` : ''
            return `- ${t.title}${due}`
          }).join('\n')
        : 'Nenhuma tarefa pendente'

      const reminderList = todayReminders?.length
        ? todayReminders.map((r: { title: string | null; message: string; remind_at: string }) => {
            const time = new Date(r.remind_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
            return `- ${r.title ?? r.message} às ${time}`
          }).join('\n')
        : 'Nenhum lembrete para hoje'

      // Generate humanized message via Lovable AI gateway
      const aiPrompt = `Você é ${botName}, assistente pessoal próximo e caloroso. Hoje é ${dateStr}.

Tarefas pendentes:
${taskList}

Lembretes de hoje:
${reminderList}

Gere uma mensagem de bom dia CURTA (máximo 4 linhas), muito humanizada e calorosa, como um amigo íntimo falaria. Mencione as tarefas e lembretes de forma natural. Termine com uma pergunta natural como "Por onde você quer começar?" ou "O que você quer priorizar hoje?". NÃO use emojis excessivos. Seja breve, natural e caloroso. Fale diretamente com o usuário (segunda pessoa).`

      let briefingText = ''
      try {
        const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: aiPrompt }],
            max_tokens: 300,
          }),
        })
        const aiData = await aiResp.json()
        briefingText = aiData?.choices?.[0]?.message?.content ?? ''
      } catch (_) {
        briefingText = `Bom dia! Hoje é ${dateStr}. Você tem ${tasks?.length ?? 0} tarefas pendentes. Por onde quer começar?`
      }

      if (!briefingText) {
        briefingText = `Bom dia! Hoje é ${dateStr}. Você tem ${tasks?.length ?? 0} tarefas pendentes. Por onde quer começar?`
      }

      // Determine provider from integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('workspace_id', workspace_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!integration) continue

      const provider = integration.provider as string

      // Send text message
      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ workspace_id, phone: targetPhone, text: briefingText }),
      })

      // Send audio if TTS enabled
      if (settings.tts_enabled && ELEVENLABS_API_KEY) {
        const voiceId = settings.tts_voice_id ?? 'nPczCjzI2devNBz1zQrb'
        try {
          const ttsResp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text: briefingText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed: 0.95 },
              }),
            }
          )

          if (ttsResp.ok) {
            const audioBuffer = await ttsResp.arrayBuffer()
            const base64Audio = base64Encode(audioBuffer)
            await sendBriefingAudio({ supabase, integration, provider, targetPhone, base64: base64Audio, content_type: 'audio/mpeg' })
          }
        } catch (ttsErr) {
          console.error('TTS error for daily briefing:', ttsErr)
        }
      }

      // Mark as sent today
      await supabase
        .from('workspace_settings')
        .update({ daily_briefing_last_sent: todayDate })
        .eq('workspace_id', workspace_id)

      processed++
    } catch (err) {
      console.error('Error processing workspace briefing:', err)
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function sendBriefingAudio({
  integration,
  provider,
  targetPhone,
  base64,
  content_type,
}: {
  supabase: ReturnType<typeof createClient>
  integration: Record<string, unknown>
  provider: string
  targetPhone: string
  base64: string
  content_type: string
}) {
  if (provider === 'EVOLUTION' || provider === 'CLOUD') {
    const apiUrl = integration.api_url as string
    const apiKey = integration.api_key_encrypted as string
    const instanceId = integration.instance_id as string

    await fetch(`${apiUrl}/message/sendWhatsAppAudio/${instanceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        number: targetPhone,
        audio: base64,
        encoding: true,
      }),
    })
  } else if (provider === 'TELEGRAM') {
    const token = integration.telegram_bot_token_encrypted as string
    const chatId = integration.telegram_chat_id as string ?? targetPhone

    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
    const blob = new Blob([bytes], { type: content_type })

    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('voice', blob, 'briefing.mp3')

    await fetch(`https://api.telegram.org/bot${token}/sendVoice`, { method: 'POST', body: form })
  }
}
