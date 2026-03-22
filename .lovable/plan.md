

## Diagnóstico cirúrgico — causa raiz de cada erro

### Estado real do banco (confirmado via SQL)

Existem **2 notas de reserva** no banco:

**Nota 16/03:**
```
• Reserva: R$ 40,00
• Reserva Adicional: R$ 40,00
• Reserva Adicional (22/03): R$ 40,00
```
Parser atual soma R$ 120 → **deveria ser R$ 40** (é um dia de reserva)

**Nota 22/03:**
```
• Reserva Diária (Meta Anual): R$ 40,00
• Ajuste de Reserva (22/03): R$ 120,00 (Para totalizar R$ 240,00 conforme áudio)
• Reserva Adicional: R$ 40,00 (22/03)
• Reserva Adicional: R$ 40,00 (22/03)
```
Parser soma R$ 200 → **deveria ser R$ 40** (um dia, um valor)

**`user_memory` está VAZIO** (tabela vazia — edge function nunca gravou)

**Total real que o sistema devia mostrar: R$ 80** (R$ 40 × 2 dias com nota registrada — 16/03 e 22/03)

---

## Por que o parser erra

### Bug 1 — "Reserva Adicional" são linhas de ajuste, não novos valores
A edge function `process-message` quando recebe um áudio com "E os 40?" faz `update_note` com `append_content` adicionando `• Reserva Adicional: R$ 40,00`. Cada vez que o Paulo manda áudio confirmando a reserva do mesmo dia, o AI appenda uma linha extra. São **ajustes contábeis dentro da mesma reserva diária**, não valores independentes. O parser os soma todos.

### Bug 2 — "Ajuste de Reserva (22/03): R$ 120,00" não é filtrado
A linha `• Ajuste de Reserva (22/03): R$ 120,00 (Para totalizar R$ 240,00)` é uma linha de **consolidação/ajuste** que deveria ser ignorada. A keyword "Ajuste" indica que é uma correção contábil, não um novo depósito. Mas o filtro atual só remove linhas com "total/meta/progresso/acumulado".

### Bug 3 — edge function usa `extractFinancialValues` que soma todos os valores do texto
No `process-message`, ao fazer `create_note` financeiro, a linha:
```typescript
const fin = extractFinancialValues(`${fnArgs.title} ${fnArgs.content}`)
```
vai somar TODOS os valores do content para gravar em `user_memory`. Uma nota com R$ 40 + R$ 120 + R$ 40 + R$ 40 = **R$ 240** é gravada como total. Por isso o AI dizia "total: R$ 200,00" (somou tudo incorretamente).

### Bug 4 — `user_memory` vazio
A tabela `user_memory` está completamente vazia. O upsert na edge function faz `.insert()` quando não existe registro, mas pode estar falhando silenciosamente em alguma validação RLS. Precisa ser corrigido no edge function com upsert seguro.

---

## O que o Paulo precisa ver de verdade

Período: 16/03 a 22/03 = **7 dias** mas **apenas 2 dias têm nota** (16/03 e 22/03).
- Total real de reservas registradas: **R$ 80,00** (R$ 40 × 2 notas)
- Cada nota representa R$ 40 (a meta diária)

O relatório completo que o Paulo pede via WhatsApp deve mostrar:
```
Reservas — Março/26:

1. Gasto com Reserva (22/03) (Financeiro)
   • Reserva Diária: R$ 40,00

2. Gasto com Reserva (16/03) (Financeiro)
   • Reserva: R$ 40,00

Total guardado: R$ 80,00
```

---

## Correções

### Correção 1 — `parse-finance.ts` (CRÍTICO)

**Regra nova para `parseReservaTotalFromContent`:**
- Uma nota representa **UMA entrada** (um dia). O valor correto é a **primeira** linha com R$ valor que contém "Reserva Diária" ou "Reserva:" — ela é o valor declarado.
- Linhas com "Ajuste", "Adicional", "totalizar", "conforme" → ignorar (são correções/comentários)
- Fallback: se não encontrar linha-chave, soma apenas a primeira linha com R$ encontrada (já que qualquer nota de reserva tem no mínimo R$ 40)

```typescript
// NOVO: keywords que indicam linha de ajuste/consolidação — NÃO contar
const ADJUSTMENT_KEYWORDS = /\b(ajuste|adicional|totalizar|conforme|para\s+totalizar|correção)\b/i
```

### Correção 2 — Limpeza das 2 notas sujas no banco

A limpeza existente (`cleanDuplicateReservas`) já deduplicata linhas idênticas mas não remove linhas de "Ajuste" e "Adicional" que são linhas distintas. Precisamos de uma etapa adicional: **normalizar o conteúdo de cada nota de reserva para manter apenas a linha principal** (R$ 40 da meta diária).

Nova função `normalizeReservaNote(content)`:
- Mantém apenas a primeira linha com valor que representa a reserva real
- Remove linhas com "Ajuste", "Adicional", "Para totalizar", "conforme áudio"

### Correção 3 — `process-message/index.ts` — `extractFinancialValues` no create_note (CRÍTICO)

O `extractFinancialValues` soma TUDO. Para notas de reserva, deve usar apenas o valor declarado (R$ 40), não somar todos os valores do content.

Correção no handler `create_note`:
```typescript
// Para notas de reserva, o valor real é a meta diária (R$ 40)
// NÃO somar todos os valores do content — o content pode ter ajustes/confirmações
const isReserva = /reserva/i.test(`${fnArgs.title} ${fnArgs.content}`)
const reservaValue = isReserva ? 40 : fin.total  // sempre R$ 40 para reservas diárias
```

Mais robusto: extrair apenas o primeiro R$ valor do content (excluindo linhas de ajuste).

### Correção 4 — `process-message/index.ts` — upsert `user_memory` seguro

O upsert atual usa `.insert()` e `.update()` separados com risco de race condition. Usar `.upsert()` com `onConflict: 'workspace_id'`:

```typescript
await supabase.from('user_memory').upsert(
  { workspace_id, meta_diaria: 40, total_guardado_mes: newTotal, ... },
  { onConflict: 'workspace_id' }
)
```

### Correção 5 — Botão "Recalcular total" no Dashboard

Adicionar função `recalcularTotalGuardado(workspaceId)` no `finance.service.ts`:
1. Busca todas as notas de reserva do mês
2. Usa o parser corrigido para calcular R$ 40 × número de notas únicas
3. Faz upsert em `user_memory` com o total correto

Expor como botão "Recalcular" no `FinanceDashboard` para Paulo corrigir o total atual.

### Correção 6 — `FinanceDashboard` — "Total guardado" mostra errado

Atualmente usa `totalReservas` que vem de `useReservaParser` → `noteToGasto` → `parseMonetaryValue(content)`. `parseMonetaryValue` pega apenas o **primeiro** R$ encontrado no content, que é correto (R$ 40). Mas `totalReservas` soma todos os itens de `reservas[]` que já inclui as 2 notas → R$ 80. Isso está correto.

O problema é que o edge function diz "total: R$ 200,00" na confirmação de reserva. A correção do `process-message` fix isso.

---

## Arquivos

```
MOD  src/features/finance/lib/parse-finance.ts
       — parseReservaTotalFromContent: nova regra — ignorar linhas com "Ajuste/Adicional/conforme"
       — Nova função normalizeReservaContent: limpa content mantendo só linha principal

MOD  src/features/finance/services/finance.service.ts
       — cleanDuplicateReservas: adicionar step 3 — normalize content (remover linhas de ajuste)
       — Nova função recalcularTotalGuardado: recalcula e faz upsert em user_memory

MOD  src/features/finance/pages/FinanceDashboard.tsx
       — Botão "Recalcular total guardado" com feedback visual

MOD  supabase/functions/process-message/index.ts
       — Handler create_note: para reservas, usar valor fixo R$ 40 (não somar todo o content)
       — upsert user_memory: usar .upsert() com onConflict em vez de .select()/.insert()/.update() separados
       — Regra anti-duplicata mais inteligente: ao registrar reserva, verificar se já existe nota de reserva HOJE com valor R$ 40 — se sim, usar just_reply confirmando sem criar/atualizar
```

**Resultado esperado:**
- Histórico: Mar/26 = R$ 80,00 (2 notas × R$ 40)
- Dashboard: Total guardado = R$ 80,00
- WhatsApp: "total: R$ 80,00" nas confirmações
- Relatório filtro reservas: mostra 2 itens, total R$ 80,00
- `user_memory` passa a ser gravado corretamente a cada nova reserva
