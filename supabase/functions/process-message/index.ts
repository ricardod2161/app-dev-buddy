import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Module-level integration cache (5-minute TTL) ─────────────────────────────
const integrationCache = new Map<string, { data: Record<string, unknown>; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

function getCachedIntegration(key: string): Record<string, unknown> | null {
  const entry = integrationCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) { integrationCache.delete(key); return null }
  return entry.data
}

function setCachedIntegration(key: string, data: Record<string, unknown>): void {
  integrationCache.set(key, { data, ts: Date.now() })
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
  log_id?: string | null
}

// ── Financial helpers ──────────────────────────────────────────────────────────
function extractFinancialValues(text: string): { items: { name: string; value: number }[]; total: number } {
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
  return /R\$|reais|real|\d+\s*(reais|real)|gastei|comprei|paguei|custou|vale\s+\d|valeu\s+\d|gasto\s+de|compra\s+de|me\s+cobrou|quanto\s+fica|registre|marque|despesa|despesas|despesa\s+de/i.test(text)
}

function normalizeFinancialCategory(cat: string | null): boolean {
  if (!cat) return false
  const lower = cat.toLowerCase()
  return lower.includes('financ') || lower.includes('gasto') || lower.includes('compra') || lower === 'despesa' || lower.includes('despesa')
}

// ── Detect if message is complex (needs a smarter model) ──────────────────────
function isComplexRequest(text: string, msgType: string): boolean {
  if (msgType === 'audio' || msgType === 'image') return true
  return /resumo|semanal|semana|relat[oó]rio|financ|gastos do m[eê]s|análise|analise|produtividade|quanto gastei|total de/i.test(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const startTime = Date.now()
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
      log_id,
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

    // ── /ajuda command — intercept before AI call ────────────────────────────
    const textTrimmed = message_text?.trim() ?? ''
    const isAjudaCommand = /^\/(ajuda|help|comandos|start|menu)$/i.test(textTrimmed) || /^(ajuda|help|comandos|o que você (faz|sabe|pode)|como usar)/i.test(textTrimmed)
    if (isAjudaCommand && message_type === 'text') {
      const SUPABASE_URL2 = Deno.env.get('SUPABASE_URL')!
      const ANON_KEY2 = Deno.env.get('SUPABASE_ANON_KEY')!
      const { data: ws_settings } = await supabase.from('workspace_settings').select('bot_name').eq('workspace_id', workspace_id).maybeSingle()
      const botN = (ws_settings as Record<string,unknown>)?.bot_name as string ?? 'Assistente IA'
      const helpText = `🤖 *${botN} — Lista de Comandos*\n\n` +
        `📝 *NOTAS*\n` +
        `• "Anota que..." → salva uma nota\n` +
        `• "Edita nota [título]" → atualiza conteúdo de uma nota\n` +
        `• "Minhas notas" / "Lista notas" → ver notas recentes\n` +
        `• "Busca [palavra]" → encontrar notas por texto\n` +
        `• "Apaga a nota [título]" → remover nota\n\n` +
        `✅ *TAREFAS*\n` +
        `• "Cria tarefa: [título]" → nova tarefa\n` +
        `• "Minhas tarefas" / "Lista tarefas" → tarefas em aberto\n` +
        `• "Concluí [tarefa]" / "Finalizei [tarefa]" → marcar como feita\n` +
        `• "Apaga tarefa [título]" → remover tarefa\n` +
        `• "Tarefa [título] é urgente" → muda prioridade\n\n` +
        `⏰ *LEMBRETES*\n` +
        `• "Me lembra de [X] às [hora]" → criar lembrete\n` +
        `• "Meus lembretes" → ver próximos lembretes\n` +
        `• "Cancela lembrete [título]" → remover lembrete\n\n` +
        `💰 *FINANÇAS*\n` +
        `• "Registre X reais" ou "marque despesa de X" → registra automaticamente\n` +
        `• "Gastei R$X de [item]" → registra gasto\n` +
        `• "Gastos de hoje" / "do mês" → relatório financeiro\n` +
        `• "Resumo semanal" → resumo da semana\n\n` +
        `👤 *CONTATOS*\n` +
        `• "Salva contato [nome] [telefone]" → adiciona contato\n\n` +
        `🎤 *ÁUDIO*\n` +
        `• Envie um áudio → o bot transcreve, interpreta e age\n` +
        `• "Responde em áudio" / "Manda áudio" → resposta em voz\n\n` +
        `📊 *RELATÓRIOS*\n` +
        `• "Resumo da semana" → atividades + gastos + tarefas\n` +
        `• "Gastos do mês" → total financeiro detalhado\n\n` +
        `💡 _Você pode falar naturalmente! Não precisa usar comandos exatos._`

      await supabase.from('messages').insert({
        workspace_id, conversation_id, direction: 'OUT', type: 'text',
        body_text: helpText, timestamp: new Date().toISOString(),
      })
      await fetch(`${SUPABASE_URL2}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY2}`, 'apikey': ANON_KEY2 },
        body: JSON.stringify({ workspace_id, phone: sender_phone, text: helpText }),
      })
      return new Response(JSON.stringify({ ok: true, action: 'ajuda' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 1. Fetch workspace settings + contact name ───────────────────────────
    // Normaliza variantes do telefone (8 vs 9 dígitos BR)
    const senderVariants = (() => {
      const withPlus = sender_phone.startsWith('+') ? sender_phone : `+${sender_phone}`
      const stripped = withPlus.slice(1)
      const variants = new Set<string>([withPlus])
      if (/^55\d{2}\d{8}$/.test(stripped)) {
        const ddd = stripped.slice(2, 4)
        variants.add(`+55${ddd}9${stripped.slice(4)}`)
      }
      if (/^55\d{2}9\d{8}$/.test(stripped)) {
        const ddd = stripped.slice(2, 4)
        variants.add(`+55${ddd}${stripped.slice(5)}`)
      }
      return [...variants]
    })()

    const [{ data: settings }, { data: contactRow }] = await Promise.all([
      supabase
        .from('workspace_settings')
        .select('bot_response_format, language, timezone, bot_name, bot_personality, default_categories, default_tags, tts_enabled, tts_voice_id')
        .eq('workspace_id', workspace_id)
        .maybeSingle(),
      supabase
        .from('contacts')
        .select('name, notes')
        .eq('workspace_id', workspace_id)
        .in('phone_e164', senderVariants)
        .maybeSingle(),
    ])

    const responseFormat = settings?.bot_response_format ?? 'medio'
    const botName = (settings as Record<string, unknown>)?.bot_name as string ?? 'Assistente IA'
    const botPersonality = (settings as Record<string, unknown>)?.bot_personality as string | null ?? null
    const tz = (settings as Record<string, unknown>)?.timezone as string ?? 'America/Sao_Paulo'
    const contactName = contactRow?.name ?? null
    const contactNotes = contactRow?.notes ?? null

    // ── Date/time awareness ──────────────────────────────────────────────────
    const now = new Date()
    const nowStr = now.toLocaleString('pt-BR', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    // Short date for deduplication hints
    const todayShort = now.toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' })

    const formatInstruction =
      responseFormat === 'curto'
        ? 'Responda de forma muito curta e direta (1-2 linhas).'
        : responseFormat === 'detalhado'
        ? 'Responda de forma detalhada e completa, com exemplos quando útil.'
        : 'Responda de forma clara, objetiva e amigável (máx. 3-4 linhas por tópico).'

    // ── 2. Fetch all context in parallel ─────────────────────────────────────
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Skip financial query for messages without financial content (perf optimization)
    const needsFinancial = hasFinancialContent(message_text ?? '') || message_type === 'audio'
    // Simple requests get smaller context windows → fewer tokens → faster model response
    const isSimpleRequest = !needsFinancial && message_type === 'text'

    const [
      { data: historyRows },
      { data: recentNotes },
      { data: pendingTasks },
      { data: upcomingReminders },
      { data: todayFinancialNotes },
      { data: userMemory },
    ] = await Promise.all([
      // conversation history — 8 for simple, 12 for complex
      supabase
        .from('messages')
        .select('direction, body_text, type, created_at')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(isSimpleRequest ? 8 : 12),
      // recent notes — 6 for simple, 15 for complex
      supabase
        .from('notes')
        .select('id, title, category, content, created_at')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false })
        .limit(isSimpleRequest ? 6 : 15),
      // pending tasks — 6 for simple, 10 for complex
      supabase
        .from('tasks')
        .select('id, title, status, priority, due_at')
        .eq('workspace_id', workspace_id)
        .in('status', ['todo', 'doing'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(isSimpleRequest ? 6 : 10),
      // upcoming reminders
      supabase
        .from('reminders')
        .select('id, title, remind_at, channel, status')
        .eq('workspace_id', workspace_id)
        .eq('status', 'scheduled')
        .gte('remind_at', new Date().toISOString())
        .order('remind_at', { ascending: true })
        .limit(5),
      // today's financial notes — skipped when not needed (saves ~80ms per message)
      needsFinancial
        ? supabase
            .from('notes')
            .select('title, content')
            .eq('workspace_id', workspace_id)
            .or(`category.eq.Financeiro,title.ilike.%reais%,content.ilike.%reais%,title.ilike.%R$%,content.ilike.%R$%`)
            .gte('created_at', todayStart.toISOString())
        : Promise.resolve({ data: [] as { title: string | null; content: string | null }[], error: null }),
      // persistent financial memory
      supabase
        .from('user_memory')
        .select('meta_diaria, total_guardado_mes, ultima_reserva_data, ultima_reserva_valor, mes_referencia')
        .eq('workspace_id', workspace_id)
        .maybeSingle(),
    ])

    const history = (historyRows ?? []).reverse()

    // Compute today's spend total (deduplicated by title)
    let todaySpendTotal = 0
    const seenTitlesForSpend = new Set<string>()
    for (const fn of todayFinancialNotes ?? []) {
      const key = fn.title ?? ''
      if (!seenTitlesForSpend.has(key)) {
        seenTitlesForSpend.add(key)
        const text = `${fn.title ?? ''} ${fn.content ?? ''}`
        todaySpendTotal += extractFinancialValues(text).total
      }
    }

    // ── 3. Handle multimodal content ─────────────────────────────────────────
    let effectiveText = message_text
    let mediaInlineData: { mime_type: string; data: string } | null = null

    function normalizeMime(rawMime: string | null | undefined, msgType: string): string {
      if (!rawMime) {
        if (msgType === 'audio') return 'audio/ogg'
        if (msgType === 'image') return 'image/jpeg'
        if (msgType === 'video') return 'video/mp4'
        return 'application/octet-stream'
      }
      const lower = rawMime.toLowerCase()
      if (lower === 'audiomessage' || lower === 'audio' || lower.includes('ogg') || lower.includes('opus')) return 'audio/ogg'
      if (lower === 'imagemessage' || lower === 'image') return 'image/jpeg'
      if (lower === 'videomessage' || lower === 'video') return 'video/mp4'
      if (lower === 'documentmessage' || lower === 'document') return 'application/octet-stream'
      if (rawMime.includes('/')) return rawMime
      return 'application/octet-stream'
    }

    const resolvedMime = normalizeMime(media_mime, message_type)

    if ((message_type === 'audio' || message_type === 'image' || message_type === 'document') && !media_base64 && media_url) {
      try {
        const mediaRes = await fetch(media_url)
        if (mediaRes.ok) {
          const buffer = await mediaRes.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          mediaInlineData = { mime_type: resolvedMime, data: btoa(binary) }
        }
      } catch (e) {
        console.error('Failed to fetch media:', e)
      }
    } else if (media_base64) {
      mediaInlineData = { mime_type: resolvedMime, data: media_base64 }
    }

    // ── 4. Transcribe audio ──────────────────────────────────────────────────
    if (message_type === 'audio' && mediaInlineData) {
      console.log('Audio transcription starting:', {
        hasBase64: !!mediaInlineData.data,
        base64Length: mediaInlineData.data?.length ?? 0,
        mimeType: mediaInlineData.mime_type,
      })

      let transcribed = false

      for (const model of ['google/gemini-2.5-flash', 'google/gemini-2.5-pro']) {
        if (transcribed) break
        try {
          const transcribeRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Transcreva fielmente este áudio em português brasileiro. Retorne APENAS a transcrição, sem nenhum comentário, tradução ou explicação. Apenas o texto falado.',
                  },
                  {
                    type: 'image_url',
                    image_url: { url: `data:${mediaInlineData.mime_type};base64,${mediaInlineData.data}` },
                  },
                ],
              }],
            }),
          })

          if (transcribeRes.ok) {
            const transcribeData = await transcribeRes.json()
            const transcription = transcribeData.choices?.[0]?.message?.content?.trim()
            if (transcription && transcription.length > 2) {
              effectiveText = `[Áudio transcrito]: ${transcription}`
              transcribed = true
              console.log(`Audio transcribed (${model}):`, transcription.slice(0, 150))
            }
          } else {
            const errBody = await transcribeRes.text()
            console.warn(`${model} transcription HTTP ${transcribeRes.status}:`, errBody.slice(0, 400))
          }
        } catch (e) {
          console.error(`${model} transcription exception:`, e)
        }
      }

      if (!transcribed) {
        effectiveText = '[Áudio recebido mas não foi possível transcrever automaticamente. Por favor, reenvie o áudio ou escreva a mensagem em texto.]'
      }
    }

    // Fallback labels for non-text types
    if (!effectiveText) {
      const typeLabels: Record<string, string> = {
        image: '[Imagem recebida - analise e sugira a ação mais útil]',
        document: '[Documento recebido]',
        video: '[Vídeo recebido]',
        audio: '[Áudio recebido - não foi possível transcrever. Peça ao usuário para reenviar ou escrever em texto]',
      }
      effectiveText = typeLabels[message_type] ?? '[Mídia recebida]'
    }

    // ── 5. Build rich context for system prompt ───────────────────────────────
    // Include snippets of today's notes to help with deduplication
    const todayNotesTitles = (recentNotes ?? [])
      .filter(n => n.created_at && new Date(n.created_at) >= todayStart)
      .map(n => `"${n.title}"`)
      .join(', ')

    const notesContext = recentNotes?.length
      ? recentNotes.map((n) => {
          const snippet = n.content ? ` — "${n.content.replace(/<[^>]+>/g, '').slice(0, 60)}"` : ''
          return `• "${n.title}" (${n.category ?? 'Geral'})${snippet}`
        }).join('\n')
      : 'Nenhuma nota ainda.'

    const tasksContext = pendingTasks?.length
      ? pendingTasks.map((t) => {
          const prioLabel = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡'
          const statusLabel = t.status === 'doing' ? ' [em andamento]' : ''
          const due = t.due_at ? ` — vence ${new Date(t.due_at).toLocaleDateString('pt-BR')}` : ''
          return `• ${prioLabel} "${t.title}"${statusLabel}${due}`
        }).join('\n')
      : 'Nenhuma tarefa pendente.'

    const remindersContext = upcomingReminders?.length
      ? upcomingReminders.map((r) => `• "${r.title}" em ${new Date(r.remind_at).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })} via ${r.channel}`).join('\n')
      : 'Nenhum lembrete agendado.'

    const financialContext = todaySpendTotal > 0
      ? `\n💰 Gastos registrados hoje (${todayShort}): ${formatCurrency(todaySpendTotal)}`
      : ''

    // Build memory context block from persistent user_memory
    const memoryBlock = userMemory
      ? (() => {
          const mesNome = new Date().toLocaleDateString('pt-BR', { timeZone: tz, month: 'long', year: 'numeric' })
          const ultimaReservaStr = userMemory.ultima_reserva_data
            ? new Date(userMemory.ultima_reserva_data).toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' })
            : 'nenhuma ainda'
          const totalFmt = Number(userMemory.total_guardado_mes ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          const metaFmt = Number(userMemory.meta_diaria ?? 40).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          return `\n\n## 🧠 MEMÓRIA FINANCEIRA PERSISTENTE (valores reais do banco):\n- Meta diária: ${metaFmt}\n- Total guardado este mês (${mesNome}): ${totalFmt}\n- Última reserva: ${ultimaReservaStr}${userMemory.ultima_reserva_valor ? ` — ${Number(userMemory.ultima_reserva_valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}\n- OBRIGATÓRIO: use esses valores reais ao responder. NUNCA invente totais.`
        })()
      : '\n\n## 🧠 MEMÓRIA FINANCEIRA:\n- Meta diária: R$ 40,00\n- Total guardado este mês: R$ 0,00 (sem registros ainda)'

    const contactContext = contactName
      ? `\n## Usuário\nO usuário se chama **${contactName}**.${contactNotes ? ` Observações: ${contactNotes}` : ''} Use o nome dele nas respostas de forma natural.`
      : ''

    // ── 6. Build system prompt ────────────────────────────────────────────────
    const systemPrompt = `## BUDDY FINANCEIRO — Paulo Ricardo Dantas de Lima 🤝

Você é o assistente pessoal de *Paulo Ricardo Dantas de Lima* — amigo de 15 anos, contador expert + dev sênior. Fale como irmão do RN: direto, leve, mistura nordestino com carioca. Use "mano", "salvo", "bora", "desculpa a confusão anterior" quando natural.

**Nome:** Paulo | **Cidade:** Alexandria/RN | **Meta diária de reserva:** R$ 40,00
📅 Data e hora atual: ${nowStr} (${todayShort})
${contactContext}

---

## FORMATO OBRIGATÓRIO DE RESPOSTA (nunca altere o layout)

### Ao registrar reserva/gasto:
✅ Reserva registrada! R$ 40,00 adicionados à sua meta diária de hoje. Desculpa a confusão anterior, agora está salvo! (total: R$ 40,00).

Gastos — Hoje:

• Gasto com Reserva (${todayShort}) — R$ 40,00 (${todayShort})

Total: R$ 40,00

Sempre termine com: "Quer filtro só reservas? Só gastos? Gráfico? Total guardado? Só falar."

### Ao pedir relatório do mês:
Gastos — Este mês:

• [bullet por gasto, formato: Descrição (DD/MM) — R$ valor (DD/MM)]

Total: R$ valor

### Ao pedir "o que estou guardando":
Estou filtrando todas as suas notas de reserva...

1. Gasto com Reserva (DD/MM) (Financeiro)
   • Reserva Diária (Meta Anual): R$ 40,00...

---

## EXEMPLOS OBRIGATÓRIOS (reproduza 1:1)

- "E os 40?" → ✅ Reserva registrada! R$ 40,00... + Gastos — Hoje: + Total
- "Mim der o relatório diário" → ✅ + Gastos — Hoje: + Total
- "Mim der o relatório completo" → Gastos — Este mês: + lista completa de bullets
- "Eu quero o que estou guardando" → lista numerada com filtro só de reservas
- "Nenhum gasto registrado hoje." → confirme exatamente assim quando vazio

---

## REGRAS OBRIGATÓRIAS (nunca quebre nenhuma)

1. Toda mensagem com R$, "reserva", "gasto", "recebi", "Mim der", "relatório", "guardando", "gastei", "comprei", "paguei", "despesa", "registre", "marque" → processe automaticamente no formato acima
2. Datas SEMPRE no formato DD/MM (ex: 22/03, 19/03)
3. Confirmações SEMPRE com ✅ (sucesso) ou 🔴 (erro)
4. Meta diária R$40 é memória permanente — nunca esqueça
5. Sempre termine respostas financeiras com: "Quer filtro só reservas? Só gastos? Gráfico? Total guardado? Só falar."
6. NUNCA mude o layout do formato acima

---

## CAPACIDADES DISPONÍVEIS
- **Notas**: criar, editar, buscar, listar, deletar
- **Tarefas**: criar, atualizar status (todo/doing/done), mudar prioridade, deletar
- **Lembretes**: criar (sempre extraia data/hora precisa), listar, cancelar
- **Finanças**: registrar gastos com category="Financeiro", calcular totais do dia/semana/mês
- **Contatos**: salvar novas pessoas com nome e telefone
- **Respostas**: conversar, responder perguntas, dar conselhos

## ⚠️ REGRA ANTI-DUPLICATA — OBRIGATÓRIA
Antes de criar uma nota ou tarefa, VERIFIQUE se já existe um item similar HOJE (${todayShort}).
Notas criadas hoje: ${todayNotesTitles || 'nenhuma ainda'}.
→ Se já existe uma nota com título IGUAL ou MUITO similar criada hoje → use **update_note** para adicionar o novo valor/conteúdo, NÃO crie duplicata.
→ Só use create_note se o título for genuinamente diferente de todos os itens acima.

## Inteligência Financeira 💰
Quando o usuário mencionar valores monetários (ex: "gastei 20 reais de lanche", "R$50 de gasolina", "reserva", "guardei"):
→ Use **create_note** com category="Financeiro" SEMPRE
→ VERIFIQUE anti-duplicata antes: se já existe "Gasto com Reserva" hoje, use update_note
→ Extraia cada item e valor no conteúdo: "• Item: R$valor"
→ category NUNCA deve ser "Finanças" — SEMPRE use "Financeiro"

## Status de Tarefas — VALORES EXATOS
- "todo" = a fazer | "doing" = em andamento | "done" = concluído

## Contexto Atual do Usuário
**Notas recentes (${recentNotes?.length ?? 0} — últimas 15):**
${notesContext}

**Tarefas em aberto (${pendingTasks?.length ?? 0} — todo + doing):**
${tasksContext}

**Próximos lembretes (${upcomingReminders?.length ?? 0}):**
${remindersContext}${financialContext}
${memoryBlock}

## Tratamento de Áudio 🎤
${message_type === 'audio' ? `A mensagem atual é um ÁUDIO transcrito. Regras obrigatórias:
- COMANDO direto (ex: "anota que...", "cria tarefa de...", "me lembra...", "gastei...") → execute o comando
- CONTEÚDO para salvar (reflexão, ideia, relato, plano) → use save_transcript
- PERGUNTA ou conversa casual → responda com just_reply
- ⛔ NUNCA use just_reply para áudios com conteúdo substancial (>3 frases) sem oferecer ação
- Áudios longos: crie título descritivo e salve o conteúdo completo` : ''}
${message_type === 'image' ? '📷 Imagem — descreva o que vê e sugira ação útil' : ''}
${message_type === 'document' ? '📄 Documento — resuma o conteúdo e ofereça salvar como nota' : ''}
${message_type === 'text' ? '💬 Mensagem de texto' : ''}

## 🗑️ Exclusão de Itens — OBRIGATÓRIO
Quando o usuário pedir para EXCLUIR, APAGAR, DELETAR, REMOVER, TIRAR qualquer item:
- Tarefa → use **delete_task** | Nota → use **delete_note** | Lembrete → use **cancel_reminder**

Palavras de exclusão: "excluir", "apagar", "deletar", "remover", "tira", "some", "cancela", "remove", "zera", "descarta"
⚠️ Quando não encontrar o item pelo nome exato, NÃO retorne erro vazio — o handler vai listar as opções disponíveis automaticamente.

## Regras de Ouro
1. ${formatInstruction}
2. Responda SEMPRE em português brasileiro
3. Use emojis com moderação (1-2 por mensagem)
4. Seja proativo: detecte padrões, sugira ações complementares
5. Para lembretes: extraia data/hora precisa e use ISO 8601 (ano base ${now.getFullYear()})
6. Se ambíguo, pergunte de forma gentil e direta — apenas UMA pergunta por vez
7. Use negrito (*texto*) para destacar itens importantes
8. ⛔ NUNCA ignore áudio com conteúdo — sempre ofereça salvar ou registrar
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

    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }

    let userContent: string | ContentPart[]
    if (message_type === 'image' && mediaInlineData) {
      userContent = [
        { type: 'text', text: effectiveText ?? '[Imagem]' },
        { type: 'image_url', image_url: { url: `data:${mediaInlineData.mime_type};base64,${mediaInlineData.data}` } },
      ]
    } else {
      userContent = effectiveText ?? ''
    }

    // ── 8. Tool definitions ───────────────────────────────────────────────────
    const toolDefinitions = [
      {
        type: 'function',
        function: {
          name: 'create_note',
          description: 'Cria uma NOVA nota. Antes de usar, verifique se já existe uma nota similar hoje (use update_note se sim). Para gastos financeiros use category="Financeiro".',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Título curto e descritivo' },
              content: { type: 'string', description: 'Conteúdo completo. Para gastos: liste cada item com valor.' },
              category: { type: 'string', description: 'Categoria: Trabalho, Pessoal, Ideia, Reunião, Financeiro, Saúde, Compras — NUNCA "Finanças"' },
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
          name: 'update_note',
          description: 'Edita/atualiza uma nota existente pelo título. Use quando o usuário quer corrigir, adicionar informação ou adicionar mais um gasto ao mesmo título do dia.',
          parameters: {
            type: 'object',
            properties: {
              note_title: { type: 'string', description: 'Título ou parte do título da nota a ser atualizada' },
              new_content: { type: 'string', description: 'Novo conteúdo completo da nota (substitui o antigo)' },
              append_content: { type: 'string', description: 'Conteúdo a ADICIONAR ao final da nota existente (use quando quiser acrescentar sem perder o que já estava)' },
              new_category: { type: 'string', description: 'Nova categoria (opcional, só se precisar mudar)' },
              reply_message: { type: 'string', description: 'Confirmação amigável' },
            },
            required: ['note_title', 'reply_message'],
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
          name: 'delete_task',
          description: 'Remove/deleta uma tarefa existente pelo título.',
          parameters: {
            type: 'object',
            properties: {
              task_title: { type: 'string', description: 'Título ou parte do título da tarefa a ser removida' },
              reply_message: { type: 'string', description: 'Confirmação amigável após deletar' },
            },
            required: ['task_title', 'reply_message'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_task_priority',
          description: 'Muda a prioridade de uma tarefa existente.',
          parameters: {
            type: 'object',
            properties: {
              task_title: { type: 'string', description: 'Título ou parte do título da tarefa' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Nova prioridade' },
              reply_message: { type: 'string', description: 'Confirmação amigável' },
            },
            required: ['task_title', 'priority', 'reply_message'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_reminder',
          description: 'Cria um lembrete para notificar o usuário em data/hora específica.',
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
          description: 'Marca uma tarefa como concluída, em andamento ou a fazer. Valores válidos: "todo", "doing", "done".',
          parameters: {
            type: 'object',
            properties: {
              task_title: { type: 'string', description: 'Título ou parte do título da tarefa para localizar' },
              new_status: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'Novo status: todo=a fazer, doing=em andamento, done=concluída' },
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
          name: 'create_contact',
          description: 'Salva uma nova pessoa na lista de contatos com nome e telefone.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nome completo do contato' },
              phone: { type: 'string', description: 'Número de telefone no formato E.164 (ex: +5511999998888)' },
              notes: { type: 'string', description: 'Observações sobre o contato (opcional)' },
              reply_message: { type: 'string', description: 'Confirmação amigável' },
            },
            required: ['name', 'phone', 'reply_message'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_notes',
          description: 'Busca notas por palavra-chave no título ou conteúdo.',
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
          description: 'Calcula e exibe o total de gastos registrados como notas Financeiras.',
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
          description: 'Lista tarefas do usuário.',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['todo', 'doing', 'done', 'pending'], description: 'Filtrar por status. "pending" = todo+doing' },
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
          description: 'Responde ao usuário sem nenhuma ação. Use para perguntas, conversas casuais ou quando nenhuma outra ferramenta se aplica.',
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
      {
        type: 'function',
        function: {
          name: 'save_transcript',
          description: 'Salva a transcrição/conteúdo de um áudio como nota estruturada.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Título descritivo resumindo o tema do áudio' },
              transcript: { type: 'string', description: 'Transcrição completa ou conteúdo fiel do áudio' },
              summary: { type: 'string', description: 'Resumo de 2-3 frases dos pontos principais' },
              category: { type: 'string', description: 'Categoria mais adequada: Pessoal, Ideia, Trabalho, Reunião, etc.' },
              reply_message: { type: 'string', description: 'Confirmação amigável com resumo do que foi salvo' },
            },
            required: ['title', 'transcript', 'summary', 'reply_message'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_note',
          description: 'Remove/deleta uma nota existente pelo título.',
          parameters: {
            type: 'object',
            properties: {
              note_title: { type: 'string', description: 'Título ou parte do título da nota a ser removida' },
              reply_message: { type: 'string', description: 'Confirmação amigável após deletar' },
            },
            required: ['note_title', 'reply_message'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'weekly_summary',
          description: 'Gera um resumo completo da semana: tarefas concluídas, novas notas, gastos totais.',
          parameters: {
            type: 'object',
            properties: {
              reply_message: { type: 'string', description: 'Introdução amigável antes do resumo' },
            },
            required: ['reply_message'],
            additionalProperties: false,
          },
        },
      },
    ]

    // ── 9. AI call — smart model routing + failover ───────────────────────────
    // For audio: use the TRANSCRIBED text (not the type) to evaluate complexity.
    // "Apaga a tarefa X" (audio) → flash. "Resumo semanal" (audio) → pro.
    const routingType = message_type === 'audio' ? 'text' : message_type
    const isComplex = isComplexRequest(effectiveText ?? '', routingType)
    const AI_MODELS = isComplex
      ? ['google/gemini-2.5-pro', 'google/gemini-3-flash-preview', 'google/gemini-2.5-flash']
      : ['google/gemini-3-flash-preview', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro']

    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages,
      { role: 'user', content: userContent },
    ]

    let fnName = 'just_reply'
    let fnArgs: Record<string, unknown> = { message: 'Olá! Como posso ajudar? 😊' }
    let aiCallSuccess = false
    let usedModel: string | null = null

    for (const model of AI_MODELS) {
      if (aiCallSuccess) break
      try {
        console.log(`[AI] Trying model: ${model} (complex=${isComplex})`)
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: aiMessages,
            tools: toolDefinitions,
            tool_choice: 'required',
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: 1500,
          }),
        })

        if (!aiResponse.ok) {
          const errText = await aiResponse.text()
          console.warn(`[AI] Model ${model} failed: HTTP ${aiResponse.status} — ${errText.slice(0, 200)}`)
          if (aiResponse.status === 429 || aiResponse.status === 402) {
            const fallback = aiResponse.status === 429
              ? '⚠️ Estou sobrecarregada no momento. Tente novamente em alguns segundos!'
              : '⚠️ Créditos de IA esgotados. Por favor, verifique as configurações.'
            await supabase.from('messages').insert({ workspace_id, conversation_id, direction: 'OUT', type: 'text', body_text: fallback, timestamp: new Date().toISOString() })
            await sendReply({ supabase, provider, workspace_id, sender_phone, replyText: fallback })
            return new Response(JSON.stringify({ ok: false, error: aiResponse.status === 429 ? 'rate_limited' : 'payment_required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
          continue
        }

        const aiData = await aiResponse.json()
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]

        if (!toolCall) {
          const rawContent = aiData.choices?.[0]?.message?.content
          console.warn(`[AI] Model ${model} returned no tool_call — using content as reply`)
          fnName = 'just_reply'
          fnArgs = { message: rawContent?.trim() || 'Como posso ajudar? 😊' }
          aiCallSuccess = true
          usedModel = model
        } else {
          fnName = toolCall.function.name
          try {
            fnArgs = JSON.parse(toolCall.function.arguments)
            aiCallSuccess = true
            usedModel = model
            console.log(`[AI] Model ${model} → tool=${fnName}`)
          } catch (parseErr) {
            console.error(`[AI] Model ${model} returned unparseable args:`, toolCall.function.arguments?.slice(0, 200))
          }
        }
      } catch (fetchErr) {
        console.error(`[AI] Model ${model} fetch exception:`, fetchErr)
      }
    }

    if (!aiCallSuccess) {
      const fallback = '😔 Não consegui processar sua mensagem agora. Tente novamente em instantes!'
      await supabase.from('messages').insert({ workspace_id, conversation_id, direction: 'OUT', type: 'text', body_text: fallback, timestamp: new Date().toISOString() })
      await sendReply({ supabase, provider, workspace_id, sender_phone, replyText: fallback })
      return new Response(JSON.stringify({ ok: false, error: 'all_models_failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let replyText = ''

    // ── 10. Execute chosen action ─────────────────────────────────────────────
    if (fnName === 'create_note') {
      // FIX: Always normalize category — never allow "Finanças", always "Financeiro"
      const isFinancial = normalizeFinancialCategory(fnArgs.category) || hasFinancialContent(`${fnArgs.title} ${fnArgs.content}`)
      const finalCategory = isFinancial ? 'Financeiro' : (fnArgs.category ?? 'Geral')
      const isReserva = /reserva|guardei|guardando/i.test(`${fnArgs.title} ${fnArgs.content}`)
      let skipInsert = false

      // ── Anti-duplicate: if reserva note already exists TODAY, skip creation ──
      if (isReserva) {
        const { data: todayReservaNote } = await supabase
          .from('notes')
          .select('id, title, content')
          .eq('workspace_id', workspace_id)
          .eq('category', 'Financeiro')
          .ilike('title', '%reserva%')
          .gte('created_at', todayStart.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        if (todayReservaNote?.length) {
          skipInsert = true
          const existingNote = todayReservaNote[0]
          console.log(`[Finance] Reserva already exists today (${existingNote.title}) — skipping duplicate creation`)
          const mesMesAtual = now.toISOString().slice(0, 7)
          const { data: existingMem } = await supabase
            .from('user_memory')
            .select('total_guardado_mes, mes_referencia')
            .eq('workspace_id', workspace_id)
            .maybeSingle()
          const currentTotal = existingMem?.mes_referencia === mesMesAtual
            ? Number(existingMem?.total_guardado_mes ?? 0)
            : 40
          const totalFmt = formatCurrency(currentTotal)
          replyText = `✅ Reserva de R$ 40,00 já registrada hoje!\n\nTotal guardado este mês: ${totalFmt} 🎯\n\nQuer filtro só reservas? Relatório completo? Só falar.`
        }
      }

      if (!skipInsert) {
        const { error: noteErr } = await supabase.from('notes').insert({
          workspace_id,
          title: fnArgs.title,
          content: fnArgs.content,
          category: finalCategory,
          tags: fnArgs.tags ?? [],
          source_message_id: null,
        })
        if (noteErr) console.error('Failed to insert note:', noteErr)

        if (isFinancial) {
          // ── FIX: For reserva notes, ALWAYS use R$ 40 (meta diária = valor fixo).
          // NEVER sum all values in content — content may have adjustment/confirmation lines
          // that re-state the same R$ 40 in different ways ("Para totalizar R$ 40,00", etc.)
          // For non-reserva financial notes, extract first monetary value only.
          let reservaValue: number
          if (isReserva) {
            reservaValue = 40 // meta diária fixa do Paulo
          } else {
            const firstMatch = (fnArgs.content as string ?? '').match(/R\$\s*([\d]+(?:[.,]\d{1,2})?)/)
            reservaValue = firstMatch ? parseFloat(firstMatch[1].replace(',', '.')) : 0
          }

          const mesMesAtual = now.toISOString().slice(0, 7)

          // ── Safe upsert user_memory ──────────────────────────────────────
          if (reservaValue > 0) {
            try {
              const { data: existingMem } = await supabase
                .from('user_memory')
                .select('total_guardado_mes, mes_referencia')
                .eq('workspace_id', workspace_id)
                .maybeSingle()

              // Reset total when month changes
              const currentTotal = existingMem?.mes_referencia === mesMesAtual
                ? Number(existingMem?.total_guardado_mes ?? 0) + reservaValue
                : reservaValue

              const { error: memErr } = await supabase
                .from('user_memory')
                .upsert(
                  {
                    workspace_id,
                    meta_diaria: 40.00,
                    total_guardado_mes: currentTotal,
                    mes_referencia: mesMesAtual,
                    ...(isReserva ? {
                      ultima_reserva_data: now.toISOString().slice(0, 10),
                      ultima_reserva_valor: reservaValue,
                    } : {}),
                  },
                  { onConflict: 'workspace_id' }
                )

              const totalMesFmt = formatCurrency(currentTotal)
              if (memErr) {
                console.warn('[Memory] upsert failed:', memErr)
                replyText = fnArgs.reply_message ?? `✅ ${isReserva ? 'Reserva' : 'Gasto'} registrado: ${fnArgs.title}`
              } else if (isReserva) {
                replyText = `✅ Reserva registrada! R$ 40,00 adicionados à sua meta diária.\n\nTotal guardado este mês: ${totalMesFmt} 💰\n\nQuer filtro só reservas? Gráfico? PDF? Só falar, mano!`
              } else {
                replyText = fnArgs.reply_message ?? `✅ Gasto registrado: ${fnArgs.title} (${formatCurrency(reservaValue)})`
              }
            } catch (memErr) {
              console.warn('[Memory] Failed to upsert user_memory:', memErr)
              replyText = fnArgs.reply_message ?? `✅ ${isReserva ? 'Reserva' : 'Gasto'} registrado: ${fnArgs.title}`
            }
          } else {
            replyText = fnArgs.reply_message ?? `✅ Nota financeira criada: ${fnArgs.title}`
          }
        } else {
        replyText = fnArgs.reply_message ?? `✅ Nota criada: ${fnArgs.title}`
      }
    } else if (fnName === 'update_note') {
      // Find note by fuzzy title match
      const { data: matchingNotes } = await supabase
        .from('notes')
        .select('id, title, content')
        .eq('workspace_id', workspace_id)
        .ilike('title', `%${fnArgs.note_title}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      if (matchingNotes?.length) {
        const note = matchingNotes[0]
        let updatedContent: string

        if (fnArgs.append_content) {
          // Append mode: add to existing content
          updatedContent = `${note.content ?? ''}\n${fnArgs.append_content}`.trim()
        } else if (fnArgs.new_content) {
          // Replace mode
          updatedContent = fnArgs.new_content as string
        } else {
          updatedContent = note.content ?? ''
        }

        const updatePayload: Record<string, unknown> = { content: updatedContent }
        if (fnArgs.new_category) {
          // Also normalize category on update
          const isFinCat = normalizeFinancialCategory(fnArgs.new_category as string)
          updatePayload.category = isFinCat ? 'Financeiro' : fnArgs.new_category
        }

        const { error: updateErr } = await supabase
          .from('notes')
          .update(updatePayload)
          .eq('id', note.id)
        if (updateErr) console.error('Failed to update note:', updateErr)
        replyText = fnArgs.reply_message ?? `✅ Nota "${note.title}" atualizada.`
      } else {
        replyText = `❌ Não encontrei nenhuma nota com o nome "${fnArgs.note_title}". Verifique o nome e tente novamente.`
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
    } else if (fnName === 'delete_task') {
      let matchingTasks: { id: string; title: string }[] | null = null

      // Primary match: full phrase
      const { data: primaryMatch } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .ilike('title', `%${fnArgs.task_title}%`)
        .limit(1)
      matchingTasks = primaryMatch ?? []

      // Fallback: try matching by first significant word (>3 chars)
      if (!matchingTasks.length) {
        const words = (fnArgs.task_title as string).split(' ').filter((w: string) => w.length > 3)
        if (words.length > 0) {
          const { data: fallbackMatch } = await supabase
            .from('tasks')
            .select('id, title')
            .eq('workspace_id', workspace_id)
            .ilike('title', `%${words[0]}%`)
            .limit(1)
          matchingTasks = fallbackMatch ?? []
        }
      }

      if (matchingTasks.length) {
        const { error: delErr } = await supabase.from('tasks').delete().eq('id', matchingTasks[0].id)
        if (delErr) console.error('Failed to delete task:', delErr)
        replyText = fnArgs.reply_message ?? `🗑️ Tarefa "${matchingTasks[0].title}" removida.`
      } else {
        // Not found — list available tasks so user can pick the right one
        const { data: allTasks } = await supabase
          .from('tasks')
          .select('title, status')
          .eq('workspace_id', workspace_id)
          .in('status', ['todo', 'doing'])
          .order('created_at', { ascending: false })
          .limit(8)

        if (allTasks?.length) {
          const lista = allTasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
          replyText = `Não encontrei uma tarefa com esse nome. Suas tarefas atuais:\n\n${lista}\n\nQual delas você quer excluir?`
        } else {
          replyText = 'Não encontrei essa tarefa e você não tem tarefas em aberto no momento.'
        }
      }
    } else if (fnName === 'set_task_priority') {
      const { data: matchingTasks } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .ilike('title', `%${fnArgs.task_title}%`)
        .limit(1)

      if (matchingTasks?.length) {
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({ priority: fnArgs.priority })
          .eq('id', matchingTasks[0].id)
        if (updateErr) console.error('Failed to set task priority:', updateErr)
        const prioLabel = fnArgs.priority === 'high' ? '🔴 alta' : fnArgs.priority === 'low' ? '🟢 baixa' : '🟡 média'
        replyText = fnArgs.reply_message ?? `✅ Prioridade da tarefa "${matchingTasks[0].title}" alterada para ${prioLabel}.`
      } else {
        replyText = `❌ Não encontrei nenhuma tarefa com o nome "${fnArgs.task_title}".`
      }
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
      const { data: matchingTasks } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .ilike('title', `%${fnArgs.task_title}%`)
        .limit(1)

      if (matchingTasks?.length) {
        const task = matchingTasks[0]
        // FIX: normalize status — "in_progress" → "doing"
        let finalStatus = fnArgs.new_status as string
        if (finalStatus === 'in_progress') finalStatus = 'doing'
        const completedAt = finalStatus === 'done' ? new Date().toISOString() : null
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({ status: finalStatus, completed_at: completedAt })
          .eq('id', task.id)
        if (updateErr) console.error('Failed to update task:', updateErr)
        replyText = fnArgs.reply_message ?? `✅ Tarefa "${task.title}" atualizada: ${finalStatus}`
      } else {
        replyText = `❌ Não encontrei nenhuma tarefa com o nome "${fnArgs.task_title}". Verifique o nome e tente novamente.`
      }
    } else if (fnName === 'create_contact') {
      // Normalize phone to E.164 if needed
      let phone = (fnArgs.phone as string).trim()
      if (!phone.startsWith('+')) {
        // Assume Brazilian number if no country code
        phone = '+55' + phone.replace(/\D/g, '')
      }

      const { error: contactErr } = await supabase.from('contacts').upsert({
        workspace_id,
        name: fnArgs.name,
        phone_e164: phone,
        notes: fnArgs.notes ?? null,
        tags: [],
      }, { onConflict: 'workspace_id,phone_e164' })
      if (contactErr) console.error('Failed to create contact:', contactErr)
      replyText = fnArgs.reply_message ?? `✅ Contato "${fnArgs.name}" salvo: ${phone}`
    } else if (fnName === 'search_notes') {
      const q = supabase
        .from('notes')
        .select('title, category, content, created_at')
        .eq('workspace_id', workspace_id)
        .or(`title.ilike.%${fnArgs.query}%,content.ilike.%${fnArgs.query}%`)
        .order('created_at', { ascending: false })
        .limit(8)

      if (fnArgs.category) q.eq('category', fnArgs.category)

      const { data: searchResults } = await q

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
      const nowLocal = new Date()
      let dateFrom: Date
      if (fnArgs.period === 'hoje') {
        dateFrom = new Date(nowLocal); dateFrom.setHours(0, 0, 0, 0)
      } else if (fnArgs.period === 'semana') {
        dateFrom = new Date(nowLocal); dateFrom.setDate(nowLocal.getDate() - 7)
      } else {
        dateFrom = new Date(nowLocal); dateFrom.setDate(1); dateFrom.setHours(0, 0, 0, 0)
      }

      // Single query — no N+1
      const { data: allPeriodNotes } = await supabase
        .from('notes')
        .select('id, title, content, category, created_at')
        .eq('workspace_id', workspace_id)
        .gte('created_at', dateFrom.toISOString())
        .order('created_at', { ascending: false })

      const allFinancialNotes = (allPeriodNotes ?? []).filter(n => {
        const isFinancialCat = normalizeFinancialCategory(n.category)
        const text = `${n.title ?? ''} ${n.content ?? ''}`
        return isFinancialCat || hasFinancialContent(text)
      })

      if (!allFinancialNotes.length) {
        const periodLabel = fnArgs.period === 'hoje' ? 'hoje' : fnArgs.period === 'semana' ? 'nos últimos 7 dias' : 'este mês'
        replyText = `💰 Nenhum gasto registrado ${periodLabel}.`
      } else {
        let grandTotal = 0
        const lines: string[] = []
        for (const fn of allFinancialNotes) {
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
      // FIX: use 'doing' not 'in_progress'
      const statusValues = statusFilter === 'done' ? ['done'] : ['todo', 'doing']
      const { data: tasksList } = await supabase
        .from('tasks')
        .select('title, priority, status, due_at')
        .eq('workspace_id', workspace_id)
        .in('status', statusValues)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(10)

      if (!tasksList?.length) {
        replyText = '✅ Nenhuma tarefa pendente. Tudo em dia!'
      } else {
        const listStr = tasksList.map((t, i) => {
          const prioEmoji = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡'
          const statusEmoji = t.status === 'doing' ? ' ▶️' : ''
          const due = t.due_at ? ` — vence ${new Date(t.due_at).toLocaleDateString('pt-BR', { timeZone: tz })}` : ''
          return `${i + 1}. ${prioEmoji} *${t.title}*${statusEmoji}${due}`
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
      let matchingReminders: { id: string; title: string }[] | null = null

      // Primary match
      const { data: primaryReminderMatch } = await supabase
        .from('reminders')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .eq('status', 'scheduled')
        .ilike('title', `%${fnArgs.reminder_title}%`)
        .limit(1)
      matchingReminders = primaryReminderMatch ?? []

      // Fallback: try first significant word
      if (!matchingReminders.length) {
        const words = (fnArgs.reminder_title as string).split(' ').filter((w: string) => w.length > 3)
        if (words.length > 0) {
          const { data: fallbackReminderMatch } = await supabase
            .from('reminders')
            .select('id, title')
            .eq('workspace_id', workspace_id)
            .eq('status', 'scheduled')
            .ilike('title', `%${words[0]}%`)
            .limit(1)
          matchingReminders = fallbackReminderMatch ?? []
        }
      }

      if (matchingReminders.length) {
        const r = matchingReminders[0]
        const { error: cancelErr } = await supabase
          .from('reminders')
          .update({ status: 'canceled' })
          .eq('id', r.id)
        if (cancelErr) console.error('Failed to cancel reminder:', cancelErr)
        replyText = fnArgs.reply_message ?? `✅ Lembrete "${r.title}" cancelado.`
      } else {
        // Not found — list available reminders
        const { data: allReminders } = await supabase
          .from('reminders')
          .select('title, remind_at')
          .eq('workspace_id', workspace_id)
          .eq('status', 'scheduled')
          .gte('remind_at', new Date().toISOString())
          .order('remind_at', { ascending: true })
          .limit(8)

        if (allReminders?.length) {
          const lista = allReminders.map((r, i) => {
            const dt = new Date(r.remind_at).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })
            return `${i + 1}. ${r.title} (${dt})`
          }).join('\n')
          replyText = `Não achei esse lembrete. Seus lembretes agendados:\n\n${lista}\n\nQual deles você quer cancelar?`
        } else {
          replyText = 'Não encontrei esse lembrete e você não tem lembretes agendados no momento.'
        }
      }
    } else if (fnName === 'save_transcript') {
      const { error: transcriptErr } = await supabase.from('notes').insert({
        workspace_id,
        title: fnArgs.title,
        content: `${fnArgs.summary}\n\n---\n\n${fnArgs.transcript}`,
        category: fnArgs.category ?? 'Pessoal',
        tags: ['áudio', 'transcrição'],
        source_message_id: null,
      })
      if (transcriptErr) console.error('Failed to save transcript:', transcriptErr)
      replyText = fnArgs.reply_message ?? `✅ Áudio salvo como nota: "${fnArgs.title}"`
    } else if (fnName === 'delete_note') {
      let matchingNotes: { id: string; title: string }[] | null = null

      // Primary match: full phrase
      const { data: primaryNoteMatch } = await supabase
        .from('notes')
        .select('id, title')
        .eq('workspace_id', workspace_id)
        .ilike('title', `%${fnArgs.note_title}%`)
        .limit(1)
      matchingNotes = primaryNoteMatch ?? []

      // Fallback: try first significant word
      if (!matchingNotes.length) {
        const words = (fnArgs.note_title as string).split(' ').filter((w: string) => w.length > 3)
        if (words.length > 0) {
          const { data: fallbackNoteMatch } = await supabase
            .from('notes')
            .select('id, title')
            .eq('workspace_id', workspace_id)
            .ilike('title', `%${words[0]}%`)
            .limit(1)
          matchingNotes = fallbackNoteMatch ?? []
        }
      }

      if (matchingNotes.length) {
        const { error: delErr } = await supabase.from('notes').delete().eq('id', matchingNotes[0].id)
        if (delErr) console.error('Failed to delete note:', delErr)
        replyText = fnArgs.reply_message ?? `🗑️ Nota "${matchingNotes[0].title}" removida.`
      } else {
        // Not found — list available notes
        const { data: allNotes } = await supabase
          .from('notes')
          .select('title, category')
          .eq('workspace_id', workspace_id)
          .order('created_at', { ascending: false })
          .limit(8)

        if (allNotes?.length) {
          const lista = allNotes.map((n, i) => `${i + 1}. ${n.title} (${n.category ?? 'Geral'})`).join('\n')
          replyText = `Não achei uma nota com esse nome. Suas notas recentes:\n\n${lista}\n\nQual delas você quer apagar?`
        } else {
          replyText = 'Não encontrei essa nota e você não tem notas salvas ainda.'
        }
      }
    } else if (fnName === 'weekly_summary') {
      const nowWk = new Date()
      const weekStart = new Date(nowWk)
      weekStart.setDate(nowWk.getDate() - 7)
      weekStart.setHours(0, 0, 0, 0)

      // FIX: Fetch all week data in parallel + single query for financial notes (no N+1)
      const [
        { data: weekNotes },
        { data: weekTasksDone },
        { data: weekReminders },
        { data: weekFinancialNotes },
      ] = await Promise.all([
        supabase.from('notes').select('id, title, category, created_at').eq('workspace_id', workspace_id).gte('created_at', weekStart.toISOString()).order('created_at', { ascending: false }).limit(20),
        supabase.from('tasks').select('id, title, status, completed_at').eq('workspace_id', workspace_id).eq('status', 'done').gte('updated_at', weekStart.toISOString()).limit(10),
        supabase.from('reminders').select('id, title, status').eq('workspace_id', workspace_id).in('status', ['sent', 'scheduled']).gte('remind_at', weekStart.toISOString()).limit(10),
        // FIX: Single query for all financial note contents — eliminates N+1
        supabase.from('notes').select('id, title, content, category').eq('workspace_id', workspace_id).gte('created_at', weekStart.toISOString()).or(`category.eq.Financeiro,category.ilike.%financ%,category.ilike.%gasto%`),
      ])

      const allWeekNotes = weekNotes ?? []
      const financialNotes = weekFinancialNotes ?? []

      let weekTotal = 0
      const financialLines: string[] = []
      for (const fn of financialNotes) {
        const text = `${fn.title ?? ''} ${fn.content ?? ''}`
        const fin = extractFinancialValues(text)
        if (fin.total > 0) {
          weekTotal += fin.total
          financialLines.push(`  • ${fn.title} — ${formatCurrency(fin.total)}`)
        }
      }

      const categoryCount: Record<string, number> = {}
      for (const n of allWeekNotes) {
        const cat = n.category ?? 'Geral'
        categoryCount[cat] = (categoryCount[cat] ?? 0) + 1
      }
      const notesByCat = Object.entries(categoryCount).map(([c, count]) => `  • ${c}: ${count}`).join('\n') || '  Nenhuma nota.'

      const tasksDoneList = (weekTasksDone ?? []).length > 0
        ? (weekTasksDone ?? []).map(t => `  ✅ ${t.title}`).join('\n')
        : '  Nenhuma tarefa concluída.'

      const remindersSent = (weekReminders ?? []).filter(r => r.status === 'sent').length
      const remindersScheduled = (weekReminders ?? []).filter(r => r.status === 'scheduled').length

      const sections: string[] = [
        `${fnArgs.reply_message}`,
        ``,
        `📝 *Notas criadas (${allWeekNotes.length}):*\n${notesByCat}`,
        ``,
        `✅ *Tarefas concluídas (${(weekTasksDone ?? []).length}):*\n${tasksDoneList}`,
        ``,
        `⏰ *Lembretes:* ${remindersSent} disparados, ${remindersScheduled} agendados`,
      ]
      if (weekTotal > 0) {
        sections.push(``)
        sections.push(`💰 *Gastos da semana (${financialLines.length} registros):*\n${financialLines.slice(0, 5).join('\n')}\n  *Total: ${formatCurrency(weekTotal)}*`)
      } else {
        sections.push(``)
        sections.push(`💰 *Gastos:* Nenhum gasto registrado na semana.`)
      }
      replyText = sections.join('\n')
    } else {
      // just_reply
      replyText = (fnArgs.message as string) ?? 'Olá! Como posso ajudar? 😊'
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

    // ── 11b. Update webhook_log with AI metrics ───────────────────────────────
    if (log_id) {
      supabase.from('webhook_logs').update({
        ai_model: usedModel ?? null,
        ai_action: fnName,
        response_ms: Date.now() - startTime,
      }).eq('id', log_id).then(({ error }) => {
        if (error) console.warn('[process-message] Failed to update webhook_log metrics:', error.message)
      })
    }

    // ── 12. Send reply to user ────────────────────────────────────────────────
    await sendReply({ supabase, provider, workspace_id, sender_phone, replyText })

    // ── 13. TTS audio reply ───────────────────────────────────────────────────
    const ttsEnabled = (settings as Record<string, unknown>)?.tts_enabled === true
    const ttsVoiceId = ((settings as Record<string, unknown>)?.tts_voice_id as string) ?? 'FGY2WhTYpPnrIDTdsKH5'

    const userRequestedAudio = message_type === 'text' && (
      /\b[áa]udio\b/i.test(message_text ?? '') ||
      /respond[ae]\s*(em\s*)?[áa]udio/i.test(message_text ?? '') ||
      /manda\s*(um\s*)?[áa]udio/i.test(message_text ?? '') ||
      /me\s*(manda|envia|fala|diz)\s*(em\s*)?[áa]udio/i.test(message_text ?? '') ||
      /fala\s*(pra\s*mim|em\s*voz|em\s*[áa]udio)/i.test(message_text ?? '') ||
      /em\s*voz\b/i.test(message_text ?? '') ||
      /\bvoz\s*(por\s*favor|pf|pfv)?\b/i.test(message_text ?? '')
    )
    const shouldSendAudio = ttsEnabled && (message_type === 'audio' || userRequestedAudio)

    console.log(`[TTS] ttsEnabled=${ttsEnabled} | message_type=${message_type} | userRequestedAudio=${userRequestedAudio} | shouldSendAudio=${shouldSendAudio}`)

    if (shouldSendAudio) {
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
        const ttsText = replyText.replace(/^\[?[áa]udio\]?:\s*/i, '').trim()
        const ttsRes = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ text: ttsText, voice_id: ttsVoiceId }),
        })
        if (ttsRes.ok) {
          const { base64, content_type } = await ttsRes.json()
          const phoneClean = sender_phone.replace(/^\+/, '')
          await sendAudioReply({ supabase, provider, workspace_id, phone: phoneClean, base64, content_type })
        } else {
          const errBody = await ttsRes.text()
          console.error(`[TTS] Falha na geração de áudio: status=${ttsRes.status} | body=${errBody.slice(0, 500)}`)
          await sendReply({ supabase, provider, workspace_id, sender_phone, replyText: '⚠️ Não consegui gerar o áudio agora. A resposta de texto já foi enviada acima.' })
        }
      } catch (ttsErr) {
        console.error('[TTS] Erro inesperado:', ttsErr)
        try {
          await sendReply({ supabase, provider, workspace_id, sender_phone, replyText: '⚠️ Ocorreu um erro ao gerar o áudio. Verifique a resposta em texto acima.' })
        } catch (_) { /* ignore */ }
      }
    }

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
    const cacheKey = `${workspace_id}:${provider}`
    let integration = getCachedIntegration(cacheKey)

    if (!integration) {
      const { data } = await supabase
        .from('integrations')
        .select('*')
        .eq('workspace_id', workspace_id)
        .eq('provider', provider)
        .eq('is_active', true)
        .maybeSingle()
      integration = data as Record<string, unknown> | null
      if (integration) setCachedIntegration(cacheKey, integration)
    }

    if (!integration) {
      const fallbackKey = `${workspace_id}:fallback`
      let fallback = getCachedIntegration(fallbackKey)
      if (!fallback) {
        const { data } = await supabase
          .from('integrations')
          .select('*')
          .eq('workspace_id', workspace_id)
          .eq('is_active', true)
          .in('provider', ['EVOLUTION', 'CLOUD', 'TELEGRAM'])
          .maybeSingle()
        fallback = data as Record<string, unknown> | null
        if (fallback) setCachedIntegration(fallbackKey, fallback)
      }

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
    const res = await fetch(`${integration.api_url}/message/sendText/${integration.instance_id}`, {
      method: 'POST',
      headers: {
        apikey: (integration.api_key_encrypted as string) ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[dispatchReply] EVOLUTION sendText failed (${res.status}):`, errBody.slice(0, 300))
    } else {
      console.log(`[dispatchReply] EVOLUTION sendText OK → phone=${phone}`)
    }
  } else if (provider === 'CLOUD') {
    const res = await fetch(`https://graph.facebook.com/v19.0/${integration.phone_number}/messages`, {
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
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[dispatchReply] CLOUD sendText failed (${res.status}):`, errBody.slice(0, 300))
    } else {
      console.log(`[dispatchReply] CLOUD sendText OK → phone=${phone}`)
    }
  } else if (provider === 'TELEGRAM') {
    const chatId = phone.startsWith('tg:') ? phone.slice(3) : phone
    const res = await fetch(`https://api.telegram.org/bot${integration.telegram_bot_token_encrypted}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[dispatchReply] TELEGRAM sendMessage failed (${res.status}):`, errBody.slice(0, 300))
    } else {
      console.log(`[dispatchReply] TELEGRAM sendMessage OK → chat=${chatId}`)
    }
  }
}

async function sendAudioReply({
  supabase,
  provider,
  workspace_id,
  phone,
  base64,
  content_type,
}: {
  supabase: ReturnType<typeof createClient>
  provider: string
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
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      console.warn('sendAudioReply: no active integration found')
      return
    }

    if (integration.provider === 'EVOLUTION') {
      const audioRes = await fetch(`${integration.api_url}/message/sendWhatsAppAudio/${integration.instance_id}`, {
        method: 'POST',
        headers: {
          apikey: (integration.api_key_encrypted as string) ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: phone, audio: base64, encoding: true }),
      })
      if (!audioRes.ok) {
        const errText = await audioRes.text()
        console.warn(`sendWhatsAppAudio failed (${audioRes.status}):`, errText.slice(0, 300))
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
            fileName: 'audio.mp3',
          }),
        })
      }
    } else if (integration.provider === 'TELEGRAM') {
      const chatId = phone.startsWith('tg:') ? phone.slice(3) : phone
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'audio/mpeg' })

      const form = new FormData()
      form.append('chat_id', chatId)
      form.append('voice', blob, 'voice.mp3')

      await fetch(`https://api.telegram.org/bot${integration.telegram_bot_token_encrypted}/sendVoice`, {
        method: 'POST',
        body: form,
      })
    }
  } catch (err) {
    console.warn('sendAudioReply error (non-blocking):', err)
  }
}
