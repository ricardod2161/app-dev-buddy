import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { FileText, CheckSquare, Bell, MessageSquare, Clock, TrendingDown, Bot, Sparkles, ArrowRight, Lightbulb, Loader2 } from 'lucide-react'
import { format, subDays, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { stripHtml, truncate } from '@/lib/utils'

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

const priorityColors: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400',
}

// ─── ZYNTRA Proactive Suggestions ────────────────────────────────────────────

const SESSION_KEY = 'zyntra_suggestions_cache'

interface SuggestionItem {
  text: string
  prompt: string
  icon: string
}

async function fetchSuggestions(workspaceId: string): Promise<SuggestionItem[]> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  // Get urgent tasks context
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

  // Extract JSON array from response
  const match = full.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON found')
  return JSON.parse(match[0]) as SuggestionItem[]
}

interface ZyntraCardProps {
  workspaceId: string
  onOpenChat: (prompt: string) => void
}

const ZyntraSuggestionsCard: React.FC<ZyntraCardProps> = ({ workspaceId, onOpenChat }) => {
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!workspaceId) return

    // Check session cache
    try {
      const cached = sessionStorage.getItem(SESSION_KEY)
      if (cached) {
        const { ts, data, wid } = JSON.parse(cached)
        // Cache valid for 30 min and same workspace
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

const DashboardPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const navigate = useNavigate()

  const today = startOfDay(new Date()).toISOString()
  const tomorrow = startOfDay(subDays(new Date(), -1)).toISOString()
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = subDays(new Date(), 6).toISOString()

  const { data: notesCount, isLoading: loadingNotes } = useQuery({
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

  const { data: tasksCount, isLoading: loadingTasks } = useQuery({
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

  const { data: remindersCount, isLoading: loadingReminders } = useQuery({
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

  const { data: messagesCount, isLoading: loadingMessages } = useQuery({
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

  const { data: notesChart, isLoading: loadingNotesChart } = useQuery({
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
        const day = format(new Date(n.created_at), 'dd/MM', { locale: ptBR })
        if (grouped[day] !== undefined) grouped[day]++
      })
      return Object.entries(grouped).map(([dia, notas]) => ({ dia, notas }))
    },
    enabled: !!workspaceId,
  })

  const { data: tasksChart, isLoading: loadingTasksChart } = useQuery({
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

  // Today's financial spend
  const { data: todaySpend, isLoading: loadingSpend } = useQuery({
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

  // AI response time metrics (last 24h from webhook_logs)
  const { data: aiMetrics, isLoading: loadingAiMetrics } = useQuery({
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

  // Recent activity
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

  const spendDisplay = todaySpend != null && todaySpend > 0
    ? todaySpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ 0,00'

  const metrics = [
    { label: 'Notas Hoje', value: notesCount, icon: FileText, loading: loadingNotes, color: 'text-primary', bg: 'bg-primary/10', isText: false },
    { label: 'Tarefas Pendentes', value: tasksCount, icon: CheckSquare, loading: loadingTasks, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/20', isText: false },
    { label: 'Lembretes (24h)', value: remindersCount, icon: Bell, loading: loadingReminders, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/20', isText: false },
    { label: 'Mensagens Hoje', value: messagesCount, icon: MessageSquare, loading: loadingMessages, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/20', isText: false },
    { label: 'Gastos Hoje', value: spendDisplay, icon: TrendingDown, loading: loadingSpend, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/20', isText: true },
  ]

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 sm:gap-4">
        {metrics.map(({ label, value, icon: Icon, loading, color, bg, isText }) => (
          <Card key={label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">{label}</p>
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
              </div>
              {loading
                ? <Skeleton className="h-8 w-16" />
                : isText
                  ? <p className="text-lg sm:text-xl font-bold text-foreground">{value}</p>
                  : <p className="text-2xl sm:text-3xl font-bold text-foreground">{value ?? 0}</p>
              }
            </CardContent>
          </Card>
        ))}

        {/* AI Metrics Card */}
        <Card className="hover:shadow-md transition-shadow col-span-2 xl:col-span-1">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">IA Hoje</p>
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            </div>
            {loadingAiMetrics
              ? <Skeleton className="h-8 w-20" />
              : aiMetrics
                ? (
                  <div className="space-y-1">
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">{aiMetrics.total}</p>
                    <p className="text-xs text-muted-foreground">
                      ~{aiMetrics.avgMs < 1000 ? `${aiMetrics.avgMs}ms` : `${(aiMetrics.avgMs / 1000).toFixed(1)}s`} · {aiMetrics.topModel}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs text-primary gap-1 -ml-1 mt-1"
                      onClick={() => navigate('/app/ai-chat')}
                    >
                      <Sparkles className="w-3 h-3" />Abrir Chat IA
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                )
                : (
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-foreground">—</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs text-primary gap-1 -ml-1"
                      onClick={() => navigate('/app/ai-chat')}
                    >
                      <Sparkles className="w-3 h-3" />Abrir Chat IA
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                )
            }
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Notas — Últimos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingNotesChart
              ? <Skeleton className="h-48 w-full" />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={notesChart ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="notas" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Tarefas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTasksChart
              ? <Skeleton className="h-48 w-full" />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tasksChart ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="status" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    />
                    <Bar dataKey="total" name="Tarefas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>
      </div>

      {/* ZYNTRA Proactive Suggestions */}
      <ZyntraSuggestionsCard workspaceId={workspaceId ?? ''} onOpenChat={(prompt) => navigate('/app/ai-chat', { state: { prompt } })} />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Notas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!recentNotes
              ? <Skeleton className="h-32 w-full" />
              : recentNotes.length === 0
                ? (
                  <div className="flex flex-col items-center py-6 gap-3">
                    <p className="text-sm text-muted-foreground">Nenhuma nota ainda</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/app/notes')}>
                      <FileText className="w-3.5 h-3.5 mr-1.5" />Criar primeira nota
                    </Button>
                  </div>
                )
                : (
                  <div className="space-y-3">
                    {recentNotes.map(note => (
                      <div key={note.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate('/app/notes')}>
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{note.title ?? '(sem título)'}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {truncate(stripHtml(note.content ?? ''), 60) || 'Sem conteúdo'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {note.category && <Badge variant="outline" className="text-xs hidden sm:inline-flex">{note.category}</Badge>}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(note.created_at), 'dd/MM', { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
            }
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-primary" /> Tarefas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!recentTasks
              ? <Skeleton className="h-32 w-full" />
              : recentTasks.length === 0
                ? (
                  <div className="flex flex-col items-center py-6 gap-3">
                    <p className="text-sm text-muted-foreground">Nenhuma tarefa ainda</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/app/tasks')}>
                      <CheckSquare className="w-3.5 h-3.5 mr-1.5" />Criar primeira tarefa
                    </Button>
                  </div>
                )
                : (
                  <div className="space-y-3">
                    {recentTasks.map(task => {
                      const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done'
                      return (
                        <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate('/app/tasks')}>
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${priorityColors[task.priority]}`}>
                            <CheckSquare className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {task.title}
                            </p>
                            {task.due_at && (
                              <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                                <Clock className="w-3 h-3" />
                                {format(new Date(task.due_at), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {task.status === 'todo' ? 'A fazer' : task.status === 'doing' ? 'Fazendo' : 'Feito'}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )
            }
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
