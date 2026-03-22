/**
 * Identifies whether a free-text message refers to a "reserva" (saving)
 * vs a generic "gasto" (expense).
 */

const RESERVA_KEYWORDS = [
  /reserva/i,
  /guardei/i,
  /guardando/i,
  /poupar/i,
  /poupei/i,
  /poupança/i,
  /e os 40/i,
  /minha meta/i,
  /meta di[aá]ria/i,
  /meta de poupan/i,
]

const GASTO_KEYWORDS = [
  /gastei/i,
  /paguei/i,
  /comprei/i,
  /d[ée]vida/i,
  /frete/i,
  /fralda/i,
  /agência/i,
  /moto/i,
  /combustível/i,
]

export type FinanceIntentType = 'reserva' | 'gasto' | 'relatorio_diario' | 'relatorio_mes' | 'filtro_reservas' | 'desconhecido'

export interface ParseReservaResult {
  intent: FinanceIntentType
  isFinancial: boolean
  isReserva: boolean
}

export function parseReserva(text: string): ParseReservaResult {
  const lower = text.toLowerCase()

  // Report intents
  if (/relat[oó]rio completo|relat[oó]rio do m[eê]s|este m[eê]s/i.test(text)) {
    return { intent: 'relatorio_mes', isFinancial: true, isReserva: false }
  }
  if (/relat[oó]rio di[aá]rio|relat[oó]rio de hoje/i.test(text)) {
    return { intent: 'relatorio_diario', isFinancial: true, isReserva: false }
  }
  if (/quero o que est[oá] guardando|filtrar reservas|s[oó] reservas/i.test(text)) {
    return { intent: 'filtro_reservas', isFinancial: true, isReserva: false }
  }

  // Reserva intent
  const isReserva = RESERVA_KEYWORDS.some(re => re.test(lower))
  if (isReserva) return { intent: 'reserva', isFinancial: true, isReserva: true }

  // Gasto intent
  const isGasto = GASTO_KEYWORDS.some(re => re.test(lower)) || /R\$|\d+\s*reais/i.test(text)
  if (isGasto) return { intent: 'gasto', isFinancial: true, isReserva: false }

  return { intent: 'desconhecido', isFinancial: false, isReserva: false }
}
