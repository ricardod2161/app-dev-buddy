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
    <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-foreground text-sm">
            ✅ Reserva registrada! {formatBRL(valor)} adicionados à sua meta diária de hoje.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Desculpa a confusão anterior, agora está salvo! (total: {formatBRL(totalGuardado)}).
          </p>
        </div>
      </div>

      <div className="text-xs text-foreground space-y-1">
        <p className="font-semibold">Gastos — Hoje:</p>
        <p className="text-muted-foreground">• Gasto com Reserva ({data}) — {formatBRL(valor)} ({data})</p>
        <p className="font-semibold">Total: {formatBRL(valor)}</p>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-2">
        Meta diária: {formatBRL(metaDiaria)} | Quer filtro só reservas? Gráfico? PDF? Só falar, mano!
      </p>
    </div>
  )
}
