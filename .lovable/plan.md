
## Honest assessment of what already exists

Reading all the files reveals this system is already VERY sophisticated:

### Already fully implemented — do NOT re-implement:
- **AIChat.tsx (1154 lines)**: Streaming SSE, Deep Think (Gemini 2.5 Pro), model selector (4 models), Web Speech API microphone input, browser TTS output, autonomous action executor (create_task/note/reminder), action badges, dynamic suggested prompts from real tasks, multi-line markdown renderer (code blocks with language, H1-H3, blockquotes, ordered/unordered lists), export MD, stop stream, regenerate, copy button, conversation persistence in Supabase
- **CommandPalette.tsx (213 lines)**: Cmd+K, live DB search (notes + tasks via debounced ilike), navigation groups
- **Dashboard.tsx**: ZyntraSuggestionsCard with AI proactive suggestions, 30min session cache, charts
- **Tasks.tsx**: Full Kanban dnd-kit, 3 columns, RHF+Zod modal
- **Notes.tsx**: TipTap inline editing, auto-save logic
- **Reminders.tsx**: RHF+Zod, chrono-node NLP date parsing
- **Contacts.tsx**: Full mini-CRM with RHF+Zod
- **Conversations.tsx**: Realtime subscription, last message preview, direction indicator
- **Reports.tsx**: AI-generated reports, export
- **AppSidebar.tsx**: Collapsible, tooltips, mobile overlay
- **supabase/functions/ai-chat**: Action system prompt with autonomous actions, context injection, streaming, Deep Think routing
- **useKeyboardShortcuts.ts**: N, T, R shortcut hooks

### Real gaps — what actually needs building:

**1. AIChat: "Proactive Mode" toggle with real background monitoring**
The biggest remaining differentiator. Currently ZYNTRA only responds to direct messages. Adding a "Modo Proativo" toggle that, when ON:
- On page load, checks for overdue tasks + tasks due today (Supabase query)
- If there are critical items, automatically sends a "push notification" message into the chat from ZYNTRA WITHOUT the user asking
- This is the actual "Alexa+" behavior — proactively speaking up
- Implementation: on chat page mount, if `proactiveMode` is ON and it hasn't triggered in this session, run a check and inject an AI-generated "proactive briefing" message

**2. AIChat: Conversation search / filter in the sidebar**
The left sidebar shows all conversations but has no search. With heavy usage, finding old conversations is impossible. Add a search input to filter by title.

**3. AIChat: "Auto-Pilot" mode — chain of autonomous actions from one prompt**
Currently ZYNTRA executes 1 action at a time. Auto-Pilot would:
- Accept: "Prepara o sprint de amanhã" 
- Execute: create_task + create_note + create_reminder in one response
- Already technically works via multiple ACTION blocks — just needs better UI feedback (action execution summary card)

**4. Notes.tsx: Auto-save with debounce indicator**
Currently has a manual "Salvar" button inside inline cards. Should auto-save after 1.5s of inactivity. Shows "Salvando…" → "Salvo ✓" state indicator. This is the most-requested improvement pattern for note-taking apps.

**5. Tasks.tsx: 4th column "Cancelado" (canceled)**
The schema has `status: text` with no constraint — we can use any value. The current 3 columns miss the `canceled` status. Add a 4th column with grayed styling. Update the zod schema to include `'canceled'` as a valid status.

**6. Dashboard: Real-time "live" updates via Supabase Realtime**
Dashboard currently shows stale counts that only refresh on query stale time. Add a Supabase Realtime channel subscription for tasks and notes tables to invalidate dashboard queries when items change. Makes the dashboard feel "alive."

**7. Command Palette: Create-actions in palette**
Currently only navigates. Add action items: "Nova Tarefa", "Nova Nota", "Novo Lembrete" that, when selected, navigate to the page AND trigger the creation modal via URL state (`?new=1`).

**8. Settings page: Unsaved changes warning**
Currently if user edits and navigates away, all changes silently drop. Add a `isDirty` flag and `beforeunload` warning + a banner "Você tem alterações não salvas".

### What I will NOT do (honest scope management):
- Feature folder migration — high risk, zero visible benefit
- Framer Motion — adds package, existing CSS transitions adequate
- PWA manifest — requires `vite-plugin-pwa`, not installed, separate concern
- `react-markdown` package — not installed, existing parser is solid
- Touch AuthContext — intentional race condition handling
- Touch supabase/client.ts — auto-generated
- "Better than Alexa" marketing README — irrelevant to UX
- Notion slash commands — 500+ line TipTap extension, too risky

---

## Implementation plan

### Files to create:
None

### Files to modify:
```
1. src/pages/app/AIChat.tsx
   - Add "Modo Proativo" toggle (new state: proactiveMode)
   - On mount + proactiveMode=true: query overdue/today tasks, if any exist → inject proactive ZYNTRA message automatically
   - Add conversation search/filter in left sidebar
   - Add execution summary card (shows ALL actions executed in one response, not just individual badges)
   - sessionStorage flag to avoid re-triggering proactive message on same session

2. src/pages/app/Notes.tsx
   - Replace manual "Salvar" button with auto-save debounce (1500ms)
   - Add "Salvando…" / "Salvo ✓" / "Erro ao salvar" status indicator per card
   - Use useRef for debounce timer

3. src/pages/app/Tasks.tsx
   - Add 4th column: { key: 'canceled', label: '🚫 Cancelado', color: 'border-muted-foreground/30' }
   - Update taskSchema: status: z.enum(['todo', 'doing', 'done', 'canceled'])
   - Style canceled column with muted/dimmed appearance

4. src/pages/app/Dashboard.tsx
   - Add Supabase Realtime subscription for tasks + notes tables
   - On INSERT/UPDATE/DELETE → invalidate relevant dashboard queries
   - Add cleanup on unmount

5. src/components/CommandPalette.tsx
   - Add "Ações Rápidas" group with: Nova Tarefa, Nova Nota, Novo Lembrete
   - These items navigate + pass `?new=1` query param
   - Cosmetic: add keyboard shortcut hints (⌘N, ⌘T, ⌘R) displayed on right

6. src/pages/app/Settings.tsx
   - Add isDirty tracking (compare current form state vs loaded settings)
   - Add unsaved changes banner when isDirty is true
   - Add beforeunload event listener warning

7. src/pages/app/Reminders.tsx  
   - Hook up `?new=1` URL param to auto-open create dialog (from CommandPalette action)

8. src/pages/app/Tasks.tsx (already listed above, add URL param too)
   - Hook up `?new=1` URL param to auto-open TaskModal

9. src/pages/app/Notes.tsx (already listed above, add URL param too)
   - Hook up `?new=1` URL param to auto-open new note dialog
```

### Technical details for the proactive feature (most important):

```typescript
// In AIChat.tsx, on mount:
useEffect(() => {
  if (!proactiveMode || !workspaceId) return
  const sessionKey = `zyntra_proactive_${workspaceId}_${new Date().toDateString()}`
  if (sessionStorage.getItem(sessionKey)) return // already fired today
  
  // Query tasks overdue or due today
  supabase.from('tasks').select('title,priority,due_at,status')
    .eq('workspace_id', workspaceId)
    .in('status', ['todo', 'doing'])
    .lte('due_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .limit(3)
    .then(({ data }) => {
      if (!data || data.length === 0) return
      sessionStorage.setItem(sessionKey, '1')
      // Start a new chat with proactive briefing
      handleSend(`[MODO PROATIVO] Faça um briefing proativo sobre essas tarefas urgentes/atrasadas: ${data.map(t => t.title).join(', ')}. Seja direto, empático e sugira ações concretas.`)
    })
}, [proactiveMode, workspaceId])
```

### Total scope:
- 0 new files
- 7 files modified
- No DB migrations needed (canceled status is just a text value)
- No new packages
- All backward compatible
