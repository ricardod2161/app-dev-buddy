
## Análise Completa — 4 problemas críticos identificados

### Problema 1 (Console Error ativo): `EditMetaDialog` — `DialogFooter` recebe ref indiretamente
O log mostra exatamente:
```
Warning: Function components cannot be given refs. Check the render method of `EditMetaDialog`.
at DialogFooter
```
`DialogFooter` do shadcn/ui usa `React.forwardRef` internamente, mas o `Button` dentro do footer não está causando o erro — o erro real é que o `DialogDescription` está faltando no `EditMetaDialog`, e o Radix UI tenta injetar uma ref em um componente filho que não a aceita. O fix é adicionar `<DialogDescription className="sr-only">` dentro do `DialogContent` (já requerido pelo Radix) e também adicionar `DialogDescription` faltante no `FinanceHistory` que usa o mesmo dialog.

Aviso secundário: `Missing Description or aria-describedby={undefined}` confirma isso.

### Problema 2: Kanban — sem Optimistic Updates (FASE 4 do pedido)
Em `Tasks.tsx` linha 328–338, `updateStatus` usa `onSuccess: invalidateQueries` — o card só muda de coluna APÓS o retorno do servidor. Com latência de rede, isso resulta em card "pulando de volta" visualmente antes de se mover. 

**Fix**: Adicionar `onMutate` com snapshot + update otimista, e `onError` com rollback.

### Problema 3: Realtime para Notes (FASE 4 do pedido)
`useDashboardRealtime.ts` já assina `notes` e `tasks` no dashboard — mas a página `/app/notes` **não tem** nenhuma subscription de realtime. Novas notas criadas pelo bot via webhook só aparecem se o usuário pressiona F5.

**Fix**: Adicionar `useNotesRealtime(workspaceId)` hook com subscription Supabase na página `Notes.tsx`.

### Problema 4: `FinanceHistory.tsx` — `CustomTooltip` não aceita ref (aviso Recharts)
O `CustomTooltip` em `FinanceHistory.tsx` linha 32 é declarado como `React.FC<TooltipProps>` simples, mas Recharts internamente tenta passar refs para o componente de tooltip. Isso gera o aviso "Function components cannot be given refs" no console. **Fix**: Wrap com `React.forwardRef` ou converter para `React.memo` com `forwardRef`.

---

## Plano de execução — 4 arquivos, zero migrations

### 1. `src/features/finance/components/EditMetaDialog.tsx`
- Importar `DialogDescription`
- Adicionar `<DialogDescription className="sr-only">Editar meta diária e anual</DialogDescription>` dentro do `DialogHeader`
- Isso resolve o **console error** e o **aria warning** de uma vez

### 2. `src/features/finance/pages/FinanceHistory.tsx`
- Wrap `CustomTooltip` com `React.forwardRef<HTMLDivElement, TooltipProps>(...)`
- Retorna o JSX via a função interna, passando `ref` para o container div
- Resolve o aviso do Recharts sobre refs em function components

### 3. `src/pages/app/Tasks.tsx` — Optimistic Updates no Kanban
- No `updateStatus` mutation, adicionar:
  - `onMutate`: snapshot atual via `qc.getQueryData`, aplicar update otimista com `qc.setQueryData`
  - `onError`: rollback via `qc.setQueryData(snapshot)`
  - `onSettled`: `qc.invalidateQueries` para sincronizar com o servidor
- Resultado: card move instantaneamente, reverte só se o backend falhar

```typescript
onMutate: async ({ id, status }) => {
  await qc.cancelQueries({ queryKey: ['tasks', workspaceId] })
  const snapshot = qc.getQueryData<Task[]>(['tasks', workspaceId])
  qc.setQueryData<Task[]>(['tasks', workspaceId], old =>
    old?.map(t => t.id === id ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null } : t) ?? []
  )
  return { snapshot }
},
onError: (_err, _vars, ctx) => {
  if (ctx?.snapshot) qc.setQueryData(['tasks', workspaceId], ctx.snapshot)
  toast.error('Erro ao mover tarefa — revertido')
},
onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }),
```

### 4. `src/pages/app/Notes.tsx` — Realtime subscription
- Importar `useEffect` e `supabase`
- Adicionar `useEffect` que assina `postgres_changes` na tabela `notes` com filtro `workspace_id=eq.${workspaceId}`
- Em qualquer evento (`INSERT`, `UPDATE`, `DELETE`), invalidar `['notes', workspaceId]`
- Retornar `() => supabase.removeChannel(channel)` no cleanup

---

## Arquivos modificados (4 arquivos, 0 migrations)

```
FIX  src/features/finance/components/EditMetaDialog.tsx
       — Adicionar DialogDescription (resolve console error + aria warning)

FIX  src/features/finance/pages/FinanceHistory.tsx
       — Wrap CustomTooltip com React.forwardRef (resolve aviso Recharts)

FIX  src/pages/app/Tasks.tsx
       — Optimistic Updates no updateStatus mutation (FASE 4 — Kanban instantâneo)

FIX  src/pages/app/Notes.tsx
       — Realtime subscription para notas (FASE 4 — novas notas aparecem sem F5)
```

### Sobre as FASES 2 e 3 do pedido

**FASE 2 (Multi-tenant)**: O sistema **já está completamente multi-tenant**. Todas as tabelas têm `workspace_id`, todas as queries filtram por ele, e todas as RLS policies usam `is_workspace_member(workspace_id, auth.uid())`. Não há nada a implementar aqui — está pronto.

**FASE 3 (Webhook assíncrono + contexto Gemini)**: Os webhooks **já retornam 200 imediatamente** e disparam `process-message` de forma assíncrona. O `process-message` **já injeta histórico de conversas** (últimas mensagens) no contexto do Gemini. Essas funcionalidades estão implementadas nas edge functions existentes.

O foco real de valor são os 4 bugs/melhorias confirmados pelos console logs e pela análise do código.
