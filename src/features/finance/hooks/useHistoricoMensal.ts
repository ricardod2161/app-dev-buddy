import { useQuery } from '@tanstack/react-query'
import { getHistoricoMensal } from '../services/finance.service'
import type { MesHistorico } from '../types/transaction.types'

export type { MesHistorico }

export function useHistoricoMensal(workspaceId: string | null, metaDiaria = 40) {
  return useQuery({
    queryKey: ['finance-historico-mensal', workspaceId, metaDiaria],
    queryFn: () => getHistoricoMensal(workspaceId!, 12, metaDiaria),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  })
}
