import { useMemo } from 'react'
import type { GastoEntry, ReservaEntry } from '../types/transaction.types'

/**
 * Separates a list of GastoEntry into reservas and outros gastos.
 */
export function useReservaParser(gastos: GastoEntry[]) {
  return useMemo(() => {
    const reservas: ReservaEntry[] = []
    const outros: GastoEntry[] = []

    for (const g of gastos) {
      if (g.tipo === 'reserva') {
        reservas.push({ ...g, tipo: 'reserva' as const })
      } else {
        outros.push(g)
      }
    }

    const totalReservas = reservas.reduce((s, r) => s + r.valor, 0)
    const totalGastos = outros.reduce((s, g) => s + g.valor, 0)

    return { reservas, outros, totalReservas, totalGastos }
  }, [gastos])
}
