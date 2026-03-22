import React from 'react'
import { Progress } from '@/components/ui/progress'
import { formatBRL } from '../lib/parse-finance'

interface MetaDiariaProgressProps {
  totalGuardado: number
  metaMensal: number
  metaDiaria: number
  progresso: number   // 0–100
  mesLabel: string
}

export const MetaDiariaProgress: React.FC<MetaDiariaProgressProps> = ({
  totalGuardado, metaMensal, metaDiaria, progresso, mesLabel,
}) => {
  const cor = progresso >= 100 ? 'text-green-600 dark:text-green-400'
    : progresso >= 50 ? 'text-primary'
    : 'text-orange-500 dark:text-orange-400'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">{mesLabel}</span>
        <span className={`font-bold ${cor}`}>{progresso.toFixed(0)}%</span>
      </div>

      <Progress value={progresso} className="h-2.5" />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">{formatBRL(totalGuardado)}</strong> guardados
        </span>
        <span>Meta: {formatBRL(metaMensal)}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Meta diária: <strong className="text-foreground">{formatBRL(metaDiaria)}/dia</strong>
      </p>
    </div>
  )
}
