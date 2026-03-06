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

// ── Financial helpers ──────────────────────────────────────────────────────────
function extractFinancialValues(text: string): { items: { name: string; value: number }[]; total: number } {
  // Match patterns like "20 reais", "R$15,50", "R$ 200", "15.00 reais", etc.
  const patterns = [
    /(?:R\$\s*)([\d]+(?:[.,]\d{1,2})?)/gi,
    /([\d]+(?:[.,]\d{1,2})?)\s*(?:reais|real|R\$)/gi,
  ]
  const values: number[] = []
  for (const pattern of patterns) {
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'))
      if (!isNaN(v) && v > 0) values.push(v)
    }
  }
  const unique = [...new Set(values)]
  const total = unique.reduce((a, b) => a + b, 0)
  return { items: unique.map((v) => ({ name: '', value: v })), total }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function hasFinancialContent(text: string): boolean {
  return /R\$|reais|real|\d+\s*(reais|real)/i.test(text)
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

    // ── 1. Fetch workspace settings + contact name ───────────────────────────
    const [{ data: settings }, { data: contactRow }] = await Promise.all([
      supabase
        .from('workspace_settings')
        .select('bot_response_format, language, timezone, bot_name, bot_personality, default_categories, default_tags')
        .eq('workspace_id', workspace_id)
        .maybeSingle(),
      supabase
        .from('contacts')
        .select('name, notes')
        .eq('workspace_id', workspace_id)
        .eq('phone_e164', sender_phone)
        .maybeSingle(),
    ])

    const responseFormat = settings?.bot_response_format ?? 'medio'
    const botName = (settings as Record<string, unknown>)?.bot_name as string ?? 'Assistente IA'
    const botPersonality = (settings as Record<string, unknown>)?.bot_personality as string | null ?? null
    const tz = (settings as Record<string, unknown>)?.timezone as string ?? 'America/Sao_Paulo'
    const contactName = contactRow?.name ?? null
    const contactNotes = contactRow?.notes ?? null

    // ── Date/time awareness ──────────────────────────────────────────────────
    const nowStr = new Date().toLocaleString('pt-BR', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const formatInstruction =
      responseFormat === 'curto'
        ? 'Responda de forma muito curta e direta (1-2 linhas).'
        : responseFormat === 'detalhado'
        ? 'Responda de forma detalhada e completa, com exemplos quando útil.'
        : 'Responda de forma clara, objetiva e amigável (máx. 3-4 linhas por tópico).'

    // ── 2. Fetch all context in parallel ─────────────────────────────────────
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      { data: historyRows },
      { data: recentNotes },
      { data: pendingTasks },
      { data: upcomingReminders },
      { data: todayFinancialNotes },
    ] = await Promise.all([
      // conversation history
      supabase
        .from('messages')
        .select('direction, body_text, type, created_at')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(12),
      // recent notes (title + category + snippet)
      supabase
        .from('notes')
        .select('id, title, category, content, created_at')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false })
        .limit(8),
      // pending tasks with due dates
      supabase
        .from('tasks')
        .select('id, title, status, priority, due_at')
        .eq('workspace_id', workspace_id)
        .in('status', ['todo', 'in_progress'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(8),
      // upcoming reminders
      supabase
        .from('reminders')
        .select('id, title, remind_at, channel, status')
        .eq('workspace_id', workspace_id)
        .eq('status', 'scheduled')
        .gte('remind_at', new Date().toISOString())
        .order('remind_at', { ascending: true })
        .limit(5),
      // today's financial notes for total spend context
      supabase
        .from('notes')
        .select('title, content')
        .eq('workspace_id', workspace_id)
        .eq('category', 'Financeiro')
        .gte('created_at', todayStart.toISOString()),
    ])

    const history = (historyRows ?? []).reverse()

    // Compute today's spend total from financial notes
    let todaySpendTotal = 0
    for (const fn of todayFinancialNotes ?? []) {
      const text = `${fn.title ?? ''} ${fn.content ?? ''}`
      todaySpendTotal += extractFinancialValues(text).total
    }

    // ── 3. Handle multimodal content ─────────────────────────────────────────
    let effectiveText = message_text
    let mediaInlineData: { mime_type: string; data: string } | null = null

    if ((message_type === 'audio' || message_type === 'image' || message_type === 'document') && !media_base64 && media_url) {
      try {
        const mediaRes = await fetch(media_url)
        if (mediaRes.ok) {
          const buffer = await mediaRes.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          mediaInlineData = {
            mime_type: media_mime ?? (message_type === 'audio' ? 'audio/ogg' : message_type === 'image' ? 'image/jpeg' : 'application/octet-stream'),
            data: btoa(binary),
          }
        }
      } catch (e) {
        console.error('Failed to fetch media:', e)
      }
    } else if (media_base64) {
      mediaInlineData = {
        mime_type: media_mime ?? (message_type === 'audio' ? 'audio/ogg' : 'image/jpeg'),
        data: media_base64,
      }
    }

    // ── 4. Transcribe audio ──────────────────────────────────────────────────
    if (message_type === 'audio' && mediaInlineData) {
      try {
        const transcribeRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'Transcreva este áudio fielmente em português. Retorne APENAS a transcrição, sem comentários ou explicações.' },
                { type: 'input_audio', input_audio: mediaInlineData },
              ],
            }],
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

    // Fallback labels for non-text types
    if (!effectiveText) {
      const typeLabels: Record<string, string> = {
        image: '[Imagem recebida - analise e sugira a ação mais útil]',
        document: '[Documento recebido]',
        video: '[Vídeo recebido]',
        audio: '[Áudio recebido]',
      }
      effectiveText = typeLabels[message_type] ?? '[Mídia recebida]'
    }

    // ── 5. Build rich context for system prompt ───────────────────────────────
    const notesContext = recentNotes?.length
      ? recentNotes.map((n) => `• "${n.title}" (${n.category ?? 'Geral'})`).join('\n')
      : 'Nenhuma nota ainda.'

    const tasksContext = pendingTasks?.length
      ? pendingTasks.map((t) => {
          const prioLabel = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡'
          const due = t.due_at ? ` — vence ${new Date(t.due_at).toLocaleDateString('pt-BR')}` : ''
          return `• ${prioLabel} "${t.title}"${due}`
        }).join('\n')
      : 'Nenhuma tarefa pendente.'

    const remindersContext = upcomingReminders?.length
      ? upcomingReminders.map((r) => `• "${r.title}" em ${new Date(r.remind_at).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })} via ${r.channel}`).join('\n')
      : 'Nenhum lembrete agendado.'

    const financialContext = todaySpendTotal > 0
      ? `\n💰 Gastos registrados hoje: ${formatCurrency(todaySpendTotal)}`
      : ''

    // Contact context for prompt
    const contactContext = contactName
      ? `\n## Usuário\nO usuário se chama **${contactName}**.${contactNotes ? ` Observações: ${contactNotes}` : ''} Use o nome dele nas respostas de forma natural.`
      : ''

    // ── 6. Build system prompt (elite) ───────────────────────────────────────
    const systemPrompt = `Você é **${botName}**, o assistente pessoal mais inteligente e útil do mundo, integrado diretamente ao WhatsApp/Telegram do usuário.

📅 Data e hora atual: ${nowStr}
${contactContext}
## Sua Missão
Ajudar o usuário a organizar sua vida com máxima eficiência. Você é proativo, contextual e sempre sugere a ação mais útil. Você tem memória completa desta conversa.

## Capacidades Disponíveis
- **Notas**: criar, buscar por palavra-chave, listar por categoria
- **Tarefas**: criar, marcar como concluída/em andamento, listar pendentes
- **Lembretes**: criar (sempre extraia data/hora precisa), listar próximos, cancelar
- **Finanças**: registrar gastos com categoria "Financeiro", calcular totais do dia/semana/mês
- **Respostas**: conversar, responder perguntas, dar conselhos

## Inteligência Financeira 💰
Quando o usuário mencionar valores monetários (ex: "gastei 20 reais de lanche", "R$50 de gasolina", "rapadura 3 reais", "uma rapadura e um doce 15 reais"):
→ Use **create_note** com category="Financeiro" SEMPRE
→ Extraia cada item e valor no conteúdo de forma estruturada: "• Item: R$valor"
→ Confirme com emoji: "✅ Gasto registrado: [itens] - Total: R$xx,xx"
→ Se mencionou vários itens num valor só, distribua igualmente ou coloque o total

## Contexto Atual do Usuário
**Notas recentes (${recentNotes?.length ?? 0} total):**
${notesContext}

**Tarefas em aberto (${pendingTasks?.length ?? 0}):**
${tasksContext}

**Próximos lembretes (${upcomingReminders?.length ?? 0}):**
${remindersContext}${financialContext}

## Tipo de Mensagem
${message_type === 'audio' ? '🎤 Áudio transcrito — trate como texto normal' : ''}
${message_type === 'image' ? '📷 Imagem — descreva o que vê e sugira ação útil (criar nota, tarefa, etc.)' : ''}
${message_type === 'document' ? '📄 Documento — resuma o conteúdo se possível' : ''}
${message_type === 'text' ? '💬 Texto' : ''}

## Regras de Ouro
1. ${formatInstruction}
2. Responda SEMPRE em português brasileiro
3. Use emojis com moderação (1-2 por mensagem, apenas quando natural)
4. Ao confirmar ações: "✅ [ação] criada/concluída: [nome]"
5. Seja proativo: detecte padrões, sugira ações complementares
6. Para lembretes: extraia data/hora precisa e use ISO 8601 no campo remind_at (use ${new Date().getFullYear()} como ano base)
7. Se ambíguo, pergunte de forma gentil e direta
8. Use negrito (*texto*) para destacar itens importantes
${botPersonality ? `\n## Personalidade Personalizada\n${botPersonality}` : ''}`

    // ── 7. Build conversation history ─────────────────────────────────────────
    const conversationMessages: Array<{ role: string; content: unknown }> = []
    for (const msg of history) {
      if (!msg.body_text) continue
      conversationMessages.push({
        role: msg.direction === 'IN' ? 'user' : 'assistant',
        content: msg.body_text,
      })
    }

    // Build current user message (potentially multimodal)
    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'input_audio'; input_audio: { mime_type: string; data: string } }

    let userContent: string | ContentPart[]
    if (message_type === 'image' && mediaInlineData) {
      userContent = [
        { type: 'text', text: effectiveText ?? '[Imagem]' },
        { type: 'image_url', image_url: { url: `data:${mediaInlineData.mime_type};base64,${mediaInlineData.data}` } },
      ]
    } else {
      userContent = effectiveText ?? ''
    }

    // ── 8. Call AI with expanded toolset ─────────────────────────────────────
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages,
      { role: 'user', content: userContent },
    ]

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
        tools: [
          {
            type: 'function',
            function: {
              name: 'create_note',
              description: 'Cria uma nota/anotação. Use também para registrar gastos financeiros (category="Financeiro").',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título curto e descritivo' },
                  content: { type: 'string', description: 'Conteúdo completo. Para gastos: liste cada item com valor.' },
                  category: { type: 'string', description: 'Categoria: Trabalho, Pessoal, Ideia, Reunião, Financeiro, Saúde, Compras, etc.' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Tags opcionais' },
                  reply_message: { type: 'string', description: 'Confirmação amigável para o usuário' },
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
              description: 'Cria uma tarefa/afazer com prioridade e prazo opcionais.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título da tarefa' },
                  description: { type: 'string', description: 'Descrição detalhada (opcional)' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridade' },
                  due_at: { type: 'string', description: 'Vencimento em ISO 8601 (opcional)' },
                  reply_message: { type: 'string', description: 'Confirmação amigável' },
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
              description: 'Cria um lembrete para notificar o usuário em data/hora específica. Sempre extraia a data precisa.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título do lembrete' },
                  message: { type: 'string', description: 'Mensagem que será enviada ao usuário no horário' },
                  remind_at: { type: 'string', description: 'Data/hora exata em ISO 8601 (ex: 2026-03-07T10:00:00)' },
                  reply_message: { type: 'string', description: 'Confirmação amigável com data/hora formatada' },
                },
                required: ['title', 'message', 'remind_at', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'update_task_status',
              description: 'Marca uma tarefa como concluída, em andamento ou a fazer. Use quando usuário diz "concluí", "terminei", "fiz", etc.',
              parameters: {
                type: 'object',
                properties: {
                  task_title: { type: 'string', description: 'Título ou parte do título da tarefa para localizar' },
                  new_status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Novo status' },
                  reply_message: { type: 'string', description: 'Confirmação amigável' },
                },
                required: ['task_title', 'new_status', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'search_notes',
              description: 'Busca notas por palavra-chave no título ou conteúdo. Use quando usuário pergunta sobre algo específico.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Palavra-chave para buscar nas notas' },
                  category: { type: 'string', description: 'Filtrar por categoria (opcional)' },
                  reply_message: { type: 'string', description: 'Texto introdutório antes dos resultados' },
                },
                required: ['query', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'financial_summary',
              description: 'Calcula e exibe o total de gastos registrados como notas Financeiras. Use quando usuário pede relatório de gastos.',
              parameters: {
                type: 'object',
                properties: {
                  period: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'Período para calcular' },
                  reply_message: { type: 'string', description: 'Introdução antes do relatório' },
                },
                required: ['period', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_notes',
              description: 'Lista notas recentes do usuário, opcionalmente filtradas por categoria.',
              parameters: {
                type: 'object',
                properties: {
                  category: { type: 'string', description: 'Filtrar por categoria (opcional)' },
                  reply_message: { type: 'string', description: 'Resumo formatado para o usuário' },
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
              description: 'Lista tarefas pendentes ou concluídas do usuário.',
              parameters: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'pending'], description: 'Filtrar por status (opcional)' },
                  reply_message: { type: 'string', description: 'Resumo formatado' },
                },
                required: ['reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_reminders',
              description: 'Lista os próximos lembretes agendados do usuário.',
              parameters: {
                type: 'object',
                properties: {
                  reply_message: { type: 'string', description: 'Resumo formatado dos lembretes' },
                },
                required: ['reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'cancel_reminder',
              description: 'Cancela/remove um lembrete existente pelo título.',
              parameters: {
                type: 'object',
                properties: {
                  reminder_title: { type: 'string', description: 'Título ou parte do título do lembrete' },
                  reply_message: { type: 'string', description: 'Confirmação amigável' },
                },
                required: ['reminder_title', 'reply_message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'just_reply',
              description: 'Responde ao usuário sem nenhuma ação de criação/edição. Use para conversas, perguntas gerais, ou quando nenhuma outra ferramenta se aplica.',
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

    // ── 9. Execute chosen action ──────────────────────────────────────────────
    if (fnName === 'create_note') {
      // Auto-detect financial content
      const isFinancial = fnArgs.category === 'Financeiro' || hasFinancialContent(`${fnArgs.title} ${fnArgs.content}`)
      const finalCategory = isFinancial ? 'Financeiro' : (fnArgs.category ?? 'Geral')

      const { error: noteErr } = await supabase.from('notes').insert({
        workspace_id,
        title: fnArgs.title,
        content: fnArgs.content,
        category: finalCategory,
        tags: fnArgs.tags ?? [],
        source_message_id: null,
      })
      if (noteErr) console.error('Failed to insert note:', noteErr)

      // If financial, compute and include total in reply
      if (isFinancial) {
        const fin = extractFinancialValues(`${fnArgs.title} ${fnArgs.content}`)
        const totalStr = fin.total > 0 ? ` (total: ${formatCurrency(fin.total)})` : ''
        replyText = fnArgs.reply_message
          ? fnArgs.reply_message.replace(/\.$/, '') + totalStr + (totalStr ? '.' : '')
          : `✅ Gasto registrado: ${fnArgs.title}${totalStr}`
      } else {
        replyText = fnArgs.reply_message ?? `✅ Nota criada: ${fnArgs.title}`
      }
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
    } else if (fnName === 'update_task_status') {
      // Find task by fuzzy title match
      const { data: matchingTasks } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .ilike('title', `%${fnArgs.task_title}%`)
        .limit(1)

      if (matchingTasks?.length) {
        const task = matchingTasks[0]
        const completedAt = fnArgs.new_status === 'done' ? new Date().toISOString() : null
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({ status: fnArgs.new_status, completed_at: completedAt })
          .eq('id', task.id)
        if (updateErr) console.error('Failed to update task:', updateErr)
        replyText = fnArgs.reply_message ?? `✅ Tarefa "${task.title}" atualizada: ${fnArgs.new_status}`
      } else {
        replyText = `❌ Não encontrei nenhuma tarefa com o nome "${fnArgs.task_title}". Verifique o nome e tente novamente.`
      }
    } else if (fnName === 'search_notes') {
      const query = supabase
        .from('notes')
        .select('title, category, content, created_at')
        .eq('workspace_id', workspace_id)
        .or(`title.ilike.%${fnArgs.query}%,content.ilike.%${fnArgs.query}%`)
        .order('created_at', { ascending: false })
        .limit(8)

      if (fnArgs.category) {
        query.eq('category', fnArgs.category)
      }

      const { data: searchResults } = await query

      if (!searchResults?.length) {
        replyText = `🔍 Nenhuma nota encontrada para "${fnArgs.query}".`
      } else {
        const notesList = searchResults.map((n, i) => {
          const snippet = n.content ? n.content.replace(/<[^>]+>/g, '').slice(0, 80) : ''
          return `${i + 1}. *${n.title}* _(${n.category ?? 'Geral'})_${snippet ? `\n   ${snippet}...` : ''}`
        }).join('\n\n')
        replyText = `${fnArgs.reply_message}\n\n${notesList}`
      }
    } else if (fnName === 'financial_summary') {
      // Calculate date range
      const now = new Date()
      let dateFrom: Date
      if (fnArgs.period === 'hoje') {
        dateFrom = new Date(now); dateFrom.setHours(0, 0, 0, 0)
      } else if (fnArgs.period === 'semana') {
        dateFrom = new Date(now); dateFrom.setDate(now.getDate() - 7)
      } else {
        dateFrom = new Date(now); dateFrom.setDate(1); dateFrom.setHours(0, 0, 0, 0)
      }

      const { data: financialNotes } = await supabase
        .from('notes')
        .select('title, content, created_at')
        .eq('workspace_id', workspace_id)
        .eq('category', 'Financeiro')
        .gte('created_at', dateFrom.toISOString())
        .order('created_at', { ascending: false })

      if (!financialNotes?.length) {
        const periodLabel = fnArgs.period === 'hoje' ? 'hoje' : fnArgs.period === 'semana' ? 'nos últimos 7 dias' : 'este mês'
        replyText = `💰 Nenhum gasto registrado ${periodLabel}.`
      } else {
        let grandTotal = 0
        const lines: string[] = []
        for (const fn of financialNotes) {
          const text = `${fn.title ?? ''} ${fn.content ?? ''}`
          const fin = extractFinancialValues(text)
          if (fin.total > 0) {
            grandTotal += fin.total
            const date = new Date(fn.created_at!).toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' })
            lines.push(`• ${fn.title} — ${formatCurrency(fin.total)} _(${date})_`)
          }
        }
        const periodLabel = fnArgs.period === 'hoje' ? 'Hoje' : fnArgs.period === 'semana' ? 'Últimos 7 dias' : 'Este mês'
        if (lines.length === 0) {
          replyText = `💰 Nenhum gasto com valor identificado ${fnArgs.period === 'hoje' ? 'hoje' : fnArgs.period === 'semana' ? 'nos últimos 7 dias' : 'este mês'}.`
        } else {
          replyText = `💰 *Gastos — ${periodLabel}:*\n\n${lines.join('\n')}\n\n*Total: ${formatCurrency(grandTotal)}*`
        }
      }
    } else if (fnName === 'list_notes') {
      const q = supabase
        .from('notes')
        .select('title, category, created_at')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (fnArgs.category) q.eq('category', fnArgs.category)
      const { data: notesList } = await q

      if (!notesList?.length) {
        replyText = '📝 Você ainda não tem nenhuma nota salva.'
      } else {
        const listStr = notesList.map((n, i) => `${i + 1}. *${n.title}* _(${n.category ?? 'Geral'})_`).join('\n')
        replyText = `${fnArgs.reply_message}\n\n${listStr}`
      }
    } else if (fnName === 'list_tasks') {
      const statusFilter = fnArgs.status
      const { data: tasksList } = await supabase
        .from('tasks')
        .select('title, priority, status, due_at')
        .eq('workspace_id', workspace_id)
        .in('status', statusFilter === 'done' ? ['done'] : ['todo', 'in_progress'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(10)

      if (!tasksList?.length) {
        replyText = '✅ Nenhuma tarefa pendente. Tudo em dia!'
      } else {
        const listStr = tasksList.map((t, i) => {
          const prioEmoji = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡'
          const due = t.due_at ? ` — vence ${new Date(t.due_at).toLocaleDateString('pt-BR', { timeZone: tz })}` : ''
          return `${i + 1}. ${prioEmoji} *${t.title}*${due}`
        }).join('\n')
        replyText = `${fnArgs.reply_message}\n\n${listStr}`
      }
    } else if (fnName === 'list_reminders') {
      const { data: remindersList } = await supabase
        .from('reminders')
        .select('title, remind_at, channel, status')
        .eq('workspace_id', workspace_id)
        .eq('status', 'scheduled')
        .gte('remind_at', new Date().toISOString())
        .order('remind_at', { ascending: true })
        .limit(8)

      if (!remindersList?.length) {
        replyText = '⏰ Nenhum lembrete agendado.'
      } else {
        const listStr = remindersList.map((r, i) => {
          const dt = new Date(r.remind_at).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })
          return `${i + 1}. ⏰ *${r.title}* — ${dt} via ${r.channel}`
        }).join('\n')
        replyText = `${fnArgs.reply_message}\n\n${listStr}`
      }
    } else if (fnName === 'cancel_reminder') {
      const { data: matchingReminders } = await supabase
        .from('reminders')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .eq('status', 'scheduled')
        .ilike('title', `%${fnArgs.reminder_title}%`)
        .limit(1)

      if (matchingReminders?.length) {
        const r = matchingReminders[0]
        const { error: cancelErr } = await supabase
          .from('reminders')
          .update({ status: 'canceled' })
          .eq('id', r.id)
        if (cancelErr) console.error('Failed to cancel reminder:', cancelErr)
        replyText = fnArgs.reply_message ?? `✅ Lembrete "${r.title}" cancelado.`
      } else {
        replyText = `❌ Não encontrei nenhum lembrete com o nome "${fnArgs.reminder_title}".`
      }
    } else {
      // just_reply
      replyText = fnArgs.message ?? 'Olá! Como posso ajudar? 😊'
    }

    // ── 10. Save AI reply to messages table ──────────────────────────────────
    await supabase.from('messages').insert({
      workspace_id,
      conversation_id,
      direction: 'OUT',
      type: 'text',
      body_text: replyText,
      timestamp: new Date().toISOString(),
    })

    // ── 11. Send reply to user ────────────────────────────────────────────────
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

async function dispatchReply(integration: Record<string, unknown>, phone: string, text: string) {
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
