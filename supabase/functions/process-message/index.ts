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
  message_type?: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker'
  media_url?: string | null
  media_base64?: string | null
  media_mime?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body: ProcessMessageBody = await req.json()
    const {
      workspace_id,
      conversation_id,
      message_text,
      sender_phone,
      provider,
      message_type = 'text',
      media_url,
      media_base64,
      media_mime,
    } = body

    // Skip stickers silently
    if (message_type === 'sticker') {
      return new Response(JSON.stringify({ ok: true, skipped: 'sticker' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // For text messages, require non-empty text
    if (message_type === 'text' && !message_text?.trim()) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    // ── 1. Fetch workspace settings ──────────────────────────────────────────
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('bot_response_format, language, timezone')
      .eq('workspace_id', workspace_id)
      .maybeSingle()

    const responseFormat = settings?.bot_response_format ?? 'medio'
    const formatInstruction =
      responseFormat === 'curto'
        ? 'Responda de forma muito curta e direta (1-2 linhas).'
        : responseFormat === 'detalhado'
        ? 'Responda de forma detalhada e completa, com exemplos quando útil.'
        : 'Responda de forma clara, objetiva e amigável.'

    // ── 2. Fetch conversation history (last 10 messages) ────────────────────
    const { data: historyRows } = await supabase
      .from('messages')
      .select('direction, body_text, type, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const history = (historyRows ?? []).reverse()

    // ── 3. Fetch recent notes and tasks for context ──────────────────────────
    const [{ data: recentNotes }, { data: pendingTasks }] = await Promise.all([
      supabase
        .from('notes')
        .select('id, title, category, created_at')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('tasks')
        .select('id, title, status, priority, due_at')
        .eq('workspace_id', workspace_id)
        .in('status', ['todo', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    // ── 4. Handle multimodal content ─────────────────────────────────────────
    let effectiveText = message_text
    let mediaInlineData: { mime_type: string; data: string } | null = null
    let mediaDownloadUrl: string | null = media_url ?? null

    // If we have a URL but no base64, try to fetch and convert to base64
    if ((message_type === 'audio' || message_type === 'image' || message_type === 'document') && !media_base64 && mediaDownloadUrl) {
      try {
        const mediaRes = await fetch(mediaDownloadUrl)
        if (mediaRes.ok) {
          const buffer = await mediaRes.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          const b64 = btoa(binary)
          mediaInlineData = {
            mime_type: media_mime ?? (message_type === 'audio' ? 'audio/ogg' : message_type === 'image' ? 'image/jpeg' : 'application/octet-stream'),
            data: b64,
          }
        }
      } catch (e) {
        console.error('Failed to fetch media for inline processing:', e)
      }
    } else if (media_base64) {
      mediaInlineData = {
        mime_type: media_mime ?? (message_type === 'audio' ? 'audio/ogg' : 'image/jpeg'),
        data: media_base64,
      }
    }

    // ── 5. Transcribe audio if needed ────────────────────────────────────────
    if (message_type === 'audio' && mediaInlineData) {
      try {
        const transcribeRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Transcreva este áudio fielmente em português. Retorne APENAS a transcrição, sem comentários.' },
                  { type: 'input_audio', input_audio: mediaInlineData },
                ],
              },
            ],
          }),
        })
        if (transcribeRes.ok) {
          const transcribeData = await transcribeRes.json()
          const transcription = transcribeData.choices?.[0]?.message?.content?.trim()
          if (transcription) {
            effectiveText = `[Áudio transcrito]: ${transcription}`
            console.log('Audio transcribed:', effectiveText)
          }
        }
      } catch (e) {
        console.error('Audio transcription failed:', e)
        effectiveText = '[Áudio recebido - transcrição indisponível]'
      }
    }

    // If still no effective text for non-text messages, provide a description
    if (!effectiveText) {
      const typeLabels: Record<string, string> = {
        image: '[Imagem recebida]',
        document: '[Documento recebido]',
        video: '[Vídeo recebido]',
        audio: '[Áudio recebido]',
      }
      effectiveText = typeLabels[message_type] ?? '[Mídia recebida]'
    }

    // ── 6. Build context summary for system prompt ───────────────────────────
    const notesContext = recentNotes?.length
      ? `\nNotas recentes: ${recentNotes.map((n) => `"${n.title}" (${n.category ?? 'Geral'})`).join(', ')}`
      : ''
    const tasksContext = pendingTasks?.length
      ? `\nTarefas pendentes: ${pendingTasks.map((t) => `"${t.title}" [${t.priority ?? 'medium'}]${t.due_at ? ` vence ${new Date(t.due_at).toLocaleDateString('pt-BR')}` : ''}`).join(', ')}`
      : ''

    // ── 7. Build system prompt ───────────────────────────────────────────────
    const systemPrompt = `Você é um assistente pessoal inteligente e profissional integrado ao WhatsApp/Telegram do usuário.
Seu nome é **Assistente IA** e você ajuda a organizar a vida do usuário de forma eficiente.

## Suas Capacidades
- Criar notas e anotações (palavras-chave: "anote", "salva", "guarda", "registra", "nota")
- Criar tarefas e afazeres (palavras-chave: "tarefa", "fazer", "preciso fazer", "adiciona", "todo")
- Criar lembretes com data/hora (palavras-chave: "lembre", "me lembra", "lembrete", "avisa", "remind")
- Listar notas existentes (palavras-chave: "minhas notas", "ver notas", "quais notas", "lista notas")
- Listar tarefas pendentes (palavras-chave: "minhas tarefas", "o que tenho pra fazer", "pendências")
- Responder perguntas e conversar normalmente

## Contexto do Usuário${notesContext}${tasksContext}

## Tipo da Mensagem Atual
${message_type === 'audio' ? '🎤 Mensagem de áudio (você receberá a transcrição)' : ''}
${message_type === 'image' ? '📷 Imagem (você analisará e decidirá a ação mais útil)' : ''}
${message_type === 'document' ? '📄 Documento enviado pelo usuário' : ''}
${message_type === 'text' ? '💬 Mensagem de texto' : ''}

## Regras
- ${formatInstruction}
- Responda SEMPRE em português brasileiro
- Seja amigável, natural e use emojis com moderação (1-2 por mensagem)
- Ao confirmar ações, mencione o que foi feito: "✅ Nota criada: [título]"
- Se o usuário perguntar sobre notas/tarefas existentes, use as funções list_notes/list_tasks
- Para lembretes, extraia a data/hora do texto e use ISO 8601 no campo remind_at
- Se não conseguir entender, peça esclarecimentos de forma gentil`

    // ── 8. Build conversation history for AI ─────────────────────────────────
    const conversationMessages: Array<{ role: string; content: unknown }> = []
    for (const msg of history) {
      if (!msg.body_text) continue
      const role = msg.direction === 'IN' ? 'user' : 'assistant'
      conversationMessages.push({ role, content: msg.body_text })
    }

    // Build the current user message (potentially multimodal)
    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'input_audio'; input_audio: { mime_type: string; data: string } }

    let userContent: string | ContentPart[]
    if (message_type === 'image' && mediaInlineData) {
      userContent = [
        { type: 'text', text: effectiveText },
        {
          type: 'image_url',
          image_url: { url: `data:${mediaInlineData.mime_type};base64,${mediaInlineData.data}` },
        },
      ]
    } else {
      userContent = effectiveText
    }

    // ── 9. Call AI with tools ─────────────────────────────────────────────────
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages,
      { role: 'user', content: userContent },
    ]

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
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
                  category: { type: 'string', description: 'Categoria (ex: Trabalho, Pessoal, Ideia, Reunião, Financeiro)' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Tags opcionais' },
                  reply_message: { type: 'string', description: 'Mensagem de confirmação amigável para enviar ao usuário' },
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
              description: 'Cria uma tarefa ou afazer para o usuário.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título da tarefa' },
                  description: { type: 'string', description: 'Descrição detalhada da tarefa' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridade da tarefa' },
                  due_at: { type: 'string', description: 'Data/hora de vencimento em ISO 8601 (opcional)' },
                  reply_message: { type: 'string', description: 'Mensagem de confirmação amigável' },
                },
                required: ['title', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_reminder',
              description: 'Cria um lembrete para notificar o usuário em uma data/hora específica.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título do lembrete' },
                  message: { type: 'string', description: 'Mensagem do lembrete que será enviada ao usuário' },
                  remind_at: { type: 'string', description: 'Data e hora para o lembrete em ISO 8601 (ex: 2024-01-15T10:00:00)' },
                  reply_message: { type: 'string', description: 'Mensagem de confirmação amigável' },
                },
                required: ['title', 'message', 'remind_at', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_notes',
              description: 'Lista as notas recentes do usuário.',
              parameters: {
                type: 'object',
                properties: {
                  category: { type: 'string', description: 'Filtrar por categoria (opcional)' },
                  reply_message: { type: 'string', description: 'Resumo das notas formatado para o usuário' },
                },
                required: ['reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_tasks',
              description: 'Lista as tarefas pendentes do usuário.',
              parameters: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Filtrar por status (opcional)' },
                  reply_message: { type: 'string', description: 'Resumo das tarefas formatado para o usuário' },
                },
                required: ['reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'just_reply',
              description: 'Responde ao usuário sem criar nota, tarefa ou lembrete.',
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

    // ── 10. Execute the chosen action ─────────────────────────────────────────
    if (fnName === 'create_note') {
      const { error: noteErr } = await supabase.from('notes').insert({
        workspace_id,
        title: fnArgs.title,
        content: fnArgs.content,
        category: fnArgs.category ?? 'Geral',
        tags: fnArgs.tags ?? [],
        source_message_id: null,
      })
      if (noteErr) console.error('Failed to insert note:', noteErr)
      replyText = fnArgs.reply_message ?? `✅ Nota criada: ${fnArgs.title}`
    } else if (fnName === 'create_task') {
      const { error: taskErr } = await supabase.from('tasks').insert({
        workspace_id,
        title: fnArgs.title,
        description: fnArgs.description ?? null,
        priority: fnArgs.priority ?? 'medium',
        status: 'todo',
        due_at: fnArgs.due_at ?? null,
      })
      if (taskErr) console.error('Failed to insert task:', taskErr)
      replyText = fnArgs.reply_message ?? `✅ Tarefa criada: ${fnArgs.title}`
    } else if (fnName === 'create_reminder') {
      const { error: remErr } = await supabase.from('reminders').insert({
        workspace_id,
        title: fnArgs.title,
        message: fnArgs.message,
        remind_at: fnArgs.remind_at,
        target_phone: sender_phone,
        channel: provider === 'TELEGRAM' ? 'telegram' : 'whatsapp',
        status: 'scheduled',
      })
      if (remErr) console.error('Failed to insert reminder:', remErr)
      replyText = fnArgs.reply_message ?? `⏰ Lembrete criado: ${fnArgs.title}`
    } else if (fnName === 'list_notes') {
      // Fetch fresh notes to build a detailed reply
      const { data: notesList } = await supabase
        .from('notes')
        .select('title, category, created_at')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!notesList?.length) {
        replyText = '📝 Você ainda não tem nenhuma nota salva.'
      } else {
        // Use AI-generated reply if available, otherwise build manually
        replyText = fnArgs.reply_message ?? `📝 *Suas notas recentes:*\n${notesList
          .map((n, i) => `${i + 1}. ${n.title}${n.category ? ` _(${n.category})_` : ''}`)
          .join('\n')}`
      }
    } else if (fnName === 'list_tasks') {
      const statusFilter = fnArgs.status ?? 'todo'
      const { data: tasksList } = await supabase
        .from('tasks')
        .select('title, priority, status, due_at')
        .eq('workspace_id', workspace_id)
        .in('status', statusFilter === 'done' ? ['done'] : ['todo', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (!tasksList?.length) {
        replyText = '✅ Nenhuma tarefa pendente. Tudo em dia!'
      } else {
        replyText = fnArgs.reply_message ?? `📋 *Suas tarefas pendentes:*\n${tasksList
          .map((t, i) => {
            const priorityEmoji = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡'
            const due = t.due_at ? ` — vence ${new Date(t.due_at).toLocaleDateString('pt-BR')}` : ''
            return `${i + 1}. ${priorityEmoji} ${t.title}${due}`
          })
          .join('\n')}`
      }
    } else {
      replyText = fnArgs.message ?? 'Olá! Como posso ajudar? 😊'
    }

    // ── 11. Save AI reply to messages table ───────────────────────────────────
    await supabase.from('messages').insert({
      workspace_id,
      conversation_id,
      direction: 'OUT',
      type: 'text',
      body_text: replyText,
      timestamp: new Date().toISOString(),
    })

    // ── 12. Send reply to user ────────────────────────────────────────────────
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
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      // Fallback to any active integration
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
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
  }
}
