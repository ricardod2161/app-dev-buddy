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
 * Parses and sums ALL monetary values from a multi-line reserva note,
 * deduplicating identical consecutive bullet lines (handles AI duplication bugs).
 *
 * Rules:
 * 1. Split into lines, deduplicate identical trimmed lines
 * 2. Per line: extract first R$ value, ignoring parenthetical "totalizar" clauses
 * 3. Sum all extracted values
 *
 * Example:
 *   "• Reserva Diária: R$ 40,00"                              → +40
 *   "• Ajuste: R$ 120,00 (Para totalizar R$ 240,00 conforme)" → +120  (skip parenthetical)
 *   "• Reserva: R$ 40,00" × 10 duplicates                    → +40 once (dedup)
 *   "• Reserva Adicional: R$ 40,00" × 9 duplicates           → +40 once (dedup)
 */
export function parseReservaTotalFromContent(content: string): number {
  if (!content) return 0

  // Skip lines that are summary/total/meta lines — they double-count the actual values
  const SUMMARY_KEYWORDS = /\b(total|totalizando|totalizar|meta|progresso|acumulado|guardado\s+este\s+mês)\b/i

  const lines = content.split('\n')
  const seen = new Set<string>()
  let total = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip summary/confirmation lines that repeat an already-counted value
    if (SUMMARY_KEYWORDS.test(trimmed)) continue

    // Deduplicate identical lines (AI bug: same bullet repeated 10×)
    if (seen.has(trimmed)) continue
    seen.add(trimmed)

    const val = parseFirstValueFromLine(trimmed)
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
