
## What the user wants

1. **New page `/app/finance/history`** — bar chart showing monthly totals over time vs. annual goal (R$ 40 × 365 = R$ 14,600)
2. **Reorganize FinanceDashboard** — currently "mau organizado" (poorly organized): cards feel disconnected, report and list sections overlap in purpose, no navigation to history

## Data strategy for history

There is no `user_memory_history` table yet. We'll derive monthly history from the existing `notes` table: group `notes` by month where `category = 'Financeiro'`, summing values per month. This gives real data without a migration.

New service function: `getHistoricoMensal(workspaceId, months=12)` — queries notes grouped by `YYYY-MM` for the past N months.

New hook: `useHistoricoMensal(workspaceId)` — wraps the service with React Query.

## Files

### New files
```
NEW  src/features/finance/pages/FinanceHistory.tsx
       — Page at /app/finance/history
       — Bar chart (recharts BarChart — already in project)
       — Annual goal progress: total acumulado vs R$14.600
       — Month-by-month table below chart

NEW  src/features/finance/hooks/useHistoricoMensal.ts
       — React Query hook fetching last 12 months from notes
```

### Modified files
```
MOD  src/features/finance/services/finance.service.ts
       — Add getHistoricoMensal() — queries notes grouped by month

MOD  src/features/finance/pages/FinanceDashboard.tsx
       — Reorganize layout:
         Row 1: 3 metric cards (total guardado | só reservas | hoje) — cleaner
         Row 2: MetaDiariaProgress card (full width)
         Row 3: Quick actions row — "Ver Histórico" link button
         Row 4: Tabs (Hoje / Este mês / Reservas) — WhatsAppStyleReport
         Row 5: Detailed list (collapsed/accordion on mobile)

MOD  src/app/router/route-config.tsx
       — Add route /app/finance/history → FinanceHistory

MOD  src/components/AppSidebar.tsx
       — Add "Histórico" sub-item under "Minhas Finanças" (or keep flat with History link inside Dashboard)
       — Simpler: add History as separate sidebar item in the finance group
```

## FinanceDashboard reorganization specifics

Current problems:
- "Relatório WhatsApp" card + "Lançamentos do mês" card both show the same data in slightly different styles — redundant
- No link/navigation to history
- Cards feel cramped on the current 715px viewport

New layout:
```
┌─────────────────────────────────────────┐
│ Header: Minhas Finanças          [↻][📊] │ ← add History button
├──────────┬──────────┬────────────────────┤
│ Guardado │ Reservas │  Hoje              │
├──────────┴──────────┴────────────────────┤
│ Progresso da meta ████████░░ 67%         │
├─────────────────────────────────────────┤
│ [Hoje] [Este mês] [Só Reservas]          │
│ • Gasto com Reserva (22/03) — R$ 40,00  │
│ Total: R$ 40,00                          │
│ [Ver lista completa ↓]                   │  ← collapsible
└─────────────────────────────────────────┘
```

Remove the separate "Lançamentos do mês" card (it was duplicating the "Este mês" tab). The tabs now handle all three modes with a "Ver mais" toggle to show full list.

## FinanceHistory page

```
┌─────────────────────────────────────────┐
│ ← Minhas Finanças  | Histórico Anual    │
├─────────────────────────────────────────┤
│ META ANUAL: R$ 14.600  ████░░░░░ 23%    │
│ Total acumulado: R$ 3.360               │
├─────────────────────────────────────────┤
│ [Bar Chart — 12 months]                 │
│  Jan  Fev  Mar  Abr ... Dez             │
│  ██   ██   ██                           │
│  linha pontilhada = meta mensal         │
├─────────────────────────────────────────┤
│ Tabela: Mês | Guardado | Meta | Status  │
│ Mar/26 | R$40 | R$1.240 | ⏳            │
│ Fev/26 | R$0  | R$1.120 | 🔴            │
└─────────────────────────────────────────┘
```

Uses `recharts` `BarChart` + `ReferenceLine` for the monthly target line. Already bundled in the project (used in Dashboard charts).

## Total files
```
NEW  src/features/finance/pages/FinanceHistory.tsx
NEW  src/features/finance/hooks/useHistoricoMensal.ts
MOD  src/features/finance/services/finance.service.ts  (+getHistoricoMensal)
MOD  src/features/finance/pages/FinanceDashboard.tsx   (layout reorganization)
MOD  src/app/router/route-config.tsx                   (+/app/finance/history)
MOD  src/components/AppSidebar.tsx                     (+Histórico link)
```

No migrations. No new packages. Uses recharts already in project.
