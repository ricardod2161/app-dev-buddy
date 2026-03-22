import { formatBRL } from '@/features/finance/lib/parse-finance'
import type { GastoEntry, ReservaEntry } from '@/features/finance/types/transaction.types'

/**
 * Generates a WhatsApp-style confirmation string for a reserva.
 */
export function generateReservaConfirmation(
  valor: number,
  data: string,
  totalGuardado: number
): string {
  return [
    `✅ Reserva registrada! ${formatBRL(valor)} adicionados à sua meta diária de hoje. Desculpa a confusão anterior, agora está salvo! (total: ${formatBRL(totalGuardado)}).`,
    '',
    'Gastos — Hoje:',
    `• Gasto com Reserva (${data}) — ${formatBRL(valor)} (${data})`,
    `Total: ${formatBRL(valor)}`,
    '',
    'Quer filtro só reservas? Gráfico? PDF? Só falar, mano!',
  ].join('\n')
}

/**
 * Generates a WhatsApp-style daily report string.
 */
export function generateDailyReport(gastos: GastoEntry[]): string {
  if (gastos.length === 0) {
    return '💰 Nenhum gasto registrado hoje.\n\nQuer filtro só reservas? Gráfico? PDF? Só falar, mano!'
  }

  const total = gastos.reduce((s, g) => s + g.valor, 0)
  const lines = [
    'Gastos — Hoje:',
    ...gastos.map(g => `• ${g.title} (${g.data}) — ${formatBRL(g.valor)} (${g.data})`),
    `Total: ${formatBRL(total)}`,
    '',
    'Quer filtro só reservas? Gráfico? PDF? Só falar, mano!',
  ]
  return lines.join('\n')
}

/**
 * Generates a WhatsApp-style monthly report string.
 */
export function generateMonthlyReport(gastos: GastoEntry[], totalGuardado: number, metaDiariaCumprida: boolean): string {
  if (gastos.length === 0) {
    return 'Gastos — Este mês:\n\n💰 Nenhum gasto registrado este mês.\n\nQuer filtro só reservas? Gráfico? PDF? Só falar, mano!'
  }

  const total = gastos.reduce((s, g) => s + g.valor, 0)
  const lines = [
    'Gastos — Este mês:',
    ...gastos.map(g => `• ${g.title} (${g.data}) — ${formatBRL(g.valor)} (${g.data})`),
    `Total guardado este mês: ${formatBRL(totalGuardado || total)}`,
    `Meta diária cumprida: ${metaDiariaCumprida ? '✅' : '⏳'}`,
    '',
    'Quer filtro só reservas? Gráfico? PDF? Só falar, mano!',
  ]
  return lines.join('\n')
}

/**
 * Generates a numbered list of reservas (filtro só reservas).
 */
export function generateReservasFilter(reservas: ReservaEntry[], totalGuardado: number): string {
  const header = 'Estou filtrando todas as suas notas de reserva para calcular o total guardado. Só um momento...'
  if (reservas.length === 0) {
    return `${header}\n\n💰 Nenhuma reserva encontrada.\n\nQuer filtro só reservas? Gráfico? PDF? Só falar, mano!`
  }

  const items = reservas.map((r, i) =>
    `${i + 1}. ${r.title} (${r.data}) (Financeiro)\n   • Reserva Diária (Meta Anual): ${formatBRL(r.valor)}...`
  )

  return [
    header,
    '',
    ...items,
    '',
    `Total guardado: ${formatBRL(totalGuardado)}`,
    '',
    'Quer filtro só reservas? Gráfico? PDF? Só falar, mano!',
  ].join('\n')
}
