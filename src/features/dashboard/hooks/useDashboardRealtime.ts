import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export function useDashboardRealtime(workspaceId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!workspaceId) return
    const channel = supabase
      .channel(`dashboard-realtime-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard-tasks-pending', workspaceId] })
        qc.invalidateQueries({ queryKey: ['dashboard-tasks-chart', workspaceId] })
        qc.invalidateQueries({ queryKey: ['dashboard-recent-tasks', workspaceId] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard-notes-today', workspaceId] })
        qc.invalidateQueries({ queryKey: ['dashboard-notes-chart', workspaceId] })
        qc.invalidateQueries({ queryKey: ['dashboard-recent-notes', workspaceId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, qc])
}
