import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Wallet, TrendingUp, RefreshCw, RotateCcw, BarChart2, Sparkles, CheckCircle2, Calculator, CalendarPlus } from 'lucide-react'
import { useGastosMensais, useGastosHoje } from '../hooks/useGastosMensais'
import { useTotalGuardado } from '../hooks/useTotalGuardado'
import { useReservasMensais } from '../hooks/useReservasMensais'
import { MetaDiariaProgress } from '../components/MetaDiariaProgress'
import { EditMetaDialog } from '../components/EditMetaDialog'
import { ManualReservaDialog } from '../components/ManualReservaDialog'
import { WhatsAppStyleReport } from '../components/WhatsAppStyleReport'
import { monthLabel, formatBRL } from '../lib/parse-finance'
import {
  cleanDuplicateReservas,
  recalcularTotalGuardado,
  upsertFinanceMemory,
  type CleanupResult,
} from '../services/finance.service'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const FinanceDashboard: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [reportMode, setReportMode] = useState<'hoje' | 'mes' | 'reservas'>('mes')
  const [cleaning, setCleaning] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [lastCleanup, setLastCleanup] = useState<CleanupResult | null>(null)

  const { data: gastosMes = [], isLoading: loadingMes } = useGastosMensais(workspaceId)
  const { data: gastosHoje = [], isLoading: loadingHoje } = useGastosHoje(workspaceId)
  const { data: totalData, isLoading: loadingMemory } = useTotalGuardado(workspaceId)
  const { reservas, totalReservas, isLoading: loadingReservas } = useReservasMensais(workspaceId)

  const metaDiaria = totalData?.memory?.meta_diaria ?? 40
  const diasNoMes = totalData?.dias_no_mes ?? 30

  // Total guardado vem diretamente das notas de reserva (parser correto: R$40/nota)
  const totalGuardado = totalReservas > 0 ? totalReservas : (totalData?.memory?.total_guardado_mes ?? 0)

  const mesAtual = monthLabel(totalData?.memory?.mes_referencia)
  const metaMensal = totalData?.meta_mensal ?? metaDiaria * diasNoMes
  const progresso = metaMensal > 0 ? Math.min(100, (totalGuardado / metaMensal) * 100) : 0
  const metaDiariaCumprida = totalGuardado >= metaDiaria
  const totalHoje = gastosHoje.reduce((s, g) => s + g.valor, 0)

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['finance-gastos-mes', workspaceId] })
    qc.invalidateQueries({ queryKey: ['finance-gastos-hoje', workspaceId] })
    qc.invalidateQueries({ queryKey: ['finance-memory', workspaceId] })
    qc.invalidateQueries({ queryKey: ['finance-historico-mensal', workspaceId] })
    qc.invalidateQueries({ queryKey: ['finance-reservas-mes', workspaceId] })
  }

  const handleSaveMeta = async (newMeta: number) => {
    if (!workspaceId) return
    await upsertFinanceMemory(workspaceId, { meta_diaria: newMeta })
    toast.success(`Meta diária atualizada: ${formatBRL(newMeta)}/dia`)
    invalidateAll()
  }

  const handleClean = async () => {
    if (!workspaceId) return
    setCleaning(true)
    setLastCleanup(null)
    try {
      const result = await cleanDuplicateReservas(workspaceId)
      setLastCleanup(result)
      const total = result.notesFixed + result.notesMerged + result.notesNormalized
      if (total === 0) {
        toast.success('Nenhuma duplicata encontrada — notas já estão limpas ✅')
      } else {
        toast.success(
          `Limpeza: ${result.notesFixed} corrigida(s), ${result.notesNormalized} normalizada(s), ${result.notesMerged} mesclada(s)`,
        )
        invalidateAll()
      }
    } catch (err) {
      toast.error('Erro na limpeza: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCleaning(false)
    }
  }

  const handleRecalcular = async () => {
    if (!workspaceId) return
    setRecalculating(true)
    try {
      const { total, notasContadas } = await recalcularTotalGuardado(workspaceId)
      toast.success(`Total recalculado: ${formatBRL(total)} (${notasContadas} nota(s) de reserva)`)
      invalidateAll()
    } catch (err) {
      toast.error('Erro ao recalcular: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRecalculating(false)
    }
  }

  if (!workspaceId) {
    return <EmptyState title="Sem workspace" description="Faça login para acessar suas finanças." icon={Wallet} />
  }

  const isLoading = loadingMes || loadingHoje || loadingMemory || loadingReservas

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-none">Minhas Finanças</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Buddy Financeiro — Paulo</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Limpar notas duplicadas e linhas de ajuste"
            onClick={handleClean}
            disabled={cleaning}
          >
            {cleaning
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />
            }
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Recalcular total guardado (reprocessa todas as notas)"
            onClick={handleRecalcular}
            disabled={recalculating}
          >
            {recalculating
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Calculator className="w-4 h-4" />
            }
          </Button>
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link to="/app/finance/history">
              <BarChart2 className="w-4 h-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={invalidateAll} className="h-8 w-8" title="Atualizar dados">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Cleanup result banner ── */}
      {lastCleanup && (lastCleanup.notesFixed > 0 || lastCleanup.notesMerged > 0 || lastCleanup.notesNormalized > 0) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-primary">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Limpeza concluída
          </div>
          {lastCleanup.details.map((d, i) => (
            <p key={i} className="text-muted-foreground pl-5">• {d}</p>
          ))}
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3 px-3">
            <p className="text-[11px] text-muted-foreground leading-tight">Total guardado</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-base font-bold text-primary leading-tight mt-0.5">{formatBRL(totalGuardado)}</p>
            )}
            <Badge variant="outline" className="text-[9px] mt-1 px-1.5 h-4">
              {metaDiariaCumprida ? '✅ Meta ok' : '⏳ Em andamento'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3 px-3">
            <p className="text-[11px] text-muted-foreground leading-tight">Só reservas</p>
            {isLoading ? (
              <Skeleton className="h-6 w-16 mt-1" />
            ) : (
              <p className="text-base font-bold leading-tight mt-0.5">{formatBRL(totalReservas)}</p>
            )}
            <p className="text-[9px] text-muted-foreground mt-1">{reservas.length} nota(s)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3 px-3">
            <p className="text-[11px] text-muted-foreground leading-tight">Hoje</p>
            {isLoading ? (
              <Skeleton className="h-6 w-14 mt-1" />
            ) : (
              <p className="text-base font-bold leading-tight mt-0.5">{formatBRL(totalHoje)}</p>
            )}
            <p className="text-[9px] text-muted-foreground mt-1">{gastosHoje.length} lançamento(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Progress card ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Progresso da meta — {mesAtual}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <MetaDiariaProgress
              totalGuardado={totalGuardado}
              metaMensal={metaMensal}
              metaDiaria={metaDiaria}
              progresso={progresso}
              mesLabel={mesAtual}
              onEditMeta={() => setEditingMeta(true)}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Report tabs ── */}
      <Card>
        <CardContent className="px-4 pb-4 pt-3">
          <Tabs value={reportMode} onValueChange={v => setReportMode(v as typeof reportMode)}>
            <TabsList className="mb-3 h-8 text-xs w-full">
              <TabsTrigger value="hoje" className="text-xs px-3 flex-1">Hoje</TabsTrigger>
              <TabsTrigger value="mes" className="text-xs px-3 flex-1">Este mês</TabsTrigger>
              <TabsTrigger value="reservas" className="text-xs px-3 flex-1">Reservas</TabsTrigger>
            </TabsList>

            <TabsContent value="hoje">
              {isLoading ? <Skeleton className="h-24 w-full" /> : (
                <WhatsAppStyleReport mode="hoje" gastos={gastosHoje} totalGuardado={totalHoje} />
              )}
            </TabsContent>

            <TabsContent value="mes">
              {isLoading ? <Skeleton className="h-40 w-full" /> : (
                <WhatsAppStyleReport
                  mode="mes"
                  gastos={gastosMes}
                  totalGuardado={totalGuardado}
                  metaDiariaCumprida={metaDiariaCumprida}
                />
              )}
            </TabsContent>

            <TabsContent value="reservas">
              {isLoading ? <Skeleton className="h-40 w-full" /> : (
                <WhatsAppStyleReport mode="reservas" reservas={reservas} totalGuardado={totalReservas} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Footer ── */}
      <Button variant="outline" className="w-full text-xs h-9" asChild>
        <Link to="/app/finance/history">
          <BarChart2 className="w-3.5 h-3.5 mr-2" />
          Ver histórico anual completo
        </Link>
      </Button>

      {/* ── Edit Meta Dialog ── */}
      <EditMetaDialog
        open={editingMeta}
        onOpenChange={setEditingMeta}
        currentMeta={metaDiaria}
        mesLabel={mesAtual}
        diasNoMes={diasNoMes}
        onSave={handleSaveMeta}
      />
    </div>
  )
}

export default FinanceDashboard
