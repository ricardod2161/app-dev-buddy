import { useQuery } from '@tanstack/react-query'
import { getReservasMes } from '../services/finance.service'
import type { ReservaEntry } from '../types/transaction.types'

/**
 * Busca notas de reserva do mês e retorna valores corretos via parser inteligente.
 * Cada nota = R$ 40 (meta diária). Linhas de "Ajuste" e "Adicional" são ignoradas.
 */
export function useReservasMensais(workspaceId: string | null) {
  const { data = [], isLoading } = useQuery<ReservaEntry[]>({
    queryKey: ['finance-reservas-mes', workspaceId],
    queryFn: () => getReservasMes(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })

  const totalReservas = data.reduce((s, r) => s + r.valor, 0)

  return { reservas: data, totalReservas, isLoading }
}
