
## Diagnóstico cirúrgico — causa raiz encontrada

### Estado real do banco (confirmado)

| Nota | Dia | Conteúdo |
|------|-----|----------|
| 1 | 16/03 | `• Reserva Diária (Meta Anual): R$ 40,00` ✅ |
| 2 | 16/03 | `• Reserva: R$ 40,00` — **duplicata do dia 16** |
| 3 | 17/03 | `• Reserva Diária (Meta Anual): R$ 40,00` ✅ |
| 4 | 18/03 | `• Reserva Diária (Meta Anual): R$ 40,00` ✅ |
| 5 | 19/03 | `• Reserva Diária (Meta Anual): R$ 40,00` ✅ |
| 6 | 19/03 | `• Reserva Diária (Meta Anual): R$ 40,00` — **duplicata do dia 19** |
| 7 | 22/03 | Nota suja com Ajuste R$120 + Adicional + Adicional |

**Total real correto: R$ 240** (dias: 16, 17, 18, 19, 20, 21 ou 22 — 6 dias × R$ 40)  
**Total real único por dia: R$ 280 se contar duplicatas, ou R$ 240 deduplicated**

### Bug 1 — CRÍTICO: `getReservasMes` e `recalcularTotalGuardado` somam por NOTA, não por DIA

O banco tem **7 notas** mas apenas **6 dias únicos**. O 16/03 tem 2 notas, o 19/03 tem 2 notas. O parser conta cada nota separada → resultando em totais errados.

A lógica `cleanDuplicateReservas` deveria ter mesclado as duplicatas, mas não foi executada (ou não encontrou as notas 16/03 pois elas têm conteúdos diferentes: "Reserva Diária" vs "Reserva:").

### Bug 2 — CRÍTICO: `cleanDuplicateReservas` não detecta notas do mesmo dia com conteúdos diferentes

O Step 3 (merge same-day) agrupa por `created_at.substring(0, 10)` = data UTC. A nota 1 do dia 16/03 tem `created_at: 2026-03-16 15:00:00+00` e a nota 2 tem `2026-03-16 21:25:09+00` — ambas têm dia `2026-03-16`. Mas o merge não foi executado porque a Step 3 usa `byDay[day] = []` e só agrupa notas que passam pelo filtro `.or('title.ilike.%reserva%,content.ilike.%reserva%')`. **Isso está correto — o merge deveria ter funcionado.**

**A causa real**: `getReservasMes` e `recalcularTotalGuardado` somam TODAS as notas individualmente, incluindo as duplicatas de dias que não foram limpas ainda. Resultado: a soma dá R$ 40 (apenas 1 nota via `parseReservaTotalFromContent`) porque a nota 22/03 tem o `PRIMARY_RESERVA_PATTERN` match e retorna R$ 40, mais 6 notas limpas = R$ 280. Mas o dashboard mostra R$ 40 porque `user_memory.total_guardado_mes = 40` e o `totalReservas` do `useReservasMensais` tem `staleTime: 30_000` — a query pode estar servindo dados em cache desatualizados.

**Confirmação**: O `useTotalGuardado` lê `memory.total_guardado_mes = 40` (stale do banco). O `totalGuardado` no dashboard é `totalReservas > 0 ? totalReservas : memory.total_guardado_mes`. Se `useReservasMensais` está retornando as notas corretamente, `totalReservas` DEVERIA ser R$ 280+ (7 notas × R$ 40). Se está mostrando R$ 40, há um problema de cache ou de staleTime.

### Bug 3 — A lógica de fallback usa `user_memory.total_guardado_mes = 40`

Mesmo que `totalReservas` calcule correto, a linha:
```typescript
const totalGuardado = totalReservas > 0 ? totalReservas : (totalData?.memory?.total_guardado_mes ?? 0)
```
só usa `memory` se `totalReservas === 0`. O problema é que `user_memory.total_guardado_mes = 40` nunca é corrigido automaticamente — fica defasado.

### Bug 4 — `staleTime: 30_000` não invalida entre sessões

Se o usuário adicionou as reservas manuais e depois recarregou a página, o TanStack Query ainda pode servir cache em memória por 30 segundos. Mas o problema mais sério é: o `invalidateAll()` é chamado depois do `handleManualReserva`, mas o componente não faz **auto-refresh ao montar** — depende de dados já em cache.

### Solução definitiva — 4 mudanças

**Mudança 1 — `recalcularTotalGuardado` (finance.service.ts)**  
Em vez de somar `parseReservaTotalFromContent` por nota (que pode contar duplicatas), deduplicate por dia:
```typescript
// Agrupar por dia, pegar apenas 1 nota por dia (a mais limpa)
const byDay = new Map<string, number>()
for (const note of notes) {
  const dia = note.created_at.substring(0, 10) // YYYY-MM-DD
  if (!byDay.has(dia)) {  // primeira nota do dia = valor correto
    const fullText = [note.title ?? '', note.content ?? ''].join('\n')
    const valor = parseReservaTotalFromContent(fullText)
    if (valor > 0) byDay.set(dia, valor)
  }
}
const total = [...byDay.values()].reduce((s, v) => s + v, 0)
const notasContadas = byDay.size
```

**Mudança 2 — `getReservasMes` (finance.service.ts)**  
Mesma lógica: deduplicate por dia antes de retornar. Uma entrada por dia único. Isso corrige `totalReservas` no dashboard.

**Mudança 3 — `FinanceDashboard` — auto-recalcular ao montar**  
Adicionar um `useEffect` que chama `recalcularTotalGuardado` silenciosamente ao montar o componente (se `user_memory` estiver defasado — verificar se `total_guardado_mes` difere do que as notas dizem). Na prática: disparar `recalcularTotalGuardado` em background ao carregar a página e invalidar queries.

**Mudança 4 — `staleTime: 0` para finance-reservas-mes**  
Mudar o staleTime de `useReservasMensais` para `0` (sempre refetch ao montar) — dados financeiros devem ser sempre frescos.

**Mudança 5 — Melhorias de UI:**
- Adicionar botão "Limpar + Recalcular" que executa ambas as operações em sequência (um único clique)
- Mostrar contagem de dias únicos nos cards ("6 dias únicos" em vez de "7 notas")
- Adicionar Realtime subscription para `notes` na página de finanças (igual ao que foi feito em Notes.tsx)
- Melhorar o card "Total guardado" com tooltip mostrando detalhes

---

## Arquivos a modificar (3 arquivos)

```
FIX  src/features/finance/services/finance.service.ts
       — recalcularTotalGuardado: deduplicate por dia (não por nota)
         Uma nota por dia → total correto sem contar duplicatas
       — getReservasMes: deduplicate por dia antes de retornar ReservaEntry[]
         Resultado: 6 entradas únicas em vez de 7 com duplicatas

FIX  src/features/finance/hooks/useReservasMensais.ts
       — staleTime: 0 (sempre frescos)

FIX  src/features/finance/pages/FinanceDashboard.tsx
       — useEffect ao montar: dispara recalcularTotalGuardado em background
         e invalida queries → dashboard atualiza sem precisar clicar no botão
       — Adicionar Realtime subscription para tabela notes (filtro Financeiro)
         → qualquer nova nota de reserva reflete instantaneamente
       — Botão combo "Limpar + Recalcular" em um único passo
       — Melhor UX: mostrar "X dias guardados" em vez de "X nota(s)"
```

### Resultado esperado
- Dashboard ao abrir: calcula automaticamente R$ 240 (6 dias × R$ 40), sem clicar em nada
- Card "Total guardado": R$ 240,00 ✅ Meta ok
- Card "Só reservas": R$ 240,00 — 6 dias únicos
- Progresso: 19% (R$ 240 ÷ R$ 1.240 meta mensal)
- Qualquer nova reserva via WhatsApp aparece em segundos na tela
