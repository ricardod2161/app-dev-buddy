## Diagnóstico completo — causa raiz dos R$ 3.565,51 incorretos

Dados reais no banco para Março/2026:

- Apenas **2 notas de reserva**: 22/03 (R$ 40,00) e 16/03 (R$ 40,00 × 10 linhas duplicadas)
- **Real guardado**: R$ 40 + R$ 40 = **R$ 80,00**

### Bug 1 (principal): `getHistoricoMensal` soma TUDO

Em `finance.service.ts`, linha 129-133, o loop pega **todas** as notas `category='Financeiro'` e soma os valores — gastos, recebimentos, fretes, reservas, dívidas — sem filtrar por tipo. Isso inclui:

- Gasto Moto R$ 100
- Dívida Yuri R$ 30 + R$ 17 + R$ 30 × 3
- Gasto R$ 260,51 (Agência de Fomento)
- Fralda R$ 240
- Recebimentos R$ 250, R$ 340, R$ 200, etc.

**Correção**: filtrar apenas notas onde `title ILIKE '%reserva%' OR content ILIKE '%reserva%'`.

### Bug 2 (secundário): nota 16/03 tem "Reserva Adicional" repetida 10x

O content da nota `dc18684d` tem `• Reserva: R$ 40,00` + `• Reserva Adicional: R$ 40,00` × 9 linhas. `parseMonetaryValue` pega só o primeiro valor (R$ 40), então esse bug é menos grave — mas a nota representa 1 reserva de R$ 40, não 10. Isso provavelmente foi criado pelo AI duplicando o registro. A correção do Bug 1 já resolve a exibição.

### Bug 3 (parser): `useTotalGuardado` usa `user_memory.total_guardado_mes`

Esse campo pode estar correto (atualizado pelo edge function) ou pode ter sido inflado pelas mesmas duplicações. Deve mostrar o valor real do banco.

---

## O que será corrigido

### `finance.service.ts` — `getHistoricoMensal`

Adicionar filtro reserva-only: `ilike('title', '%reserva%')` OR filtrar no JS após busca (mais seguro pois o OR no Supabase precisa de `.or()`).

Estratégia: buscar com `.or('title.ilike.%reserva%,content.ilike.%reserva%')` — assim só notas de reserva entram no cálculo de "guardado".

```typescript
// ANTES: busca tudo
.eq('category', 'Financeiro')

// DEPOIS: só reservas
.eq('category', 'Financeiro')
.or('title.ilike.%reserva%,content.ilike.%reserva%')
```

### `finance.service.ts` — `getGastosMes` (para total guardado no dashboard)

A função `getGastosMes` já classifica corretamente via `noteToGasto` + `isReserva`, então os hooks que dependem dela (`useTotalGuardado` usando `user_memory`, `WhatsAppStyleReport`) já filtram certo no display. O problema é só no histórico.

### `FinanceHistory.tsx` — adicionar nota explicativa

Mostrar claramente: "Mostrando apenas entradas de reserva (poupança). Gastos e recebimentos aparecem em Minhas Finanças."

---

## Arquivos

```
MOD  src/features/finance/services/finance.service.ts
       — getHistoricoMensal: adicionar .or('title.ilike.%reserva%,content.ilike.%reserva%')
       — getGastosHoje/getGastosMes: sem mudança (já filtram por tipo depois)

MOD  src/features/finance/pages/FinanceHistory.tsx
       — Adicionar badge/nota explicativa: "Só reservas contabilizadas"
       — Mostrar total real (com o fix, deve exibir R$ 80,00 para Mar/26)
```

Sem migrations. Apenas 2 arquivos. Fix cirúrgico.

### Resultado esperado após o fix

- Mar/26: R$ 80,00 (R$ 40 dia 22 + R$ 40 dia 16) ✅
- Meta anual: 80 / 14.600 = **0,5%** — número honesto e real, ainda esta mostrando e somando errado , comecei a guardar dia 16 ate hoje dia 22 era pra ter 280 guandado, entao ajuste tudo e faç melhorias e inteligência.