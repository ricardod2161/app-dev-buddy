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
import { ChevronLeft, ChevronRight } from 'lucide-react'

const statusConfig: Record<WebhookLog['status'], { label: string; class: string }> = {
  ok: { label: 'OK', class: 'bg-green-100 text-green-700 border-green-200' },
  error: { label: 'Erro', class: 'bg-red-100 text-red-700 border-red-200' },
  auth_error: { label: 'Auth Error', class: 'bg-orange-100 text-orange-700 border-orange-200' },
  rate_limited: { label: 'Rate Limited', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
}

const PAGE_SIZE = 50

const LogsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const [page, setPage] = useState(0)
  const [filterProvider, setFilterProvider] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
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

      if (filterProvider) query = query.eq('provider', filterProvider)
      if (filterStatus) query = query.eq('status', filterStatus)
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

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="EVOLUTION">Evolution</SelectItem>
            <SelectItem value="CLOUD">Cloud API</SelectItem>
            <SelectItem value="TELEGRAM">Telegram</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="auth_error">Auth Error</SelectItem>
            <SelectItem value="rate_limited">Rate Limited</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
        <Button variant="outline" size="sm" onClick={() => { setFilterProvider(''); setFilterStatus(''); setStartDate(''); setEndDate(''); setPage(0) }}>
          Limpar Filtros
        </Button>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum log encontrado</CardContent></Card>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Data/Hora</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Provider</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Evento</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map(log => {
                const sc = statusConfig[log.status]
                return (
                  <tr
                    key={log.id}
                    className="bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-xs">{log.provider ?? '—'}</Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-foreground">{log.event_type ?? '—'}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={`text-xs ${sc.class}`}>{sc.label}</Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-destructive truncate max-w-48">
                      {log.error ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data?.count ?? 0} registros totais</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm">Página {page + 1} de {Math.max(1, totalPages)}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page + 1 >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Drawer de payload */}
      <Sheet open={!!selectedLog} onOpenChange={v => !v && setSelectedLog(null)}>
        <SheetContent side="right" className="w-[600px] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Payload do Webhook</SheetTitle>
            <SheetDescription>
              {selectedLog && format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              {' '}• {selectedLog?.provider} • {selectedLog?.event_type}
            </SheetDescription>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2">
                <Badge variant="outline" className={`${statusConfig[selectedLog.status].class}`}>
                  {statusConfig[selectedLog.status].label}
                </Badge>
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
