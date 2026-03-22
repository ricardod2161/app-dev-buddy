import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/EmptyState'
import { ArrowLeft, TrendingUp, Target, Calendar, Info } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { useHistoricoMensal } from '../hooks/useHistoricoMensal'
import { useTotalGuardado } from '../hooks/useTotalGuardado'
import { formatBRL } from '../lib/parse-finance'

// R$ 40/dia × 365 dias
const META_ANUAL = 40 * 365    // R$ 14.600
const META_MENSAL = 40 * 30    // R$ 1.200 aprox

const CustomTooltip = ({
  active, payload, label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  const pct = META_MENSAL > 0 ? Math.min(100, (value / META_MENSAL) * 100) : 0
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-primary font-mono">{formatBRL(value)}</p>
      <p className="text-muted-foreground text-xs">
        Meta mensal: {formatBRL(META_MENSAL)} ({pct.toFixed(0)}%)
      </p>
    </div>
  )
}

/* ─── Month row in the table ─── */
const statusIcon = (total: number, cumprida: boolean) => {
  if (total === 0) return <span title="Sem registro">🔴</span>
  if (cumprida) return <span title="Meta cumprida">✅</span>
  return <span title="Em andamento">⏳</span>
}

const FinanceHistory: React.FC = () => {
  const { workspaceId } = useAuth()
  const { data: historico = [], isLoading } = useHistoricoMensal(workspaceId)
  const { data: totalData } = useTotalGuardado(workspaceId)

  // Sum only months with actual data
  const totalAcumulado = historico.reduce((s, m) => s + m.total, 0)
  const progressoAnual = Math.min((totalAcumulado / META_ANUAL) * 100, 100)
  const metaDiaria = totalData?.memory?.meta_diaria ?? 40

  // Stats
  const mesesComDado = historico.filter(m => m.total > 0).length
  const melhorMes = historico.reduce((best, m) => m.total > (best?.total ?? 0) ? m : best, null as typeof historico[0] | null)

  if (!workspaceId) {
    return (
      <EmptyState
        title="Sem workspace"
        description="Faça login para ver o histórico."
        icon={TrendingUp}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link to="/app/finance">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-none">Histórico Anual</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Evolução mês a mês — só reservas (poupança)</p>
          </div>
        </div>
      </div>

      {/* ── Disclaimer badge ── */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          Contabiliza apenas notas marcadas como <strong>reserva</strong> (poupança). Gastos e recebimentos ficam em Minhas Finanças.
        </span>
      </div>

      {/* ── Annual goal progress ── */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">Meta Anual</span>
            <Badge variant="outline" className="ml-auto font-mono text-xs">
              R$ {metaDiaria}/dia × 365 = {formatBRL(META_ANUAL)}
            </Badge>
          </div>
          {isLoading ? (
            <Skeleton className="h-3 w-full" />
          ) : (
            <>
              <Progress value={progressoAnual} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Acumulado:{' '}
                  <span className="font-semibold text-foreground">{formatBRL(totalAcumulado)}</span>
                </span>
                <span className="font-semibold text-primary">{progressoAnual.toFixed(2)}%</span>
              </div>
            </>
          )}

          {/* Mini stats row */}
          {!isLoading && mesesComDado > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Meses ativos</p>
                <p className="text-sm font-bold text-foreground">{mesesComDado}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Melhor mês</p>
                <p className="text-sm font-bold text-primary">
                  {melhorMes ? `${melhorMes.mesLabel} (${formatBRL(melhorMes.total)})` : '—'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bar chart ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Reservas guardadas por mês
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : historico.every(m => m.total === 0) ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <TrendingUp className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma reserva encontrada ainda.</p>
              <p className="text-xs text-muted-foreground">
                Diga ao assistente "guardei R$ 40" para registrar sua primeira reserva.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={historico} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="mesLabel"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `R$${v}`}
                  width={56}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <ReferenceLine
                  y={META_MENSAL}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  label={{
                    value: 'Meta',
                    position: 'right',
                    fontSize: 10,
                    fill: 'hsl(var(--primary))',
                  }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {historico.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.total === 0
                          ? 'hsl(var(--muted-foreground) / 0.2)'
                          : entry.cumprida
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--primary) / 0.5)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            ✅ Meta cumprida · 🟣 Em andamento · ⬜ Sem registro · linha = meta mensal ({formatBRL(META_MENSAL)})
          </p>
        </CardContent>
      </Card>

      {/* ── Month-by-month table ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Detalhe por mês</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs font-semibold text-muted-foreground">Mês</th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Guardado</th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground">% da meta</th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...historico].reverse().map((m) => {
                    const pctMes = META_MENSAL > 0 ? Math.min(100, (m.total / META_MENSAL) * 100) : 0
                    return (
                      <tr key={m.mes} className="border-b border-border/50 last:border-0">
                        <td className="py-2 font-medium">{m.mesLabel}</td>
                        <td className={`py-2 text-right font-semibold font-mono ${m.total === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                          {m.total === 0 ? '—' : formatBRL(m.total)}
                        </td>
                        <td className="py-2 text-right text-muted-foreground text-xs">
                          {m.total === 0 ? '—' : `${pctMes.toFixed(1)}%`}
                        </td>
                        <td className="py-2 text-right text-base">
                          {statusIcon(m.total, m.cumprida)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2 font-bold text-xs">TOTAL</td>
                    <td className="py-2 text-right font-bold text-primary font-mono">{formatBRL(totalAcumulado)}</td>
                    <td className="py-2 text-right font-bold text-muted-foreground text-xs">
                      {progressoAnual.toFixed(2)}% anual
                    </td>
                    <td className="py-2 text-right">
                      {progressoAnual >= 100 ? '🏆' : totalAcumulado > 0 ? '📈' : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default FinanceHistory
