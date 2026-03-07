
## Plan: 15 Engineering Improvements

This is a large batch of improvements across 8 files. Here's exactly what gets changed and why.

---

### Files to modify

```
1.  src/contexts/AuthContext.tsx        — remove window.location.reload()
2.  src/pages/app/Notes.tsx             — pagination + react-hook-form in modal
3.  src/pages/app/Tasks.tsx             — pagination + react-hook-form in modal
4.  src/pages/app/Conversations.tsx     — Realtime subscription for messages
5.  src/components/ErrorBoundary.tsx    — NEW: class component error boundary
6.  src/App.tsx                         — wrap routes with ErrorBoundary
7.  package.json                        — rename to "app-dev-buddy"
8.  supabase/functions/get-dashboard-stats/index.ts  — NEW edge function
9.  src/pages/app/Dashboard.tsx         — replace 9 queries with 1 edge function call
10. supabase/functions/process-message/index.ts — 8 system prompt / behavior improvements
```

---

### Change details

**1. AuthContext — remove reload**
Line 106: Remove `setTimeout(() => window.location.reload(), 300)`.
After `setWorkspace(ws)`, the state propagates naturally to all consumers via React context. The reload is unnecessary since `workspaceId` is already set via `setWorkspace`.

**2 & 3. Notes + Tasks — Pagination**
- Add `const PAGE_SIZE = 20` and `const [page, setPage] = useState(0)`
- Include `page` in `queryKey: ['notes', workspaceId, page]`
- Add `.range(page * 20, page * 20 + 19)` to the query
- Add a "Carregar mais" button below the list — only shown when results returned === PAGE_SIZE
- On new note/task created: reset page to 0 and invalidate

**2 & 3. Notes + Tasks — react-hook-form + Zod in modals**

NoteModal schema:
```typescript
const noteSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().optional().default(''),
  category: z.string().optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).default([]),
})
```

TaskModal schema:
```typescript
const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_at: z.string().optional(),
  project: z.string().optional(),
})
```

Replace all `useState` field state with `useForm({ resolver: zodResolver(...) })`. Use `<Form>`, `<FormField>`, `<FormItem>`, `<FormMessage>` from shadcn. Keep the existing TipTap editor for notes content via `Controller`.

**4. Conversations — Realtime**
Add `useEffect` with Supabase channel subscription:
```typescript
const channel = supabase.channel(`messages-${workspaceId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `workspace_id=eq.${workspaceId}`,
  }, () => {
    qc.invalidateQueries({ queryKey: ['messages', workspaceId, selectedId] })
    qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
  })
  .subscribe()
return () => { supabase.removeChannel(channel) }
```
Also need `useQueryClient` import.

**5. ErrorBoundary component (new file)**
```typescript
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  componentDidCatch(error, errorInfo) { ... }
  render() {
    if (this.state.hasError) return <FriendlyErrorScreen />
    return this.props.children
  }
}
```
The fallback UI shows "Algo deu errado", the error message, and a "Tentar novamente" button calling `window.location.reload()`.

**6. App.tsx — wrap routes**
Import `ErrorBoundary` and wrap each page `<Route element={...}>` with `<ErrorBoundary>`. This ensures one broken page doesn't crash the whole app.

**7. package.json**
Change `"name": "vite_react_shadcn_ts"` → `"name": "app-dev-buddy"`.

**8. New Edge Function: get-dashboard-stats**
File: `supabase/functions/get-dashboard-stats/index.ts`

Accepts `{ workspace_id }` in POST body. Returns in a single response:
- `notes_today` (count)
- `tasks_pending` (count of todo+doing)
- `reminders_24h` (count scheduled in next 24h)
- `messages_today` (count IN direction)
- `notes_chart` (7-day array `[{dia, notas}]`)
- `tasks_chart` (status distribution `[{status, total}]`)
- `today_spend` (number, BRL)
- `recent_notes` (last 4)
- `recent_tasks` (last 4)

All queries run with `Promise.all` inside the function. Uses `SUPABASE_SERVICE_ROLE_KEY` (already set as secret).

**9. Dashboard.tsx — single edge function call**
Replace the 9 individual `useQuery` hooks with a single one:
```typescript
const { data: stats, isLoading } = useQuery({
  queryKey: ['dashboard-stats', workspaceId],
  queryFn: async () => {
    const { data } = await supabase.functions.invoke('get-dashboard-stats', {
      body: { workspace_id: workspaceId }
    })
    return data
  }
})
```
Destructure `stats` into the same variables used in the render. Keep the same metric cards and chart components unchanged.

**10. process-message/index.ts — 8 system prompt improvements**

All changes are in the system prompt string and one helper function, no logic changes:

a) **Time-based greeting** — compute `greetingHour` from `now` in workspace timezone, derive `saudacao` ('Bom dia'/'Boa tarde'/'Boa noite'), inject into system prompt before "## Regras de Ouro".

b) **Varied confirmations** — replace rule 4 with the new multi-example rule as specified.

c) **Typing indicator** — add `sendTypingIndicator()` function that calls Evolution `/chat/sendPresence/{instance}` with `composing`, called before `sendReply()` when `provider === 'EVOLUTION'`.

d) **Proactive greeting behavior** — add `## Comportamento ao Receber Cumprimentos` section to system prompt.

e) **Emotional empathy** — add `## Empatia e Contexto Emocional` section.

f) **Single-question clarification** — replace rule 7 with the updated version (one question max, always ask time for reminders without time).

g) **Contextual emoji usage** — replace rule 3 with the updated smart-emoji rule.

h) **Friendly error messages** — replace all `❌ Não encontrei nenhuma nota/tarefa/lembrete...` strings in the tool handlers with the friendly versions.

i) **Default bot_personality migration** — add a SQL migration updating the default value of `bot_personality` in `workspace_settings` for existing workspaces that have no personality set.

---

### No DB schema migrations needed
Only a `UPDATE workspace_settings SET bot_personality = '...' WHERE bot_personality IS NULL` data update for existing records.

---

### Summary of impact
```
AuthContext:     cleaner state propagation, no full reload on auto-recovery
Notes page:      load 20 at a time, faster initial load, form validation
Tasks page:      load 20 at a time, form validation with inline errors
Conversations:   messages appear in real-time without manual refresh
ErrorBoundary:   isolated crash pages — app never goes fully blank
Dashboard:       1 network call instead of 9 (faster, cheaper)
process-message: smarter greetings, typing indicator, empathy, varied replies
```
