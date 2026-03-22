import { supabase } from '@/integrations/supabase/client'
import type { FinanceMemory, GastoEntry, ReservaEntry, MesHistorico } from '../types/transaction.types'
import { parseMonetaryValue, parseReservaTotalFromContent, formatDateDDMM, currentMonthKey, formatBRL } from '../lib/parse-finance'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Deduplicate lines within a content string (preserves blank lines). */
function deduplicateContentLines(content: string): { cleaned: string; hadDups: boolean } {
  const lines = content.split('\n')
  const seen = new Set<string>()
  const result: string[] = []
  let hadDups = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      if (seen.has(trimmed)) { hadDups = true; continue }
      seen.add(trimmed)
    }
    result.push(line)
  }

  // Remove trailing blank lines
  while (result.length && !result[result.length - 1].trim()) result.pop()

  return { cleaned: result.join('\n'), hadDups }
}

export interface CleanupResult {
  notesFixed: number    // notes whose content had duplicate lines removed
  notesMerged: number   // same-day notes merged into one
  details: string[]     // human-readable log of changes
}

/**
 * Cleans up duplicate reserva notes for a workspace:
 * 1. Deduplicates repeated bullet lines within each reserva note
 * 2. Merges multiple reserva notes created on the same calendar day into one
 */
export async function cleanDuplicateReservas(workspaceId: string): Promise<CleanupResult> {
  // Fetch ALL historical reserva notes (no date filter)
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, created_at')
    .eq('workspace_id', workspaceId)
    .eq('category', 'Financeiro')
    .or('title.ilike.%reserva%,content.ilike.%reserva%')
    .order('created_at', { ascending: true })

  if (error) throw error
  const notes = data ?? []

  const result: CleanupResult = { notesFixed: 0, notesMerged: 0, details: [] }

  // ── Step 1: deduplicate content lines ────────────────────────────────────
  for (const note of notes) {
    if (!note.content) continue
    const { cleaned, hadDups } = deduplicateContentLines(note.content)
    if (hadDups) {
      const { error: upErr } = await supabase
        .from('notes')
        .update({ content: cleaned })
        .eq('id', note.id)
      if (upErr) throw upErr
      result.notesFixed++
      result.details.push(`Limpei linhas duplicadas em "${note.title ?? note.id}"`)
    }
  }

  // Reload notes after content cleanup (content changed)
  const { data: fresh, error: freshErr } = await supabase
    .from('notes')
    .select('id, title, content, created_at')
    .eq('workspace_id', workspaceId)
    .eq('category', 'Financeiro')
    .or('title.ilike.%reserva%,content.ilike.%reserva%')
    .order('created_at', { ascending: true })

  if (freshErr) throw freshErr

  // ── Step 2: merge same-day notes ─────────────────────────────────────────
  const byDay: Record<string, typeof fresh> = {}
  for (const note of fresh ?? []) {
    // Use UTC date so timezone doesn't split a day across two buckets
    const day = (note.created_at ?? '').substring(0, 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day]!.push(note)
  }

  for (const [day, dayNotes] of Object.entries(byDay)) {
    if (!dayNotes || dayNotes.length <= 1) continue

    const [primary, ...rest] = dayNotes

    // Merge all content into the primary note, then deduplicate lines
    const combinedContent = [primary!.content ?? '', ...rest.map(n => n.content ?? '')]
      .filter(Boolean)
      .join('\n\n')

    const { cleaned: mergedContent } = deduplicateContentLines(combinedContent)

    // Recalculate a clean title
    const mergedTitle = primary!.title ?? `Gasto com Reserva (${day.substring(8, 10)}/${day.substring(5, 7)})`

    // Update primary
    const { error: upErr } = await supabase
      .from('notes')
      .update({ title: mergedTitle, content: mergedContent })
      .eq('id', primary!.id)
    if (upErr) throw upErr

    // Delete the rest
    for (const dup of rest) {
      const { error: delErr } = await supabase
        .from('notes')
        .delete()
        .eq('id', dup.id)
      if (delErr) throw delErr
      result.notesMerged++
    }

    result.details.push(`Mescla de ${dayNotes.length} notas de reserva em ${day} → "${mergedTitle}"`)
  }

  return result
}

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

/**
 * Returns monthly reserva totals for the last N months.
 * ONLY counts notes where title or content contains "reserva" (case-insensitive).
 * Uses smart dedup-sum parser to handle AI duplication bugs and multi-value notes.
 */
export async function getHistoricoMensal(workspaceId: string, months = 12): Promise<MesHistorico[]> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  const { data, error } = await supabase
    .from('notes')
    .select('content, title, created_at')
    .eq('workspace_id', workspaceId)
    .eq('category', 'Financeiro')
    // Only reserva notes — filter at DB level for efficiency
    .or('title.ilike.%reserva%,content.ilike.%reserva%')
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: true })

  if (error) throw error

  // Group by YYYY-MM, summing all unique monetary values per note
  const byMonth: Record<string, number> = {}
  for (const note of data ?? []) {
    const d = new Date(note.created_at!)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    // Use smart parser: sums all unique lines, skips duplicates
    const fullText = [note.title ?? '', note.content ?? ''].join('\n')
    const valor = parseReservaTotalFromContent(fullText)
    byMonth[key] = (byMonth[key] ?? 0) + valor
  }

  const META_MENSAL = 40 * 30

  const meses_pt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const result: MesHistorico[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const total = byMonth[mes] ?? 0
    const mesLabel = `${meses_pt[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
    result.push({ mes, mesLabel, total, meta: META_MENSAL, cumprida: total >= META_MENSAL })
  }
  return result
}
