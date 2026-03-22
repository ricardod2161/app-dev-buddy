import { supabase } from '@/integrations/supabase/client'
import type { FinanceMemory, GastoEntry, ReservaEntry } from '../types/transaction.types'
import { parseMonetaryValue, formatDateDDMM, currentMonthKey } from '../lib/parse-finance'
import type { MesHistorico } from '../hooks/useHistoricoMensal'

function noteToGasto(note: { id: string; title: string | null; content: string | null; category: string | null; created_at: string }): GastoEntry {
  const valor = parseMonetaryValue(note.content ?? note.title ?? '') ?? 0
  const isReserva = /reserva/i.test(note.title ?? '') || /reserva/i.test(note.content ?? '')
  return {
    id: note.id,
    title: note.title ?? 'Sem título',
    valor,
    data: formatDateDDMM(note.created_at),
    data_iso: note.created_at,
    tipo: isReserva ? 'reserva' : 'gasto',
    category: note.category ?? 'Financeiro',
  }
}

/**
 * Fetches financial notes for the current month.
 */
export async function getGastosMes(workspaceId: string): Promise<GastoEntry[]> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, category, created_at')
    .eq('workspace_id', workspaceId)
    .eq('category', 'Financeiro')
    .gte('created_at', startOfMonth)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(noteToGasto)
}

/**
 * Fetches only reserva-tagged financial notes.
 */
export async function getReservasMes(workspaceId: string): Promise<ReservaEntry[]> {
  const gastos = await getGastosMes(workspaceId)
  return gastos
    .filter(g => g.tipo === 'reserva')
    .map(g => ({
      id: g.id,
      title: g.title,
      valor: g.valor,
      data: g.data,
      data_iso: g.data_iso,
      tipo: 'reserva' as const,
    }))
}

/**
 * Fetches today's financial notes.
 */
export async function getGastosHoje(workspaceId: string): Promise<GastoEntry[]> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, category, created_at')
    .eq('workspace_id', workspaceId)
    .eq('category', 'Financeiro')
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(noteToGasto)
}

/**
 * Reads financial memory from user_memory table.
 */
export async function getFinanceMemory(workspaceId: string): Promise<FinanceMemory | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_memory')
    .select('meta_diaria, total_guardado_mes, ultima_reserva_data, ultima_reserva_valor, mes_referencia')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw error
  return data as FinanceMemory | null
}

/**
 * Upserts financial memory.
 */
export async function upsertFinanceMemory(
  workspaceId: string,
  patch: Partial<FinanceMemory>
): Promise<void> {
  const mesAtual = currentMonthKey()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('user_memory')
    .upsert(
      { workspace_id: workspaceId, mes_referencia: mesAtual, ...patch },
      { onConflict: 'workspace_id' }
    )
  if (error) throw error
}
