import React from 'react'
import { formatBRL } from '../lib/parse-finance'
import type { GastoEntry, ReservaEntry } from '../types/transaction.types'

type ReportMode = 'hoje' | 'mes' | 'reservas'

interface WhatsAppStyleReportProps {
  mode: ReportMode
  gastos?: GastoEntry[]
  reservas?: ReservaEntry[]
  totalGuardado?: number
  metaDiariaCumprida?: boolean
}

/**
 * Renders a report in the exact WhatsApp format from Paulo's screenshots.
 */
export const WhatsAppStyleReport: React.FC<WhatsAppStyleReportProps> = ({
  mode, gastos = [], reservas = [], totalGuardado = 0, metaDiariaCumprida,
}) => {
  if (mode === 'hoje') {
    const total = gastos.reduce((s, g) => s + g.valor, 0)
    return (
      <div className="font-mono text-xs space-y-1 bg-muted/40 rounded-lg p-3 border border-border">
        <p className="font-semibold text-sm">Gastos — Hoje:</p>
        {gastos.length === 0
          ? <p>💰 Nenhum gasto registrado hoje.</p>
          : gastos.map(g => (
              <p key={g.id}>• {g.title} — {formatBRL(g.valor)} ({g.data})</p>
            ))
        }
        {gastos.length > 0 && (
          <p className="font-semibold pt-1 border-t border-border">Total: {formatBRL(total)}</p>
        )}
        <p className="text-muted-foreground pt-1 text-[11px]">
          Quer filtro só reservas? Gráfico? PDF? Só falar, mano!
        </p>
      </div>
    )
  }

  if (mode === 'mes') {
    const total = gastos.reduce((s, g) => s + g.valor, 0)
    return (
      <div className="font-mono text-xs space-y-1 bg-muted/40 rounded-lg p-3 border border-border">
        <p className="font-semibold text-sm">Gastos — Este mês:</p>
        {gastos.length === 0
          ? <p>💰 Nenhum gasto registrado este mês.</p>
          : gastos.map(g => (
              <p key={g.id}>• {g.title} — {formatBRL(g.valor)} ({g.data})</p>
            ))
        }
        {gastos.length > 0 && (
          <>
            <p className="font-semibold pt-1 border-t border-border">
              Total guardado este mês: {formatBRL(totalGuardado || total)}
            </p>
            <p>Meta diária cumprida: {metaDiariaCumprida ? '✅' : '⏳'}</p>
          </>
        )}
        <p className="text-muted-foreground pt-1 text-[11px]">
          Quer filtro só reservas? Gráfico? PDF? Só falar, mano!
        </p>
      </div>
    )
  }

  // mode === 'reservas'
  return (
    <div className="font-mono text-xs space-y-1.5 bg-muted/40 rounded-lg p-3 border border-border">
      <p className="font-semibold text-sm">Reservas (poupança) — Este mês:</p>
      {reservas.length === 0
        ? <p>💰 Nenhuma reserva encontrada.</p>
        : reservas.map((r, i) => (
            <div key={r.id} className="mt-1">
              <p className="font-semibold">{i + 1}. {r.title} ({r.data}) (Financeiro)</p>
              <p className="pl-3">• Reserva Diária (Meta Anual): {formatBRL(r.valor)}</p>
            </div>
          ))
      }
      {reservas.length > 0 && (
        <p className="font-semibold pt-1 border-t border-border">
          Total guardado: {formatBRL(totalGuardado)}
        </p>
      )}
      <p className="text-muted-foreground pt-1 text-[11px]">
        Quer filtro só reservas? Gráfico? PDF? Só falar, mano!
      </p>
    </div>
  )
}
