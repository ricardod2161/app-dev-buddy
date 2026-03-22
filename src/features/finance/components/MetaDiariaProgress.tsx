import React from 'react'
import { cn } from '@/lib/utils'
import { formatBRL } from '../lib/parse-finance'
import { Pencil } from 'lucide-react'

interface MetaDiariaProgressProps {
  totalGuardado: number
  metaMensal: number
  metaDiaria: number
  progresso: number   // 0–100
  mesLabel: string
  onEditMeta?: () => void
}

export const MetaDiariaProgress: React.FC<MetaDiariaProgressProps> = ({
  totalGuardado, metaMensal, metaDiaria, progresso, mesLabel, onEditMeta,
}) => {
  const corClass = progresso >= 100 ? 'text-green-600 dark:text-green-400'
    : progresso >= 50 ? 'text-primary'
    : 'text-orange-500 dark:text-orange-400'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">{mesLabel}</span>
        <span className={cn('font-bold', corClass)}>{progresso.toFixed(0)}%</span>
      </div>

      {/* Manual progress bar using design tokens */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min(100, progresso)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">{formatBRL(totalGuardado)}</strong> guardados
        </span>
        <span>Meta: {formatBRL(metaMensal)}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <p>
          Meta diária: <strong className="text-foreground">{formatBRL(metaDiaria)}/dia</strong>
        </p>
        {onEditMeta && (
          <button
            onClick={onEditMeta}
            className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            title="Editar meta diária"
          >
            <Pencil className="w-3 h-3" />
            <span>Editar meta</span>
          </button>
        )}
      </div>
    </div>
  )
}
