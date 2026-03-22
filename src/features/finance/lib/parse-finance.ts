/**
 * Parses monetary values from free text.
 * Handles: "R$ 40", "R$40,00", "40 reais", "E os 40?", "40,50", "1.200,00"
 */
export function parseMonetaryValue(text: string): number | null {
  if (!text) return null

  // Remove R$ prefix and normalize
  const normalized = text
    .replace(/R\$\s*/gi, '')
    .replace(/reais/gi, '')
    .trim()

  // Handle "E os 40?" style — extract leading number
  const patterns = [
    // 1.200,50 or 1200,50
    /(\d{1,3}(?:\.\d{3})*,\d{2})/,
    // 1200.50 (US style)
    /(\d+\.\d{2})\b/,
    // 1.200 (thousands only)
    /(\d{1,3}(?:\.\d{3})+)\b/,
    // plain integer or decimal: 40 or 40,00
    /(\d+(?:,\d+)?)/,
  ]

  for (const re of patterns) {
    const match = normalized.match(re)
    if (match) {
      const raw = match[1]
        .replace(/\./g, '')   // remove thousand separators
        .replace(',', '.')    // decimal comma → dot
      const val = parseFloat(raw)
      if (!isNaN(val) && val > 0) return val
    }
  }

  return null
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
