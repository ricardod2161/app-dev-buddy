
## Deep Audit — Issues Found

### Bug 1 (Console Error — Active): `FinanceHistory.tsx` — `CustomTooltip` not `forwardRef`-wrapped
Recharts `Tooltip`'s `content` prop expects a component that accepts a ref. `CustomTooltip` is a plain function declared inside the module scope but not wrapped with `React.forwardRef`. This causes the React warning seen in the console logs.

**Fix**: Convert `CustomTooltip` to use `React.forwardRef` or move it outside the component and add a `forwardRef` wrapper.

### Bug 2: `WhatsAppStyleReport` — Date displayed twice per row
In `WhatsAppStyleReport.tsx` lines 29 and 50, each list item renders the date twice:
```
• Gasto com Reserva (22/03) — R$ 40,00 (22/03)
```
The format should be: `• {title} — R$ {valor} ({data})`

### Bug 3: `getHistoricoMensal` — Meta mensal hardcoded as `40 × 30 = R$ 1.200`
`META_MENSAL` uses 30 days fixed instead of the actual days in that month. March has 31, February 28/29. Also `FinanceHistory.tsx` hardcodes `META_MENSAL = 40 * 30` too. These should use actual days per month.

### Bug 4: `useTotalGuardado` — returns `{ data: null, isLoading }` when memory is null but `isLoading` is from the inner query
When `memory` is `null` (no `user_memory` row yet), the hook returns `{ data: null, isLoading }` but `isLoading` is stale from the completed query. The dashboard shows skeleton forever. Fix: return `{ data: { memory: null, progresso_pct: 0, meta_mensal: 1200, dias_no_mes: 30 }, isLoading }` when no memory row exists.

### Bug 5: `AppSidebar.tsx` — `isActive` incorrectly marks `/app/finance` active when on `/app/finance/history`
The `isActive` function uses `location.pathname.startsWith(path)` so both `/app/finance` AND `/app/finance/history` will be active simultaneously (both show as highlighted). The sidebar should only highlight the exact match for finance sub-routes.

### Bug 6: `FinanceDashboard.tsx` — Two `RefreshCw` icons in header
The header renders `RefreshCw` for both the "limpar duplicadas" loading state AND as a separate refresh button. When cleaning, two spinners appear. The refresh button should use a different icon (`RotateCcw`).

### Bug 7: `parse-finance.ts` — `parseReservaTotalFromContent` sums ALL values per note
A note like "Gasto com Reserva (22/03) — R$ 40,00 — Total guardado: R$ 40,00" would count R$ 80 instead of R$ 40. The title line and total confirmation line both have `R$ 40,00`. Fix: skip lines that contain keywords "total", "meta", "progresso", "acumulado" to avoid double-counting confirmation lines.

### Improvement 1: `FinanceHistory.tsx` — Chart bar labels wrong description
The legend says "✅ Meta cumprida · 🟣 Em andamento" but the bars use CSS variables with no purple color class — the "em andamento" bars render as primary/50 (usually a blue/indigo tint). Fix the legend to match actual colors shown.

### Improvement 2: `FinanceDashboard.tsx` — `totalGuardado` uses `user_memory` not recalculated from notes
The "Total guardado" card shows `user_memory.total_guardado_mes` which may be stale/wrong if the edge function didn't update it correctly. Better to show the calculated sum from notes (via `useGastosMensais` + filter reservas) with `user_memory` as fallback.

### Improvement 3: Sidebar — Finance items need a "Finance" sub-group
Currently "Minhas Finanças" and "Histórico Financeiro" sit inside "Principal" alongside Dashboard, Notes, Tasks, etc. They should be in a dedicated "Finanças" group for better organization.

### Improvement 4: `WhatsAppStyleReport` — numbered list in reservas mode uses wrong format
Renders `{i + 1}. Gasto com Reserva` but should match Paulo's format: `1. Gasto com Reserva (22/03) (Financeiro)` with bullet indented beneath.

---

## Files to change (7 files, no migrations)

```
FIX  src/features/finance/pages/FinanceHistory.tsx
       — Wrap CustomTooltip with React.forwardRef (console error fix)
       — Fix META_MENSAL to use actual days per each month entry
       — Fix legend colors to match real bar colors

FIX  src/features/finance/components/WhatsAppStyleReport.tsx
       — Remove duplicate date from each row (Bug 2)
       — Fix reservas mode numbered list format

FIX  src/features/finance/lib/parse-finance.ts
       — parseReservaTotalFromContent: skip "total"/"meta"/"acumulado" lines

FIX  src/features/finance/hooks/useTotalGuardado.ts
       — Return valid data object (not null) when memory row doesn't exist yet
       — Prevents infinite skeleton

FIX  src/components/AppSidebar.tsx
       — Fix isActive for finance sub-routes (exact match for /app/finance vs /app/finance/history)
       — Reorganize: add "Finanças" group with Minhas Finanças + Histórico Financeiro

FIX  src/features/finance/pages/FinanceDashboard.tsx
       — Replace duplicate RefreshCw icon with RotateCcw for the refresh button
       — "Total guardado" card: derive from reservas sum (real-time) not stale memory

FIX  src/features/finance/services/finance.service.ts
       — getHistoricoMensal: compute META_MENSAL per-month using actual days in each month
```
