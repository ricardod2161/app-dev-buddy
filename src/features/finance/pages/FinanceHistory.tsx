import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/EmptyState'
import { ArrowLeft, TrendingUp, Target, Calendar } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { useHistoricoMensal } from '../hooks/useHistoricoMensal'
import { useTotalGuardado } from '../hooks/useTotalGuardado'
import { formatBRL } from '../lib/parse-finance'

const META_ANUAL = 40 * 365   // R$ 14.600
const META_MENSAL = 40 * 30   // R$ 1.200 (approx)

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) => {
  if (active && payload && payload.length) {
    const value = payload[0].value
    return (
      <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-primary">{formatBRL(value)}</p>
        <p className="text-muted-foreground text-xs">Meta: {formatBRL(META_MENSAL)}</p>
      </div>
    )
  }
  return null
}

const FinanceHistory: React.FC = () => {
  const { workspaceId } = useAuth()
  const { data: historico = [], isLoading } = useHistoricoMensal(workspaceId)
  const { data: totalData } = useTotalGuardado(workspaceId)

  const totalAcumulado = historico.reduce((s, m) => s + m.total, 0)
  const progressoAnual = Math.min((totalAcumulado / META_ANUAL) * 100, 100)
  const metaDiaria = totalData?.memory?.meta_diaria ?? 40

  if (!workspaceId) {
    return <EmptyState title="Sem workspace" description="Faça login para ver o histórico." icon={TrendingUp} />
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link to="/app/finance">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-none">Histórico Anual</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Evolução mês a mês</p>
          </div>
        </div>
      </div>

      {/* Annual goal card */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Meta Anual — {formatBRL(META_ANUAL)}</span>
            <span className="ml-auto text-xs text-muted-foreground">R$ {metaDiaria}/dia × 365</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-3 w-full" />
          ) : (
            <>
              <Progress value={progressoAnual} className="h-3 mb-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Acumulado: <span className="font-semibold text-foreground">{formatBRL(totalAcumulado)}</span>
                </span>
                <span className="font-semibold text-primary">{progressoAnual.toFixed(1)}%</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Guardado por mês
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : historico.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum dado financeiro encontrado ainda.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  tickFormatter={(v) => `R$${v}`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={META_MENSAL}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  label={{ value: 'Meta', position: 'right', fontSize: 10, fill: 'hsl(var(--primary))' }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {historico.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.cumprida ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                      fillOpacity={entry.cumprida ? 0.9 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Barras coloridas = meta cumprida · linha pontilhada = meta mensal ({formatBRL(META_MENSAL)})
          </p>
        </CardContent>
      </Card>

      {/* Month-by-month table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Detalhe por mês</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs font-semibold text-muted-foreground">Mês</th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Guardado</th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Meta</th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...historico].reverse().map((m) => (
                    <tr key={m.mes} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-medium">{m.mesLabel}</td>
                      <td className="py-2 text-right font-semibold text-primary">{formatBRL(m.total)}</td>
                      <td className="py-2 text-right text-muted-foreground">{formatBRL(m.meta)}</td>
                      <td className="py-2 text-right text-base">
                        {m.total === 0 ? '🔴' : m.cumprida ? '✅' : '⏳'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2 font-bold text-xs">TOTAL</td>
                    <td className="py-2 text-right font-bold text-primary">{formatBRL(totalAcumulado)}</td>
                    <td className="py-2 text-right font-bold text-muted-foreground">{formatBRL(META_ANUAL)}</td>
                    <td className="py-2 text-right">{progressoAnual >= 100 ? '🏆' : '📈'}</td>
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
