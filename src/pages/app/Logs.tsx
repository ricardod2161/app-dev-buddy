import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { WebhookLog } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SyntaxHighlighter } from '@/components/SyntaxHighlighter'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
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

const PAGE_SIZE = 50

const LogsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const [page, setPage] = useState(0)
  const [filterProvider, setFilterProvider] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)

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

  const logs = data?.data ?? []
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE)

  const clearFilters = () => {
    setFilterProvider('all')
    setFilterStatus('all')
    setStartDate('')
    setEndDate('')
    setPage(0)
  }

  return (
    <div className="space-y-4 animate-slide-up">
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
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Limpar
          </Button>
        )}
      </div>

      {/* Tabela */}
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
                    <tr
                      key={log.id}
                      className="bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedLog(log)}
                    >
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

      {/* Paginação */}
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
