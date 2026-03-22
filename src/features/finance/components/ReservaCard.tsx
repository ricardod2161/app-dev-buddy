import React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { formatBRL } from '../lib/parse-finance'

interface ReservaCardProps {
  valor: number
  totalGuardado: number
  data: string   // DD/MM
  metaDiaria: number
}

export const ReservaCard: React.FC<ReservaCardProps> = ({
  valor, totalGuardado, data, metaDiaria,
}) => {
  return (
    <div className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-300 text-sm">
            ✅ Reserva registrada! {formatBRL(valor)} adicionados à sua meta diária de hoje.
          </p>
          <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
            Desculpa a confusão anterior, agora está salvo! (total: {formatBRL(totalGuardado)}).
          </p>
        </div>
      </div>

      <div className="text-xs text-green-800 dark:text-green-400 space-y-1">
        <p className="font-semibold">Gastos — Hoje:</p>
        <p>• Gasto com Reserva ({data}) — {formatBRL(valor)} ({data})</p>
        <p className="font-semibold">Total: {formatBRL(valor)}</p>
      </div>

      <p className="text-xs text-muted-foreground border-t border-green-200 dark:border-green-900 pt-2">
        Meta diária: {formatBRL(metaDiaria)} | Quer filtro só reservas? Gráfico? PDF? Só falar, mano!
      </p>
    </div>
  )
}
