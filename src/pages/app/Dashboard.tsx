import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, Sparkles } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

// Dashboard feature modules
import { useDashboardMetrics } from '@/features/dashboard/hooks/useDashboardMetrics'
import { useDashboardCharts } from '@/features/dashboard/hooks/useDashboardCharts'
import { useDashboardRealtime } from '@/features/dashboard/hooks/useDashboardRealtime'
import { useDashboardActivity } from '@/features/dashboard/hooks/useDashboardActivity'
import { MetricsGrid } from '@/features/dashboard/components/MetricsGrid'
import { ChartsSection } from '@/features/dashboard/components/ChartsSection'
import { RecentActivity } from '@/features/dashboard/components/RecentActivity'

// ─── ZYNTRA Suggestions (kept here — small, tightly coupled to Dashboard) ────

const SESSION_KEY = 'zyntra_suggestions_cache'

interface SuggestionItem {
  text: string
  prompt: string
  icon: string
}

async function fetchSuggestions(workspaceId: string): Promise<SuggestionItem[]> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, priority, due_at, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['todo', 'doing'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(5)

  if (!tasks || tasks.length === 0) {
    return [
      { text: 'Sua agenda está limpa — quer planejar a semana?', prompt: 'Me ajuda a planejar minha semana com objetivos e metas claras', icon: '📅' },
      { text: 'Criar uma nota de revisão semanal', prompt: 'Me ajuda a criar uma estrutura de revisão semanal de produtividade', icon: '📝' },
    ]
  }

  const taskList = tasks.map((t, i) =>
    `${i + 1}. [${t.priority}/${t.status}] ${t.title}${t.due_at ? ` (prazo: ${new Date(t.due_at).toLocaleDateString('pt-BR')})` : ''}`
  ).join('\n')

  const promptMsg = `Com base nessas tarefas do usuário:\n${taskList}\n\nGere EXATAMENTE 3 sugestões proativas e curtas (máx 10 palavras cada) no formato JSON:\n[{"text":"sugestão curta","prompt":"prompt completo para o chat","icon":"emoji"}]`

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: promptMsg }],
        model: 'google/gemini-2.5-flash-lite',
        workspace_id: workspaceId,
        include_context: false,
        deep_think: false,
      }),
    }
  )

  if (!resp.ok || !resp.body) throw new Error('Failed to fetch suggestions')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (jsonStr === '[DONE]') break
      try {
        const parsed = JSON.parse(jsonStr)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) full += delta
      } catch { /* ignore */ }
    }
  }

  const match = full.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON found')
  return JSON.parse(match[0]) as SuggestionItem[]
}

const ZyntraSuggestionsCard: React.FC<{ workspaceId: string; onOpenChat: (prompt: string) => void }> = ({ workspaceId, onOpenChat }) => {
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    try {
      const cached = sessionStorage.getItem(SESSION_KEY)
      if (cached) {
        const { ts, data, wid } = JSON.parse(cached)
        if (wid === workspaceId && Date.now() - ts < 30 * 60 * 1000) {
          setSuggestions(data)
          return
        }
      }
    } catch { /* ignore */ }

    setLoading(true)
    fetchSuggestions(workspaceId)
      .then(data => {
        setSuggestions(data)
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), data, wid: workspaceId }))
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [workspaceId])

  if (error) return null

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          ZYNTRA sugere
          <Badge variant="outline" className="text-xs ml-auto">IA proativa</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Analisando suas tarefas…</span>
          </div>
        ) : suggestions ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onOpenChat(s.prompt)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/20 hover:border-primary/50 hover:bg-primary/10 transition-all text-xs text-foreground group"
              >
                <span>{s.icon}</span>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">{s.text}</span>
                <ArrowRight className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const navigate = useNavigate()

  useDashboardRealtime(workspaceId)

  const {
    metrics,
    loadingNotes, loadingTasks, loadingReminders,
    loadingMessages, loadingSpend, loadingAiMetrics,
  } = useDashboardMetrics(workspaceId)

  const { notesChart, tasksChart, loadingNotesChart, loadingTasksChart } = useDashboardCharts(workspaceId)
  const { recentNotes, recentTasks } = useDashboardActivity(workspaceId)

  return (
    <div className="space-y-6 animate-slide-up">
      <MetricsGrid
        metrics={metrics}
        loadingNotes={loadingNotes}
        loadingTasks={loadingTasks}
        loadingReminders={loadingReminders}
        loadingMessages={loadingMessages}
        loadingSpend={loadingSpend}
        loadingAiMetrics={loadingAiMetrics}
      />

      <ChartsSection
        notesChart={notesChart}
        tasksChart={tasksChart}
        loadingNotesChart={loadingNotesChart}
        loadingTasksChart={loadingTasksChart}
      />

      <ZyntraSuggestionsCard
        workspaceId={workspaceId ?? ''}
        onOpenChat={(prompt) => navigate('/app/ai-chat', { state: { prompt } })}
      />

      <RecentActivity recentNotes={recentNotes} recentTasks={recentTasks} />
    </div>
  )
}

export default DashboardPage
