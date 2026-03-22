import React from 'react'
import { cn } from '@/lib/utils'
import { formatBRL } from '../lib/parse-finance'
import type { GastoEntry } from '../types/transaction.types'

interface GastoListProps {
  gastos: GastoEntry[]
  title: string               // "Gastos — Hoje" | "Gastos — Este mês"
  totalLabel?: string         // "Total" | "Total guardado este mês"
  showTotal?: boolean
  className?: string
  emptyMessage?: string
}

export const GastoList: React.FC<GastoListProps> = ({
  gastos, title, totalLabel = 'Total', showTotal = true, className, emptyMessage,
}) => {
  const total = gastos.reduce((s, g) => s + g.valor, 0)

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="font-semibold text-sm text-foreground">{title}:</p>

      {gastos.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-2">
          {emptyMessage ?? '💰 Nenhum gasto registrado.'}
        </p>
      ) : (
        <ul className="space-y-1">
          {gastos.map(g => (
            <li key={g.id} className="text-xs text-muted-foreground pl-2">
              • {g.title} ({g.data}) — {formatBRL(g.valor)} ({g.data})
            </li>
          ))}
        </ul>
      )}

      {showTotal && gastos.length > 0 && (
        <p className="text-xs font-semibold text-foreground pl-2 pt-1 border-t border-border">
          {totalLabel}: {formatBRL(total)}
        </p>
      )}
    </div>
  )
}
