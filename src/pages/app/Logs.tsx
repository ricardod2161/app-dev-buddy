import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { WebhookLog } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SyntaxHighlighter } from '@/components/SyntaxHighlighter'
import { ChevronLeft, ChevronRight, ScrollText, Bot, Zap, Clock, Activity } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

const statusConfig: Record<string, { label: string; class: string }> = {
  ok: { label: 'OK', class: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400' },
  error: { label: 'Erro', class: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' },
  auth_error: { label: 'Auth Error', class: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400' },
  rate_limited: { label: 'Rate Limited', class: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400' },
  processing: { label: 'Processando', class: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400' },
  ignored: { label: 'Ignorado', class: 'bg-muted text-muted-foreground border-border' },
  duplicate: { label: 'Duplicado', class: 'bg-muted text-muted-foreground border-border' },
  whitelist_blocked: { label: 'Bloqueado', class: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400' },
}

const actionConfig: Record<string, { label: string; class: string }> = {
  create_note: { label: 'Criar Nota', class: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400' },
  update_note: { label: 'Atualizar Nota', class: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400' },
  delete_note: { label: 'Apagar Nota', class: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' },
  save_transcript: { label: 'Salvar Áudio', class: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400' },
  create_task: { label: 'Criar Tarefa', class: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400' },
  update_task: { label: 'Atualizar Tarefa', class: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400' },
  delete_task: { label: 'Apagar Tarefa', class: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' },
  create_reminder: { label: 'Criar Lembrete', class: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400' },
  cancel_reminder: { label: 'Cancelar Lembrete', class: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400' },
  weekly_summary: { label: 'Resumo Semanal', class: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400' },
  just_reply: { label: 'Resposta', class: 'bg-muted text-muted-foreground border-border' },
}

const modelConfig: Record<string, { label: string; class: string }> = {
  'google/gemini-2.5-flash': { label: 'Gemini Flash', class: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400' },
  'google/gemini-2.5-flash-lite': { label: 'Flash Lite', class: 'bg-muted text-muted-foreground border-border' },
  'google/gemini-3-flash-preview': { label: 'Gemini 3 Flash', class: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400' },
  'google/gemini-2.5-pro': { label: 'Gemini Pro', class: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400' },
  'openai/gpt-5-nano': { label: 'GPT-5 Nano', class: 'bg-muted text-muted-foreground border-border' },
  'openai/gpt-5-mini': { label: 'GPT-5 Mini', class: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400' },
  'openai/gpt-5': { label: 'GPT-5', class: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' },
}

function getModelBadge(model: string | null) {
  if (!model) return null
  const cfg = modelConfig[model] ?? { label: model.split('/').pop() ?? model, class: 'bg-muted text-muted-foreground border-border' }
  return <Badge variant="outline" className={`text-xs ${cfg.class}`}>{cfg.label}</Badge>
}

function getActionBadge(action: string | null) {
  if (!action) return <span className="text-muted-foreground text-xs">—</span>
  const cfg = actionConfig[action] ?? { label: action, class: 'bg-muted text-muted-foreground border-border' }
  return <Badge variant="outline" className={`text-xs ${cfg.class}`}>{cfg.label}</Badge>
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const PAGE_SIZE = 50

const LogsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [filterProvider, setFilterProvider] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)
  const [aiPage, setAiPage] = useState(0)

  // Realtime subscription — invalidate queries when new AI logs arrive
  useEffect(() => {
    if (!workspaceId) return
    const channel = supabase
      .channel(`webhook-logs-rt-${workspaceId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'webhook_logs',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['webhook-logs', workspaceId] })
        queryClient.invalidateQueries({ queryKey: ['ai-logs', workspaceId] })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'webhook_logs',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['ai-logs', workspaceId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, queryClient])

  // ── Webhooks tab query ──────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['webhook-logs', workspaceId, page, filterProvider, filterStatus, startDate, endDate],
    queryFn: async () => {
      if (!workspaceId) return { data: [], count: 0 }
      let query = supabase
        .from('webhook_logs')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filterProvider !== 'all') query = query.eq('provider', filterProvider)
      if (filterStatus !== 'all') query = query.eq('status', filterStatus)
      if (startDate) query = query.gte('created_at', startDate)
      if (endDate) query = query.lte('created_at', endDate + 'T23:59:59')

      const { data, count, error } = await query
      if (error) throw error
      return { data: (data ?? []) as WebhookLog[], count: count ?? 0 }
    },
    enabled: !!workspaceId,
  })

  // ── AI logs tab query ────────────────────────────────────────────────────────
  const { data: aiData, isLoading: aiLoading } = useQuery({
    queryKey: ['ai-logs', workspaceId, aiPage],
    queryFn: async () => {
      if (!workspaceId) return { logs: [], count: 0, stats: null }
      const [logsRes, statsRes] = await Promise.all([
        supabase
          .from('webhook_logs')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .not('ai_action', 'is', null)
          .order('created_at', { ascending: false })
          .range(aiPage * PAGE_SIZE, (aiPage + 1) * PAGE_SIZE - 1),
        supabase
          .from('webhook_logs')
          .select('ai_model, ai_action, response_ms')
          .eq('workspace_id', workspaceId)
          .not('ai_action', 'is', null)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ])
      if (logsRes.error) throw logsRes.error

      const todayLogs = statsRes.data ?? []
      const total = todayLogs.length
      const avgMs = total > 0
        ? Math.round(todayLogs.reduce((acc, l) => acc + (l.response_ms ?? 0), 0) / total)
        : null

      const modelCounts: Record<string, number> = {}
      const actionCounts: Record<string, number> = {}
      for (const l of todayLogs) {
        if (l.ai_model) modelCounts[l.ai_model] = (modelCounts[l.ai_model] ?? 0) + 1
        if (l.ai_action) actionCounts[l.ai_action] = (actionCounts[l.ai_action] ?? 0) + 1
      }
      const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      return {
        logs: (logsRes.data ?? []) as WebhookLog[],
        count: logsRes.count ?? 0,
        stats: { total, avgMs, topModel, topAction },
      }
    },
    enabled: !!workspaceId,
  })

  const logs = data?.data ?? []
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE)
  const aiLogs = aiData?.logs ?? []
  const aiTotalPages = Math.ceil((aiData?.count ?? 0) / PAGE_SIZE)
  const stats = aiData?.stats

  const clearFilters = () => {
    setFilterProvider('all')
    setFilterStatus('all')
    setStartDate('')
    setEndDate('')
    setPage(0)
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <Tabs defaultValue="webhooks">
        <TabsList>
          <TabsTrigger value="webhooks" className="gap-2">
            <ScrollText className="w-4 h-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Bot className="w-4 h-4" />
            IA em Tempo Real
          </TabsTrigger>
        </TabsList>

        {/* ── Webhooks Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="webhooks" className="space-y-4 mt-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Select value={filterProvider} onValueChange={v => { setFilterProvider(v); setPage(0) }}>
              <SelectTrigger className="w-36 sm:w-40"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="EVOLUTION">Evolution</SelectItem>
                <SelectItem value="CLOUD">Cloud API</SelectItem>
                <SelectItem value="TELEGRAM">Telegram</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(0) }}>
              <SelectTrigger className="w-36 sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="auth_error">Auth Error</SelectItem>
                <SelectItem value="rate_limited">Rate Limited</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="ignored">Ignorado</SelectItem>
                <SelectItem value="duplicate">Duplicado</SelectItem>
                <SelectItem value="whitelist_blocked">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 sm:w-40" />
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 sm:w-40" />
            {(filterProvider !== 'all' || filterStatus !== 'all' || startDate || endDate) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : logs.length === 0 ? (
            <Card>
              <EmptyState
                icon={ScrollText}
                title="Nenhum log encontrado"
                description="Os logs de webhook aparecerão aqui quando o sistema receber eventos."
              />
            </Card>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Data/Hora</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Provider</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Evento</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.map(log => {
                      const sc = statusConfig[log.status ?? 'ok'] ?? { label: log.status ?? '—', class: 'bg-muted text-muted-foreground border-border' }
                      return (
                        <tr key={log.id} className="bg-card hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedLog(log)}>
                          <td className="py-3 px-4 text-xs text-muted-foreground font-mono whitespace-nowrap">
                            {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell">
                            <Badge variant="outline" className="text-xs">{log.provider ?? '—'}</Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-foreground max-w-[120px] truncate">{log.event_type ?? '—'}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={`text-xs ${sc.class}`}>{sc.label}</Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-destructive truncate max-w-48 hidden md:table-cell">
                            {log.error ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{data?.count ?? 0} registros</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">Pág. {page + 1} / {Math.max(1, totalPages)}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page + 1 >= totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── AI Real-time Tab ─────────────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Mensagens (24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {aiLoading ? <Skeleton className="h-7 w-16" /> : (
                  <p className="text-2xl font-bold text-foreground">{stats?.total ?? 0}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Tempo Médio
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {aiLoading ? <Skeleton className="h-7 w-20" /> : (
                  <p className="text-2xl font-bold text-foreground">{stats?.avgMs != null ? formatMs(stats.avgMs) : '—'}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" /> Modelo Top
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {aiLoading ? <Skeleton className="h-7 w-24" /> : (
                  <div className="mt-1">{getModelBadge(stats?.topModel ?? null) ?? <span className="text-muted-foreground text-sm">—</span>}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Ação Top
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {aiLoading ? <Skeleton className="h-7 w-24" /> : (
                  <div className="mt-1">{getActionBadge(stats?.topAction ?? null)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI logs table */}
          {aiLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : aiLogs.length === 0 ? (
            <Card>
              <EmptyState
                icon={Bot}
                title="Nenhuma métrica de IA ainda"
                description="As métricas aparecerão aqui após o processamento das próximas mensagens via WhatsApp ou Telegram."
              />
            </Card>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Data/Hora</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Provider</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Ação IA</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Modelo</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Tempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {aiLogs.map(log => (
                      <tr key={log.id} className="bg-card hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                        </td>
                        <td className="py-3 px-4 hidden sm:table-cell">
                          <Badge variant="outline" className="text-xs">{log.provider ?? '—'}</Badge>
                        </td>
                        <td className="py-3 px-4">{getActionBadge(log.ai_action)}</td>
                        <td className="py-3 px-4">{getModelBadge(log.ai_model) ?? <span className="text-muted-foreground text-xs">—</span>}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`text-xs font-mono font-medium ${
                            log.response_ms != null && log.response_ms > 8000
                              ? 'text-destructive'
                              : log.response_ms != null && log.response_ms > 4000
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            {formatMs(log.response_ms)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{aiData?.count ?? 0} registros com IA</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setAiPage(p => Math.max(0, p - 1))} disabled={aiPage === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">Pág. {aiPage + 1} / {Math.max(1, aiTotalPages)}</span>
              <Button variant="outline" size="sm" onClick={() => setAiPage(p => p + 1)} disabled={aiPage + 1 >= aiTotalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Drawer de payload */}
      <Sheet open={!!selectedLog} onOpenChange={v => !v && setSelectedLog(null)}>
        <SheetContent side="right" className="w-full sm:w-[600px] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Payload do Webhook</SheetTitle>
            <SheetDescription>
              {selectedLog && format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              {' '}• {selectedLog?.provider} • {selectedLog?.event_type}
            </SheetDescription>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                {(() => {
                  const sc = statusConfig[selectedLog.status ?? 'ok'] ?? { label: selectedLog.status ?? '—', class: 'bg-muted text-muted-foreground border-border' }
                  return <Badge variant="outline" className={sc.class}>{sc.label}</Badge>
                })()}
                {selectedLog.error && (
                  <span className="text-sm text-destructive">{selectedLog.error}</span>
                )}
              </div>
              {(selectedLog.ai_action || selectedLog.ai_model || selectedLog.response_ms) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Métricas de IA</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {getActionBadge(selectedLog.ai_action)}
                    {getModelBadge(selectedLog.ai_model)}
                    {selectedLog.response_ms != null && (
                      <span className="text-xs font-mono text-muted-foreground">{formatMs(selectedLog.response_ms)}</span>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Payload JSON:</p>
                <SyntaxHighlighter code={JSON.stringify(selectedLog.payload_json, null, 2)} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default LogsPage
