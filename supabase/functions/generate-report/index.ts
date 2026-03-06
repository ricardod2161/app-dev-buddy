import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { workspace_id, report_type, period_start, period_end } = await req.json()

    if (!workspace_id || !report_type || !period_start || !period_end) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const startISO = new Date(period_start).toISOString()
    const endISO = new Date(period_end + 'T23:59:59').toISOString()

    const [notesRes, tasksRes, remindersRes, messagesRes] = await Promise.all([
      supabase.from('notes').select('*').eq('workspace_id', workspace_id)
        .gte('created_at', startISO).lte('created_at', endISO),
      supabase.from('tasks').select('*').eq('workspace_id', workspace_id),
      supabase.from('reminders').select('*').eq('workspace_id', workspace_id)
        .gte('remind_at', startISO).lte('remind_at', endISO),
      supabase.from('messages').select('*').eq('workspace_id', workspace_id)
        .gte('created_at', startISO).lte('created_at', endISO),
    ])

    const notes = notesRes.data ?? []
    const allTasks = tasksRes.data ?? []
    const doneTasks = allTasks.filter(t =>
      t.status === 'done' && t.completed_at &&
      new Date(t.completed_at) >= new Date(startISO) &&
      new Date(t.completed_at) <= new Date(endISO)
    )
    const pendingTasks = allTasks.filter(t => t.status !== 'done')
    const reminders = remindersRes.data ?? []
    const messages = messagesRes.data ?? []
    const inboundMessages = messages.filter(m => m.direction === 'IN')

    const typeLabels: Record<string, string> = {
      daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', custom: 'Personalizado',
    }

    const formatDate = (iso: string) => {
      const d = new Date(iso)
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    }

    const formatDateTime = (iso: string) => {
      const d = new Date(iso)
      return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }

    const content = `📊 *Relatório ${typeLabels[report_type] ?? report_type} — ${formatDate(period_start)} a ${formatDate(period_end)}*
Gerado em ${formatDateTime(new Date().toISOString())}

📝 *Notas (${notes.length})*
${notes.map(n => `• ${n.title ?? '(sem título)'} — ${n.category ?? 'sem categoria'} — ${formatDate(n.created_at)}`).join('\n') || '• Nenhuma nota no período'}

✅ *Tarefas concluídas no período (${doneTasks.length})*
${doneTasks.map(t => `• ${t.title} — concluída em: ${t.completed_at ? formatDate(t.completed_at) : 'N/A'}`).join('\n') || '• Nenhuma tarefa concluída'}

⏳ *Tarefas pendentes (${pendingTasks.length})*
${pendingTasks.map(t => `• ${t.title} — prazo: ${t.due_at ? formatDate(t.due_at) : 'sem prazo'} — prioridade: ${t.priority ?? 'média'}`).join('\n') || '• Nenhuma tarefa pendente'}

⏰ *Lembretes do período (${reminders.length})*
${reminders.map(r => `• ${r.message} — ${r.status === 'sent' ? `disparado em: ${formatDateTime(r.remind_at)}` : `agendado para: ${formatDateTime(r.remind_at)}`}`).join('\n') || '• Nenhum lembrete'}

💬 *Mensagens recebidas (${inboundMessages.length})*
${inboundMessages.length > 0 ? `• ${inboundMessages.length} mensagem(ns) recebida(s) no período` : '• Nenhuma mensagem'}

---
Total de atividades: ${notes.length + doneTasks.length + pendingTasks.length + reminders.length + inboundMessages.length}`

    const { data: report, error } = await supabase.from('reports').insert({
      workspace_id,
      type: report_type,
      period_start,
      period_end,
      content,
    }).select().single()

    if (error) throw error

    return new Response(JSON.stringify({ ok: true, report }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('generate-report error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
