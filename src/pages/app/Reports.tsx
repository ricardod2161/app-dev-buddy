import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Report } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart3, Download, Loader2, Plus } from 'lucide-react'

const typeLabels: Record<Report['type'], string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  monthly: 'Mensal',
  custom: 'Personalizado',
}

const ReportsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [reportType, setReportType] = useState<Report['type']>('daily')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [generatedContent, setGeneratedContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  const getDefaultDates = (type: Report['type']) => {
    const now = new Date()
    if (type === 'daily') return { start: format(now, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') }
    if (type === 'weekly') return { start: format(subDays(now, 6), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') }
    if (type === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: format(start, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') }
    }
    return { start: format(now, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') }
  }

  React.useEffect(() => {
    if (reportType !== 'custom') {
      const dates = getDefaultDates(reportType)
      setStartDate(dates.start)
      setEndDate(dates.end)
    }
  }, [reportType])

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports', workspaceId, page],
    queryFn: async () => {
      if (!workspaceId) return { data: [], count: 0 }
      const { data, count, error } = await supabase
        .from('reports').select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (error) throw error
      return { data: (data ?? []) as Report[], count: count ?? 0 }
    },
    enabled: !!workspaceId,
  })

  const generateReport = async () => {
    if (!workspaceId) return
    setGenerating(true)
    try {
      const { data: result, error } = await supabase.functions.invoke('generate-report', {
        body: {
          workspace_id: workspaceId,
          report_type: reportType,
          period_start: startDate,
          period_end: endDate,
        },
      })
      if (error) throw error
      if (!result?.ok) throw new Error(result?.error ?? 'Erro ao gerar relatório')
      setGeneratedContent(result.report?.content ?? '')
      toast.success('Relatório gerado e salvo!')
      qc.invalidateQueries({ queryKey: ['reports', workspaceId] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar relatório')
    } finally {
      setGenerating(false)
    }
  }

  const exportTxt = (report: Report) => {
    const blob = new Blob([report.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${report.type}-${report.period_start}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportMd = (report: Report) => {
    const mdContent = `# Relatório ${typeLabels[report.type]}\n**Período:** ${format(new Date(report.period_start), 'dd/MM/yyyy', { locale: ptBR })} — ${format(new Date(report.period_end), 'dd/MM/yyyy', { locale: ptBR })}\n**Gerado em:** ${format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n\n---\n\n${report.content}`
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${report.type}-${report.period_start}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Formulário */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> Gerar Relatório</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={reportType} onValueChange={v => setReportType(v as Report['type'])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Início</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={reportType !== 'custom'} className="mt-1" />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={reportType !== 'custom'} className="mt-1" />
            </div>
          </div>
          <Button onClick={generateReport} disabled={generating}>
            {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</> : <><Plus className="w-4 h-4 mr-2" />Gerar Relatório</>}
          </Button>
        </CardContent>
      </Card>

      {/* Prévia do relatório gerado */}
      {generatedContent && (
        <Card className="border-primary">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Relatório Gerado</CardTitle>
            <Button variant="outline" size="sm" onClick={() => {
              const blob = new Blob([generatedContent], { type: 'text/plain;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `relatorio-${reportType}-${startDate}.txt`; a.click()
              URL.revokeObjectURL(url)
            }}>
              <Download className="w-4 h-4 mr-2" />Exportar .txt
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg text-foreground">{generatedContent}</pre>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de Relatórios</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (reports?.data ?? []).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum relatório gerado</p>
          ) : (
            <div className="space-y-2">
              {(reports?.data ?? []).map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                   <div>
                     <Badge variant="outline">{typeLabels[r.type]}</Badge>
                     <span className="ml-2 text-sm text-foreground">
                       {format(new Date(r.period_start), 'dd/MM/yyyy', { locale: ptBR })} até {format(new Date(r.period_end), 'dd/MM/yyyy', { locale: ptBR })}
                     </span>
                     <span className="ml-2 text-xs text-muted-foreground">
                       {format(new Date(r.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                     </span>
                   </div>
                   <div className="flex gap-1">
                     <Button variant="ghost" size="sm" onClick={() => exportTxt(r)} title="Exportar .txt">
                       <Download className="w-4 h-4" />
                     </Button>
                     <Button variant="ghost" size="sm" onClick={() => exportMd(r)} title="Exportar .md" className="text-primary">
                       <span className="text-xs font-mono font-bold">.md</span>
                     </Button>
                   </div>
                 </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Anterior</Button>
                <span className="text-sm text-muted-foreground">Página {page + 1}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(reports?.data?.length ?? 0) < PAGE_SIZE}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ReportsPage
