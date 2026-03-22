
## Analysis

### What the user wants
1. Create a `user_memory` table to persist Paulo's financial data: daily goal, monthly savings total, last reservation date
2. Update the AI persona prompts (already heavily configured) with the new parameters (temperature 0.2, top_p 0.9, max_tokens 1500) and inject memory data from the new table into context

### Database Design

New table `user_memory` scoped to `workspace_id` (multi-tenant):
```sql
CREATE TABLE public.user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  meta_diaria numeric NOT NULL DEFAULT 40.00,
  total_guardado_mes numeric NOT NULL DEFAULT 0.00,
  ultima_reserva_data date NULL,
  ultima_reserva_valor numeric NULL DEFAULT 40.00,
  mes_referencia text NULL, -- e.g. "2026-03"
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workspace_id)
);
```

RLS: workspace members can SELECT/INSERT/UPDATE (same pattern as other tables).

### Where memory gets READ

**`supabase/functions/ai-chat/index.ts`** — When `include_context=true`, also query `user_memory` and inject into system prompt:
```
## MEMÓRIA FINANCEIRA DO PAULO:
- Meta diária: R$ 40,00
- Total guardado este mês (${mes}): R$ XXX,XX
- Última reserva: XX/XX
```

**`supabase/functions/process-message/index.ts`** — Already queries context. Add `user_memory` query alongside notes/tasks and inject into `financialContext` section.

### Where memory gets WRITTEN

**`process-message/index.ts`** — When `fnName === 'create_note'` and `isFinancial` and the note has "reserva"/"guardei" keyword, update `user_memory`:
- `total_guardado_mes += amount extracted`
- `ultima_reserva_data = today`
- `ultima_reserva_valor = amount`
- `mes_referencia = current YYYY-MM`

### Parameter update
Both functions currently have `temperature: 0.3, top_p: 0.85, max_tokens: 1200` → update to `temperature: 0.2, top_p: 0.9, max_tokens: 1500` per user request.

### New UI component
Add a small **"Memória Financeira"** section in `src/pages/app/Settings.tsx` (or a new card in Dashboard) showing:
- Meta diária atual (editable)
- Total guardado no mês
- Última reserva
- Button "Resetar mês"

Given this is a Settings concern, I'll add it to the Settings page.

---

## Files

```
MIGRATION  supabase/migrations/YYYYMMDD_user_memory.sql
             — CREATE TABLE user_memory with RLS policies

MOD  supabase/functions/ai-chat/index.ts
       — Query user_memory when include_context=true
       — Inject memory into system prompt financeiro
       — temperature 0.2, top_p 0.9, max_tokens 1500

MOD  supabase/functions/process-message/index.ts
       — Query user_memory at context load time
       — Inject memory total/meta/ultima reserva into prompt
       — After create_note (reserva), upsert user_memory
       — temperature 0.2, top_p 0.9, max_tokens 1500

MOD  src/pages/app/Settings.tsx
       — Add "Memória Financeira" card: meta diária, total guardado, última reserva, reset button
```

No new npm packages. No new edge functions. Migration auto-deploys.
