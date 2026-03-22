import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function useDashboardCharts(workspaceId: string | null) {
  const sevenDaysAgo = subDays(new Date(), 6).toISOString()

  const { data: notesChart = [], isLoading: loadingNotesChart } = useQuery({
    queryKey: ['dashboard-notes-chart', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase
        .from('notes').select('created_at')
        .eq('workspace_id', workspaceId).gte('created_at', sevenDaysAgo)
      const grouped: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        const day = format(subDays(new Date(), 6 - i), 'dd/MM', { locale: ptBR })
        grouped[day] = 0
      }
      data?.forEach(n => {
        const day = format(new Date(n.created_at!), 'dd/MM', { locale: ptBR })
        if (grouped[day] !== undefined) grouped[day]++
      })
      return Object.entries(grouped).map(([dia, notas]) => ({ dia, notas }))
    },
    enabled: !!workspaceId,
  })

  const { data: tasksChart = [], isLoading: loadingTasksChart } = useQuery({
    queryKey: ['dashboard-tasks-chart', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase.from('tasks').select('status').eq('workspace_id', workspaceId)
      const count = { todo: 0, doing: 0, done: 0 }
      data?.forEach(t => { if (t.status in count) count[t.status as keyof typeof count]++ })
      return [
        { status: 'A Fazer', total: count.todo },
        { status: 'Em Andamento', total: count.doing },
        { status: 'Concluído', total: count.done },
      ]
    },
    enabled: !!workspaceId,
  })

  return { notesChart, tasksChart, loadingNotesChart, loadingTasksChart }
}
