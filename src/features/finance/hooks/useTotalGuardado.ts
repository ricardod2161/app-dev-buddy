import { useQuery } from '@tanstack/react-query'
import { getFinanceMemory } from '../services/finance.service'
import type { FinanceMemory } from '../types/transaction.types'

export interface TotalGuardadoResult {
  memory: FinanceMemory | null
  progresso_pct: number   // 0–100
  meta_mensal: number     // meta_diaria × days in month
  dias_no_mes: number
}

export function useTotalGuardado(workspaceId: string | null): { data: TotalGuardadoResult | null; isLoading: boolean } {
  const { data: memory, isLoading } = useQuery<FinanceMemory | null>({
    queryKey: ['finance-memory', workspaceId],
    queryFn: () => getFinanceMemory(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })

  if (!memory) return { data: null, isLoading }

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const meta_mensal = memory.meta_diaria * daysInMonth
  const progresso_pct = meta_mensal > 0
    ? Math.min(100, (memory.total_guardado_mes / meta_mensal) * 100)
    : 0

  return {
    data: {
      memory,
      progresso_pct,
      meta_mensal,
      dias_no_mes: daysInMonth,
    },
    isLoading,
  }
}
