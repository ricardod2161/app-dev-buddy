import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export function useDashboardActivity(workspaceId: string | null) {
  const { data: recentNotes } = useQuery({
    queryKey: ['dashboard-recent-notes', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase
        .from('notes').select('id, title, content, created_at, category')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(4)
      return data ?? []
    },
    enabled: !!workspaceId,
  })

  const { data: recentTasks } = useQuery({
    queryKey: ['dashboard-recent-tasks', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase
        .from('tasks').select('id, title, status, priority, due_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(4)
      return data ?? []
    },
    enabled: !!workspaceId,
  })

  return { recentNotes, recentTasks }
}
