import { useQuery } from '@tanstack/react-query'
import { getHistoricoMensal } from '../services/finance.service'

export interface MesHistorico {
  mes: string        // 'YYYY-MM'
  mesLabel: string   // 'Mar/26'
  total: number
  meta: number
  cumprida: boolean
}

export function useHistoricoMensal(workspaceId: string | null) {
  return useQuery({
    queryKey: ['finance-historico-mensal', workspaceId],
    queryFn: () => getHistoricoMensal(workspaceId!, 12),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  })
}
