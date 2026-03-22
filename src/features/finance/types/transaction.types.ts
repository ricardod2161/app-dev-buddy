export type TransactionType = 'reserva' | 'gasto' | 'receita' | 'outro'

export interface Transaction {
  id: string
  workspace_id: string
  title: string | null
  content: string | null
  category: string | null
  created_at: string
  updated_at: string
}

export interface ReservaEntry {
  id: string
  title: string
  valor: number
  data: string        // "DD/MM"
  data_iso: string    // ISO date string
  tipo: 'reserva'
}

export interface GastoEntry {
  id: string
  title: string
  valor: number
  data: string        // "DD/MM"
  data_iso: string    // ISO date string
  tipo: TransactionType
  category: string
}

export interface FinanceMemory {
  meta_diaria: number
  total_guardado_mes: number
  ultima_reserva_data: string | null
  ultima_reserva_valor: number | null
  mes_referencia: string | null
}

export interface FinanceMonthSummary {
  gastos: GastoEntry[]
  reservas: ReservaEntry[]
  total_guardado: number
  total_gastos: number
  meta_diaria: number
  meta_mensal: number  // meta_diaria × dias do mês
  progresso_pct: number
  mes_label: string    // "Março 2026"
}

export interface MesHistorico {
  mes: string        // 'YYYY-MM'
  mesLabel: string   // 'Mar/26'
  total: number
  meta: number
  cumprida: boolean
}
