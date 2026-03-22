import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { ParsedAction } from '../lib/parse-actions'

export async function executeActions(
  actions: ParsedAction[],
  workspaceId: string,
  onInvalidate?: (type: 'tasks' | 'notes' | 'reminders') => void
): Promise<void> {
  if (!workspaceId || actions.length === 0) return

  for (const action of actions) {
    try {
      if (action.type === 'create_task') {
        const { error } = await supabase.from('tasks').insert({
          workspace_id: workspaceId,
          title: action.params.title || 'Nova tarefa',
          priority: (action.params.priority as 'low' | 'medium' | 'high') || 'medium',
          status: 'todo',
          due_at: action.params.due || null,
          project: action.params.project || null,
        })
        if (!error) {
          onInvalidate?.('tasks')
          toast.success(`✅ Tarefa criada: ${action.params.title}`)
        }
      } else if (action.type === 'create_note') {
        const { error } = await supabase.from('notes').insert({
          workspace_id: workspaceId,
          title: action.params.title || 'Nova nota',
          content: action.params.content || '',
          category: action.params.category || null,
        })
        if (!error) {
          onInvalidate?.('notes')
          toast.success(`📝 Nota criada: ${action.params.title}`)
        }
      } else if (action.type === 'create_reminder') {
        const remindAt = action.params.remind_at
          ? new Date(action.params.remind_at).toISOString()
          : new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const { error } = await supabase.from('reminders').insert({
          workspace_id: workspaceId,
          message: action.params.message || 'Lembrete',
          title: action.params.title || null,
          channel: action.params.channel || 'whatsapp',
          remind_at: remindAt,
          status: 'scheduled',
        })
        if (!error) {
          onInvalidate?.('reminders')
          toast.success('🔔 Lembrete agendado!')
        }
      }
    } catch (e) {
      console.error('Action execution error:', e)
    }
  }
}
