const MONETARY_PATTERNS = [
  // R$ 1.200,50 or R$1200,50
  /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi,
  // R$ 1200.50 (US style)
  /R\$\s*(\d+\.\d{2})\b/gi,
  // R$ 40 (plain integer)
  /R\$\s*(\d+(?:,\d+)?)/gi,
]

function parseSingleValue(raw: string): number | null {
  const normalized = raw
    .replace(/\./g, '')   // remove thousand separators
    .replace(',', '.')    // decimal comma → dot
  const val = parseFloat(normalized)
  return !isNaN(val) && val > 0 ? val : null
}

/**
 * Parses the FIRST monetary value from free text.
 * Handles: "R$ 40", "R$40,00", "40 reais", "E os 40?", "1.200,00"
 */
export function parseMonetaryValue(text: string): number | null {
  if (!text) return null

  // Try R$ prefixed patterns first
  for (const re of MONETARY_PATTERNS) {
    re.lastIndex = 0
    const match = re.exec(text)
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
 * Parses ALL monetary values from a multi-line reserva note,
 * deduplicating identical consecutive bullet lines (AI duplication bug).
 *
 * Strategy:
 * 1. Split content into lines
 * 2. Deduplicate: skip a line if it's identical (trimmed) to the previous
 * 3. Extract R$ value from each unique line
 * 4. Sum them all — this handles "Reserva: R$40 + Ajuste: R$120 = R$160"
 */
export function parseReservaTotalFromContent(content: string): number {
  if (!content) return 0

  const lines = content.split('\n')
  const seen = new Set<string>()
  let total = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Deduplicate identical lines (AI bug: "Reserva Adicional: R$ 40" × 10)
    if (seen.has(trimmed)) continue
    seen.add(trimmed)

    // Skip lines with "totalizar" — these are explanatory, not additive
    if (/totalizar/i.test(trimmed)) continue

    const val = parseMonetaryValue(trimmed)
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
