const MONETARY_PATTERNS_GLOBAL = [
  /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,
  /R\$\s*(\d+\.\d{2})\b/g,
  /R\$\s*(\d+(?:,\d+)?)/g,
]

function parseSingleValue(raw: string): number | null {
  const normalized = raw
    .replace(/\./g, '')   // remove thousand separators
    .replace(',', '.')    // decimal comma → dot
  const val = parseFloat(normalized)
  return !isNaN(val) && val > 0 ? val : null
}

/**
 * Extracts the FIRST declared monetary value from a line of text.
 * Stops before any parenthetical clause containing "totalizar" or "total".
 * e.g. "Ajuste: R$ 120,00 (Para totalizar R$ 240,00)" → 120
 */
function parseFirstValueFromLine(line: string): number | null {
  // Trim anything in parentheses that contains "totalizar"/"total" — it's explanatory
  const stripped = line.replace(/\([^)]*(?:totalizar|total\b)[^)]*\)/gi, '').trim()
  if (!stripped) return null

  for (const re of MONETARY_PATTERNS_GLOBAL) {
    const pattern = new RegExp(re.source, re.flags)
    const match = pattern.exec(stripped)
    if (match) return parseSingleValue(match[1])
  }
  return null
}

/**
 * Parses monetary values from free text — returns only the FIRST value found.
 * Handles: "R$ 40", "R$40,00", "40 reais", "E os 40?", "1.200,00"
 */
export function parseMonetaryValue(text: string): number | null {
  if (!text) return null

  for (const re of MONETARY_PATTERNS_GLOBAL) {
    const pattern = new RegExp(re.source, re.flags)
    const match = pattern.exec(text)
    if (match) return parseSingleValue(match[1])
  }

  // Fallback: plain number
  const normalized = text.replace(/R\$\s*/gi, '').replace(/reais/gi, '').trim()
  const fallback = [
    /(\d{1,3}(?:\.\d{3})*,\d{2})/,
    /(\d+\.\d{2})\b/,
    /(\d{1,3}(?:\.\d{3})+)\b/,
    /(\d+(?:,\d+)?)/,
  ]
  for (const re of fallback) {
    const match = normalized.match(re)
    if (match) return parseSingleValue(match[1])
  }

  return null
}

/**
 * Lines que indicam ajuste contábil ou consolidação — NÃO representam um novo depósito.
 * Ex: "• Ajuste de Reserva (22/03): R$ 120,00", "• Reserva Adicional: R$ 40,00"
 */
const ADJUSTMENT_KEYWORDS = /\b(ajuste|adicional|totalizar|totalizado|conforme|para\s+totalizar|correção|acumulado|guardado\s+este\s+m[eê]s)\b/i

/**
 * Lines de resumo/total que repetem valores já contados.
 */
const SUMMARY_KEYWORDS = /\b(total|totalizando|meta|progresso)\b/i

/**
 * Retorna verdadeiro se a linha representa a reserva PRINCIPAL do dia
 * (ex: "• Reserva Diária: R$ 40,00", "• Reserva: R$ 40,00")
 */
const PRIMARY_RESERVA_PATTERN = /^\s*[•\-*]\s*reserva\s*(di[áa]ria|[:])?\s*(r\$|\(|$)/i

/**
 * Normaliza o conteúdo de uma nota de reserva, mantendo APENAS a linha principal
 * de reserva e removendo linhas de ajuste, adicional e totalização.
 *
 * Regra: uma nota de reserva diária representa UM único valor (a meta diária: R$ 40).
 * Linhas de "Ajuste", "Adicional", "Para totalizar" são comentários contábeis, não depósitos.
 */
export function normalizeReservaContent(content: string): string {
  if (!content) return content

  const lines = content.split('\n')
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip adjustment/consolidation lines
    if (ADJUSTMENT_KEYWORDS.test(trimmed)) continue
    // Skip summary/total lines
    if (SUMMARY_KEYWORDS.test(trimmed)) continue

    // Deduplicate identical lines
    if (seen.has(trimmed)) continue
    seen.add(trimmed)

    normalized.push(line)
  }

  // Remove trailing blank lines
  while (normalized.length && !normalized[normalized.length - 1].trim()) normalized.pop()

  return normalized.join('\n') || content // fallback to original if all lines were filtered
}

/**
 * Parses and sums monetary values from a reserva note.
 *
 * KEY RULE: A daily reserva note represents ONE deposit (meta diária = R$ 40).
 * Lines with "Ajuste", "Adicional", "Para totalizar", "conforme" are accounting
 * comments about the SAME deposit — they must NOT be summed again.
 *
 * Algorithm:
 * 1. Split into lines, skip adjustment/summary lines
 * 2. Deduplicate identical trimmed lines
 * 3. Extract first R$ value per remaining line
 * 4. If we find a "primary" reserva line → return its value only (one deposit)
 * 5. Fallback: sum all remaining unique values
 */
export function parseReservaTotalFromContent(content: string): number {
  if (!content) return 0

  const lines = content.split('\n')
  const seen = new Set<string>()
  const validLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip adjustment/consolidation lines — they re-state already-counted values
    if (ADJUSTMENT_KEYWORDS.test(trimmed)) continue
    // Skip summary/total lines — they double-count
    if (SUMMARY_KEYWORDS.test(trimmed)) continue

    // Deduplicate identical lines (AI bug: same bullet repeated 10×)
    if (seen.has(trimmed)) continue
    seen.add(trimmed)

    validLines.push(trimmed)
  }

  // If we have a clear primary reserva line, return ONLY that value.
  // This prevents "Reserva Diária: R$40" + "Reserva: R$40" = R$80 (same day, same deposit).
  for (const line of validLines) {
    if (PRIMARY_RESERVA_PATTERN.test(line)) {
      const val = parseFirstValueFromLine(line)
      if (val !== null) return val
    }
  }

  // Fallback: sum all valid lines (should be just 1-2 for a clean note)
  let total = 0
  for (const line of validLines) {
    const val = parseFirstValueFromLine(line)
    if (val !== null) total += val
  }

  return total
}

/**
 * Formats a number as BRL currency string.
 * e.g. 1200.5 → "R$ 1.200,50"
 */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Formats an ISO date string as DD/MM.
 */
export function formatDateDDMM(isoOrDate: string): string {
  const d = new Date(isoOrDate)
  if (isNaN(d.getTime())) return isoOrDate
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

/**
 * Returns current month in YYYY-MM format.
 */
export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Returns a human-readable month label, e.g. "Março 2026"
 */
export function monthLabel(monthKey?: string | null): string {
  const key = monthKey ?? currentMonthKey()
  const [year, month] = key.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}
