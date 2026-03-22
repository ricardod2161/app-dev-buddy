import { useQuery } from '@tanstack/react-query'
import { getGastosMes, getGastosHoje } from '../services/finance.service'
import type { GastoEntry } from '../types/transaction.types'

export function useGastosMensais(workspaceId: string | null) {
  return useQuery<GastoEntry[]>({
    queryKey: ['finance-gastos-mes', workspaceId],
    queryFn: () => getGastosMes(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}

export function useGastosHoje(workspaceId: string | null) {
  return useQuery<GastoEntry[]>({
    queryKey: ['finance-gastos-hoje', workspaceId],
    queryFn: () => getGastosHoje(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}
