
## Diagnóstico Final — Causa Raiz Confirmada pelo Banco

### O que o banco realmente contém
- **2 notas de reserva**: 16/03 (R$ 40) e 22/03 (nota suja com linhas de ajuste)
- **`user_memory.total_guardado_mes = 40`** — apenas 1 reserva foi contabilizada pelo edge function
- Paulo diz ter R$ 240 guardados = 6 dias × R$ 40 = as outras 4 mensagens **nunca geraram notas no banco**

### Causa 1 — Anti-duplicata bloqueando dias corretos (BUG CRÍTICO)
`process-message` linha 1013–1040: a query anti-duplicata usa `.ilike('title', '%reserva%')` + `gte('created_at', todayStart)`. O problema real é que quando Paulo envia áudios como "E os 40?" em DIAS DIFERENTES, o AI às vezes usa `just_reply` em vez de `create_note` — porque o `effectiveText` vira `[Áudio transcrito]: E os 40?` e o model não detecta como reserva nova no contexto. O `todayNotesTitles` mostra "Gasto com Reserva (22/03)" mesmo quando hoje é 17/03 se a nota foi criada recentemente.

### Causa 2 — `user_memory` acumula +R$ 40 na rota `skipInsert=true` usando `existingMem.total_guardado_mes` que está errado (40, não 80)
Quando o skip acontece, o `replyText` usa `currentTotal` = valor da `user_memory` que já está errado. A IA então confirma o total errado no WhatsApp.

### Causa 3 — `recalcularTotalGuardado` filtra por `startOfMonth` com UTC  
`new Date(now.getFullYear(), now.getMonth(), 1).toISOString()` em São Paulo às 21:00 = 00:00 UTC do dia 1 — correto. Mas o 16/03 tem `created_at: 2026-03-16 21:25:09+00` = 18:25 em Brasília — deveria aparecer. A função **está correta** mas só conta 2 notas (R$ 80) porque só existem 2.

### Causa 4 — Dashboard mostra R$ 40 porque lê `user_memory.total_guardado_mes` que nunca foi atualizado além de R$ 40
A rota `create_note` + `skipInsert=false` só rodou 1x (para a nota 16/03 que foi a primeira). A nota 22/03 foi criada quando já existia uma nota do dia → `skipInsert=true` → `currentTotal` lido da `user_memory` = 40 → somou +40 = 80? Não — a query anti-duplicata da nota 22/03 verificou `gte('created_at', todayStart)` corretamente, encontrou ZERO notas de reserva do dia 22/03 às 16:45 (a nota 22/03 é criada às 16:45), mas como o usuário mandou múltiplos áudios no dia 22, o terceiro/quarto áudio encontrou a nota criada no mesmo dia → `skipInsert=true`, `currentTotal` = 40 (a memória estava em 40), não somou +40 para o mês. **O bug está aqui: o skip path NÃO atualiza `user_memory` com o total correto do mês, apenas lê o valor antigo.**

### Causa 5 — Console errors: `MetaDiariaProgress` e `WhatsAppStyleReport` não usam `React.forwardRef`
Radix UI (Tabs, Card) injeta refs em filhos diretos. Ambos os componentes são `React.FC` simples.

---

## Plano de Correção — 4 arquivos

### Fix 1 — `supabase/functions/process-message/index.ts` (CRÍTICO)

**Problema A**: No path `skipInsert=true` (reserva já existe hoje), o código lê `existingMem.total_guardado_mes` da `user_memory` que pode estar desatualizado. Precisa recalcular da fonte real — as notas.

**Solução**: No path `skipInsert=true`, fazer um SELECT `COUNT(*)` de notas de reserva do mês e multiplicar por `meta_diaria` para responder com o total correto. OU simplesmente não usar o skip path para atualizar total — sempre ler da memória corrigida.

**Problema B**: A nota 22/03 foi criada pelo AI com conteúdo sujo porque o AI gerou "Ajuste de Reserva: R$ 120,00" — isso é o AI sendo mal instruído. O system prompt precisa de instrução explícita: "NUNCA adicione linhas de ajuste, totalização ou cálculo no conteúdo das notas de reserva. O conteúdo DEVE ser apenas: `• Reserva Diária: R$ {meta_diaria},00`".

**Problema C**: `meta_diaria: 40.00` hardcoded no upsert da `user_memory` (linha 1088) — deve ler do banco. Já foi identificado antes mas não foi corrigido no edge function.

**Solução C**: Ler `meta_diaria` do `userMemory` já buscado no contexto (linha 289), usar esse valor.

### Fix 2 — `supabase/functions/process-message/index.ts` — Recalcular total do mês do banco de dados

Ao registrar uma reserva com sucesso (não skip), em vez de somar `+40` ao total da memória, fazer um SELECT COUNT de todas as notas de reserva do mês para calcular o total real:

```typescript
// Count reserva notes for this month
const { count } = await supabase
  .from('notes')
  .select('id', { count: 'exact' })
  .eq('workspace_id', workspace_id)
  .eq('category', 'Financeiro')
  .ilike('title', '%reserva%')
  .gte('created_at', startOfMonth.toISOString())

const newTotal = (count ?? 1) * metaDiariaValue  // cada nota = R$ 40
```

Isso garante que `user_memory` sempre reflete o estado real das notas, não um contador acumulativo que pode desincronizar.

### Fix 3 — `src/features/finance/components/MetaDiariaProgress.tsx`
Wrap com `React.forwardRef` para resolver console error.

### Fix 4 — `src/features/finance/components/WhatsAppStyleReport.tsx`
Wrap com `React.forwardRef` para resolver console error.

### Fix 5 — `src/features/finance/services/finance.service.ts` — `recalcularTotalGuardado`
A função conta notas via `parseReservaTotalFromContent` (smart parser). Isso está correto mas retorna R$ 80. O botão no dashboard vai sincronizar `user_memory` para R$ 80. Depois o usuário pode criar as notas dos dias que faltam via WhatsApp.

**Adicionalmente**: expor um novo botão "Registrar reserva manual" no dashboard para o usuário adicionar retroativamente dias que o bot não registrou.

---

## Arquivos modificados (3 arquivos + 1 deploy)

```
FIX  supabase/functions/process-message/index.ts
       — Fix crítico: ao criar nota de reserva, recalcular total do mês por COUNT de notas
         (não usar soma acumulativa em user_memory que pode dessincronizar)
       — Fix: no path skipInsert=true, ler total_guardado_mes = COUNT * meta_diaria
       — Fix: usar meta_diaria do userMemory (dinâmico) não 40.00 hardcoded
       — Fix system prompt: instrução explícita para conteúdo de nota reserva ser
         APENAS "• Reserva Diária: R$ {valor},00" sem linhas de ajuste/cálculo
       — Deploy automático

FIX  src/features/finance/components/MetaDiariaProgress.tsx
       — Wrap com React.forwardRef (resolve console error Radix ref)

FIX  src/features/finance/components/WhatsAppStyleReport.tsx
       — Wrap com React.forwardRef (resolve console error Radix ref)

FIX  src/features/finance/pages/FinanceDashboard.tsx
       — Botão "Recalcular" dispara recalcularTotalGuardado que sincroniza
         user_memory com as notas reais do banco (corrigi o R$ 40 → R$ 80)
       — Adicionar botão "Registrar reserva manual" com date picker para
         o usuário recuperar os dias que o bot não registrou
```

### Resultado esperado após as correções
- Dashboard: R$ 80 (2 notas × R$ 40 reais no banco) após clicar Recalcular
- Próxima reserva via WhatsApp: total calculado por COUNT real, não por acúmulo
- Console: zero erros de ref
- Sistema prompt: AI não vai mais adicionar linhas "Ajuste de Reserva: R$ 120,00" que poluíam as notas
- Botão manual: Paulo pode registrar retroativamente os 4 dias que faltam (17/03, 18/03, 19/03, 20/03) para chegar nos R$ 240 reais
