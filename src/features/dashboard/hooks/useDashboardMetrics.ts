import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { startOfDay, subDays } from 'date-fns'

export interface DashboardMetrics {
  notesCount: number
  tasksCount: number
  remindersCount: number
  messagesCount: number
  todaySpend: number
  aiMetrics: { total: number; avgMs: number; topModel: string } | null
}

function parseMoneyFromText(text: string): number {
  const patterns = [
    /R\$\s*([\d]+(?:[.,]\d{1,2})?)/gi,
    /([\d]+(?:[.,]\d{1,2})?)\s*(?:reais|real)/gi,
  ]
  let total = 0
  const seen = new Set<string>()
  for (const pattern of patterns) {
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      const key = m[1]
      if (!seen.has(key)) {
        seen.add(key)
        const v = parseFloat(m[1].replace(',', '.'))
        if (!isNaN(v) && v > 0) total += v
      }
    }
  }
  return total
}

export function useDashboardMetrics(workspaceId: string | null) {
  const today = startOfDay(new Date()).toISOString()
  const tomorrow = startOfDay(subDays(new Date(), -1)).toISOString()
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: notesCount = 0, isLoading: loadingNotes } = useQuery({
    queryKey: ['dashboard-notes-today', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('notes').select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).gte('created_at', today).lt('created_at', tomorrow)
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: tasksCount = 0, isLoading: loadingTasks } = useQuery({
    queryKey: ['dashboard-tasks-pending', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('tasks').select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).in('status', ['todo', 'doing'])
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: remindersCount = 0, isLoading: loadingReminders } = useQuery({
    queryKey: ['dashboard-reminders-24h', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('reminders').select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('status', 'scheduled').lte('remind_at', next24h)
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: messagesCount = 0, isLoading: loadingMessages } = useQuery({
    queryKey: ['dashboard-messages-today', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('messages').select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direction', 'IN').gte('created_at', today)
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: todaySpend = 0, isLoading: loadingSpend } = useQuery({
    queryKey: ['dashboard-spend-today', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const [{ data: taggedNotes }, { data: otherNotes }] = await Promise.all([
        supabase.from('notes').select('title, content')
          .eq('workspace_id', workspaceId).eq('category', 'Financeiro').gte('created_at', today),
        supabase.from('notes').select('title, content')
          .eq('workspace_id', workspaceId).gte('created_at', today)
          .neq('category', 'Financeiro')
          .or('title.ilike.%reais%,content.ilike.%reais%,title.ilike.%R$%,content.ilike.%R$%'),
      ])
      const allNotes = [...(taggedNotes ?? []), ...(otherNotes ?? [])]
      return allNotes.reduce((sum, n) => sum + parseMoneyFromText(`${n.title ?? ''} ${n.content ?? ''}`), 0)
    },
    enabled: !!workspaceId,
  })

  const { data: aiMetrics = null, isLoading: loadingAiMetrics } = useQuery({
    queryKey: ['dashboard-ai-metrics', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null
      const { data } = await supabase
        .from('webhook_logs')
        .select('response_ms, ai_model, ai_action')
        .eq('workspace_id', workspaceId)
        .not('response_ms', 'is', null)
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!data || data.length === 0) return null
      const validMs = data.map(r => r.response_ms!).filter(v => v > 0)
      const avg = validMs.length > 0 ? Math.round(validMs.reduce((a, b) => a + b, 0) / validMs.length) : 0
      const modelCount: Record<string, number> = {}
      data.forEach(r => { if (r.ai_model) modelCount[r.ai_model] = (modelCount[r.ai_model] ?? 0) + 1 })
      const topModel = Object.entries(modelCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const shortModel = topModel.includes('flash') ? 'Flash' : topModel.includes('pro') ? 'Pro' : topModel.split('/').pop() ?? topModel
      return { total: data.length, avgMs: avg, topModel: shortModel }
    },
    enabled: !!workspaceId,
  })

  const isLoading = loadingNotes || loadingTasks || loadingReminders || loadingMessages || loadingSpend || loadingAiMetrics

  return {
    metrics: { notesCount, tasksCount, remindersCount, messagesCount, todaySpend, aiMetrics },
    isLoading,
    loadingNotes, loadingTasks, loadingReminders, loadingMessages, loadingSpend, loadingAiMetrics,
  }
}
