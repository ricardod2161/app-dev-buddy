import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessMessageBody {
  workspace_id: string
  conversation_id: string
  message_text: string | null
  sender_phone: string
  provider: 'EVOLUTION' | 'CLOUD' | 'TELEGRAM'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body: ProcessMessageBody = await req.json()
    const { workspace_id, conversation_id, message_text, sender_phone, provider } = body

    if (!message_text?.trim()) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch workspace settings for bot_response_format
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('bot_response_format, language')
      .eq('workspace_id', workspace_id)
      .maybeSingle()

    const responseFormat = settings?.bot_response_format ?? 'medio'

    const formatInstruction =
      responseFormat === 'curto'
        ? 'Responda de forma muito curta e direta (1-2 linhas).'
        : responseFormat === 'detalhado'
        ? 'Responda de forma detalhada e completa.'
        : 'Responda de forma média, clara e amigável.'

    const systemPrompt = `Você é um assistente inteligente integrado ao WhatsApp/Telegram de um usuário.
Analise a mensagem recebida e decida a ação correta:

- Se o usuário quer anotar, registrar ou salvar algo (palavras como "anote", "anota aí", "salva", "registra", "guarda", "nota") → use a função create_note
- Se o usuário quer criar uma tarefa, afazer ou lembrete de ação (palavras como "fazer", "preciso", "tarefa", "criar tarefa", "adiciona tarefa") → use a função create_task
- Para qualquer outra mensagem → use a função just_reply com uma resposta útil

${formatInstruction}
Responda SEMPRE em português brasileiro. Seja amigável e use emojis ocasionalmente.
Ao confirmar ações, mencione o que foi feito. Ex: "✅ Nota criada: [título]"`

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message_text },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'create_note',
              description: 'Cria uma nota com o conteúdo fornecido pelo usuário.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título curto e descritivo da nota' },
                  content: { type: 'string', description: 'Conteúdo completo da nota' },
                  category: { type: 'string', description: 'Categoria (ex: Trabalho, Pessoal, Ideia, Reunião)' },
                  reply_message: { type: 'string', description: 'Mensagem de confirmação para enviar ao usuário' },
                },
                required: ['title', 'content', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_task',
              description: 'Cria uma tarefa/afazer para o usuário.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título da tarefa' },
                  description: { type: 'string', description: 'Descrição detalhada da tarefa' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridade da tarefa' },
                  reply_message: { type: 'string', description: 'Mensagem de confirmação para enviar ao usuário' },
                },
                required: ['title', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'just_reply',
              description: 'Apenas responde ao usuário sem criar nota ou tarefa.',
              parameters: {
                type: 'object',
                properties: {
                  message: { type: 'string', description: 'Resposta para o usuário' },
                },
                required: ['message'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: 'required',
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      console.error('AI gateway error:', aiResponse.status, errText)
      throw new Error(`AI error ${aiResponse.status}: ${errText}`)
    }

    const aiData = await aiResponse.json()
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
    if (!toolCall) throw new Error('No tool call returned by AI')

    const fnName = toolCall.function.name
    const fnArgs = JSON.parse(toolCall.function.arguments)

    let replyText = ''

    if (fnName === 'create_note') {
      await supabase.from('notes').insert({
        workspace_id,
        title: fnArgs.title,
        content: fnArgs.content,
        category: fnArgs.category ?? 'Geral',
        source_message_id: null,
        tags: [],
      })
      replyText = fnArgs.reply_message ?? `✅ Nota criada: ${fnArgs.title}`
    } else if (fnName === 'create_task') {
      await supabase.from('tasks').insert({
        workspace_id,
        title: fnArgs.title,
        description: fnArgs.description ?? null,
        priority: fnArgs.priority ?? 'medium',
        status: 'todo',
      })
      replyText = fnArgs.reply_message ?? `✅ Tarefa criada: ${fnArgs.title}`
    } else {
      replyText = fnArgs.message ?? 'Olá! Como posso ajudar?'
    }

    // Send reply back to the user
    await sendReply({ supabase, provider, workspace_id, sender_phone, replyText })

    return new Response(JSON.stringify({ ok: true, action: fnName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('process-message error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function sendReply({
  supabase,
  provider,
  workspace_id,
  sender_phone,
  replyText,
}: {
  supabase: ReturnType<typeof createClient>
  provider: string
  workspace_id: string
  sender_phone: string
  replyText: string
}) {
  try {
    // Fetch the active integration for this workspace/provider
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      // Fallback: try any active integration for WhatsApp providers
      const { data: fallback } = await supabase
        .from('integrations')
        .select('*')
        .eq('workspace_id', workspace_id)
        .eq('is_active', true)
        .in('provider', ['EVOLUTION', 'CLOUD', 'TELEGRAM'])
        .maybeSingle()

      if (!fallback) {
        console.error('No active integration to send reply')
        return
      }
      await dispatchReply(fallback, sender_phone, replyText)
      return
    }

    await dispatchReply(integration, sender_phone, replyText)
  } catch (err) {
    console.error('sendReply error:', err)
  }
}

async function dispatchReply(
  integration: Record<string, unknown>,
  phone: string,
  text: string
) {
  const provider = integration.provider as string

  if (provider === 'EVOLUTION') {
    await fetch(`${integration.api_url}/message/sendText/${integration.instance_id}`, {
      method: 'POST',
      headers: {
        apikey: (integration.api_key_encrypted as string) ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: phone, text }),
    })
  } else if (provider === 'CLOUD') {
    await fetch(`https://graph.facebook.com/v19.0/${integration.phone_number}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${integration.api_key_encrypted}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    })
  } else if (provider === 'TELEGRAM') {
    const chatId = phone.startsWith('tg:') ? phone.slice(3) : phone
    await fetch(`https://api.telegram.org/bot${integration.telegram_bot_token_encrypted}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  }
}
