import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { parseMonetaryValue, formatDateDDMM, currentMonthKey } from '@/features/finance/lib/parse-finance'
import { getFinanceMemory, upsertFinanceMemory } from '@/features/finance/services/finance.service'

export interface FinanceActionResult {
  success: boolean
  noteId?: string
  newTotal?: number
  error?: string
}

/**
 * Creates a "Financeiro" note AND updates user_memory in a single atomic flow.
 * Returns the new total_guardado_mes.
 */
export async function executeFinanceReserva(
  workspaceId: string,
  title: string,
  content: string,
  valor?: number
): Promise<FinanceActionResult> {
  try {
    // 1. Create the note
    const { data: note, error: noteErr } = await supabase
      .from('notes')
      .insert({
        workspace_id: workspaceId,
        title,
        content,
        category: 'Financeiro',
      })
      .select('id')
      .single()

    if (noteErr) throw noteErr

    // 2. Parse the amount if not provided
    const amount = valor ?? parseMonetaryValue(content ?? title) ?? 0

    if (amount > 0) {
      // 3. Read current memory
      const memory = await getFinanceMemory(workspaceId)
      const currentTotal = memory?.total_guardado_mes ?? 0
      const newTotal = currentTotal + amount
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

      // 4. Upsert memory
      await upsertFinanceMemory(workspaceId, {
        total_guardado_mes: newTotal,
        ultima_reserva_data: today,
        ultima_reserva_valor: amount,
        mes_referencia: currentMonthKey(),
      })

      toast.success(`✅ Reserva de ${formatDateDDMM(today)} registrada! Total: R$ ${newTotal.toFixed(2).replace('.', ',')}`)
      return { success: true, noteId: note.id, newTotal }
    }

    toast.success('📝 Nota financeira criada')
    return { success: true, noteId: note.id }
  } catch (e) {
    const msg = (e as Error).message ?? 'Erro ao registrar reserva'
    toast.error(msg)
    return { success: false, error: msg }
  }
}

/**
 * Creates a generic "Financeiro" gasto note (no memory update).
 */
export async function executeFinanceGasto(
  workspaceId: string,
  title: string,
  content: string
): Promise<FinanceActionResult> {
  try {
    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        workspace_id: workspaceId,
        title,
        content,
        category: 'Financeiro',
      })
      .select('id')
      .single()

    if (error) throw error
    toast.success(`💸 Gasto registrado: ${title}`)
    return { success: true, noteId: note.id }
  } catch (e) {
    const msg = (e as Error).message ?? 'Erro ao registrar gasto'
    toast.error(msg)
    return { success: false, error: msg }
  }
}
