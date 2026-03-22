import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'

interface UseProactiveModeOptions {
  workspaceId: string | null
  proactiveMode: boolean
  onTrigger: (prompt: string) => void
}

export function useProactiveMode({ workspaceId, proactiveMode, onTrigger }: UseProactiveModeOptions) {
  const triggeredRef = useRef(false)

  useEffect(() => {
    if (!proactiveMode || !workspaceId || triggeredRef.current) return

    const sessionKey = `zyntra_proactive_${workspaceId}_${new Date().toDateString()}`
    if (sessionStorage.getItem(sessionKey)) return

    const timer = setTimeout(async () => {
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)
      const { data } = await supabase
        .from('tasks')
        .select('title, priority, due_at, status')
        .eq('workspace_id', workspaceId)
        .in('status', ['todo', 'doing'])
        .lte('due_at', endOfDay.toISOString())
        .order('priority', { ascending: false })
        .limit(4)

      if (!data || data.length === 0) return
      triggeredRef.current = true
      sessionStorage.setItem(sessionKey, '1')

      const now = new Date().toISOString()
      const overdue = data.filter(t => t.due_at && new Date(t.due_at) < new Date(now))
      const dueToday = data.filter(t => t.due_at && new Date(t.due_at) >= new Date(now))
      const parts: string[] = []
      if (overdue.length > 0) parts.push(`ATRASADAS: ${overdue.map(t => `"${t.title}"`).join(', ')}`)
      if (dueToday.length > 0) parts.push(`VENCEM HOJE: ${dueToday.map(t => `"${t.title}"`).join(', ')}`)

      const briefingPrompt = `[MODO PROATIVO — BRIEFING AUTOMÁTICO]\n\nFaça um briefing proativo, empático e direto sobre as seguintes tarefas urgentes do usuário:\n${parts.join('\n')}\n\nSeja específico, priorize as mais críticas e sugira uma ação concreta para cada uma. Finalize perguntando se quer ajuda para executar alguma delas.`
      onTrigger(briefingPrompt)
    }, 1500)

    return () => clearTimeout(timer)
  }, [proactiveMode, workspaceId, onTrigger])
}
