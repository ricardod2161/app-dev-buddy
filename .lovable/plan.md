

## Diagnóstico completo

### Onde o 40 está hardcoded (precisa ser dinâmico):

1. `FinanceHistory.tsx` linha 21: `const META_ANUAL = 40 * 365` — fixo, não lê do banco
2. `FinanceHistory.tsx` linha 31: `function metaMensalForKey` — usa `40 * daysInMonth` fixo
3. `FinanceHistory.tsx` linha 46: tooltip usa `40 * 30` fixo
4. `finance.service.ts` linha 204 e 1088: `meta_diaria: 40.00` hardcoded no upsert
5. `finance.service.ts` linha 377: `const META_MENSAL = 40 * daysInThisMonth` no histórico
6. `FinanceDashboard.tsx` linha 34: `?? 40` é só fallback (ok), mas a meta mensal usa `metaDiaria * 30` se não tiver memory

### O que o usuário quer

Poder editar a meta diária e anual diretamente nas páginas de finanças — não só em Configurações. Qualquer mudança deve se propagar imediatamente para todos os cálculos (progresso, gráfico, tabela).

### Solução

**Inline edit** nas duas páginas com um pequeno popover/dialog de edição:

**`FinanceDashboard`** — clicar no valor "Meta: R$ 1.240,00" ou "Meta diária: R$ 40/dia" no componente MetaDiariaProgress abre um input inline para editar. Salva via `upsertFinanceMemory` e invalida queries.

**`FinanceHistory`** — o badge "R$ 40/dia × 365 = R$ 14.600" vira clicável (ícone de lápis ao lado), abre um Dialog com:
- Input "Meta diária (R$)": ex. 40
- Meta anual calculada automaticamente: R$ X × 365 = R$ Y (read-only, atualiza live)
- Botão Salvar → upsert em `user_memory` + invalida queries

**`MetaDiariaProgress`** — adicionar prop `onEditMeta` opcional, mostrando ícone de lápis clicável ao lado da linha "Meta diária: R$ 40/dia".

**`getHistoricoMensal` e `FinanceHistory`** — passar `metaDiaria` como parâmetro para calcular metas dinamicamente em vez de usar o hardcoded 40.

**`recalcularTotalGuardado`** — ler `meta_diaria` atual do banco antes do upsert (não hardcodar 40).

### Fluxo de dados após mudança

```
user edits meta → upsert user_memory.meta_diaria
  → invalidate ['finance-memory', workspaceId]
  → useTotalGuardado re-fetches → nova metaDiaria
  → FinanceDashboard recalcula metaMensal, progresso
  → FinanceHistory recalcula META_ANUAL, barras, tabela
```

## Arquivos modificados (5 arquivos, sem migration)

```
MOD  src/features/finance/components/MetaDiariaProgress.tsx
       — Adicionar prop onEditMeta?: () => void
       — Mostrar ícone Pencil clicável ao lado de "Meta diária: R$/dia"

MOD  src/features/finance/pages/FinanceDashboard.tsx
       — Estado editingMeta + Dialog de edição inline
       — Input de meta diária com cálculo live da meta mensal
       — Salvar via upsertFinanceMemory + invalidateAll
       — Passar onEditMeta para MetaDiariaProgress

MOD  src/features/finance/pages/FinanceHistory.tsx
       — Receber metaDiaria do hook useTotalGuardado (já disponível)
       — META_ANUAL = metaDiaria * 365 (dinâmico)
       — metaMensalForKey usa metaDiaria (não hardcoded 40)
       — Badge da meta anual vira clicável com ícone Pencil
       — Dialog de edição: input meta diária + preview meta anual live
       — Salvar via upsertFinanceMemory + invalidate ['finance-memory']

MOD  src/features/finance/services/finance.service.ts
       — recalcularTotalGuardado: ler meta_diaria do banco antes de upsert
         (não hardcodar 40.00 — respeita o que o user definiu)
       — getHistoricoMensal: aceitar metaDiaria como parâmetro opcional
         (default 40 para retrocompatibilidade)

MOD  src/features/finance/hooks/useHistoricoMensal.ts
       — Aceitar metaDiaria opcional e passar para getHistoricoMensal
```

### UX do Dialog de edição (ambas as páginas)

```
┌─────────────────────────────────┐
│ ✏️  Editar Meta Financeira       │
├─────────────────────────────────┤
│ Meta diária                     │
│ [R$ ____40____]                 │
│                                 │
│ Meta mensal (Março/31 dias)     │
│ R$ 1.240,00  ← atualiza live   │
│                                 │
│ Meta anual (365 dias)           │
│ R$ 14.600,00 ← atualiza live   │
│                                 │
│ [Cancelar]  [💾 Salvar meta]    │
└─────────────────────────────────┘
```

Sem migration — `user_memory.meta_diaria` já existe na tabela com `DEFAULT 40.00`.

