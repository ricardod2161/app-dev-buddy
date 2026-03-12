
## Deep audit of the full system

### What's already excellent (don't touch):
- Auth flow, RLS policies, workspace model — production-ready
- Tasks Kanban with dnd-kit — 3 columns, drag & drop working
- Notes with TipTap inline editing — already solid
- AI Chat ZYNTRA — streaming, Deep Think, context injection, persistence
- Conversations with Realtime subscription — already done
- Dashboard with charts, AI metrics card — complete
- Command Palette Cmd+K — working
- All 11 pages operational

### Real gaps identified in the audit:

**1. AIChat.tsx — markdown is hand-rolled and broken**
The `renderContent()` function is a brittle regex parser. It doesn't handle nested markdown, code blocks with multiple lines, or proper `#/##` headings. AI responses with tables, code blocks (```js ... ```), or complex formatting look broken. Need to replace with proper markdown rendering using `react-markdown` + `remark-gfm` (already safe to add as new packages aren't needed — but since we don't have react-markdown, we can significantly improve the hand-rolled parser to properly handle fenced code blocks and heading levels).

Actually — looking more carefully, `react-markdown` is not installed. We can greatly improve the custom renderer within AIChat.tsx to properly handle:
- Multi-line fenced code blocks (```lang ... ```)  
- Headings `# H1`, `## H2`, `### H3`
- Horizontal rules `---`
- Numbered lists `1. 2. 3.`
- Blockquotes `>`

**2. AIChat.tsx — suggested prompts are always static**
They never change based on actual tasks. The `SUGGESTED_PROMPTS` constant is hardcoded. Should load the 3 most urgent pending tasks and build dynamic prompts from them.

**3. AIChat.tsx — missing title auto-update**
Conversations are titled with the first 50 chars of user's first message. Good. But after a few back-and-forths, a smarter title (based on topic) would be better. Minor polish.

**4. Notes.tsx — Create modal still uses old state pattern (not RHF+Zod)**
The "create new note" dialog uses raw useState. Should use RHF + Zod like Contacts.tsx.

**5. Tasks.tsx — TaskModal uses raw useState (not RHF+Zod)**
The modal doesn't use react-hook-form + zod. Missing validation feedback and inconsistent with Contacts.tsx pattern.

**6. Reminders.tsx — form uses raw useState (not RHF+Zod)**
No validation library. Inconsistent with the development standards in project memory.

**7. Reports.tsx — export only as .txt**
Reports can be exported as plain text. Should export as Markdown too (the content is already in text/markdown format from generate-report edge function).

**8. Conversations.tsx — no message count badge**
The conversation list doesn't show an unread/message count badge. Minor polish.

**9. Dashboard.tsx — no "IA em uso" quick link**
There's an AI metrics card but no quick action button to go to the AI Chat.

**10. Settings.tsx — no save confirmation / unsaved changes warning**
If user edits and navigates away, changes are lost with no warning.

**11. AIChat.tsx — no `react-markdown`; manual markdown broken for code blocks**
The biggest actual UX bug. A multi-line code block like:
```
```python
def foo():
    return 1
```
```
...renders as several disconnected `<div>` elements because lines are processed individually. The code block state is never tracked across lines.

**12. Missing: keyboard shortcut `N` for New Note, `T` for New Task**
The Command Palette exists but lacks quick-create shortcuts.

**13. Dashboard.tsx — 9 queries on mount**
All 9 queries fire independently. Should be batched where possible. Minor performance issue.

**14. process-message edge function — no module-level integration cache**
Every message triggers a fresh DB query for integration data. Cache miss ~100-200ms per message. Already in project memory as a known improvement.

---

## Plan: what to actually build

### Priority 1 — Fix the biggest UX bug: AIChat markdown rendering
Rewrite `renderContent()` in AIChat.tsx to be a proper multi-pass parser:
- Track `inCodeBlock` state across lines with language detection
- Render fenced code blocks as `<pre><code>` with language badge
- Ordered lists (tracking consecutive `1.`, `2.` lines)
- Blockquotes `>`
- Proper H1/H2/H3 with correct sizing
- Horizontal rules

### Priority 2 — Dynamic suggested prompts from real tasks
In the empty chat state, load top 3 `todo/doing` tasks with `due_at` set and build contextual prompts:
- "Preciso de ajuda para concluir: [task title]"
- "Me explica como priorizar: [task1], [task2], [task3]"
etc.

### Priority 3 — Tasks modal → RHF + Zod
Replace the raw useState TaskModal with `react-hook-form` + `zod` validation. Consistent with project standards. 

### Priority 4 — Reminders form → RHF + Zod
Replace raw useState in create reminder dialog with proper form validation. Required by project memory constraints.

### Priority 5 — Reports: add Markdown export option
Add a "Exportar .md" button alongside the existing .txt export. 3-line change.

### Priority 6 — Dashboard: add quick-action link on AI card
Add a small "Abrir Chat IA →" button/link on the "IA Hoje" card. Very fast, high value.

### Priority 7 — process-message: integration module cache
Add a module-level `Map<string, {data: Integration, ts: number}>` cache with 5-minute TTL. Saves ~100-200ms per WhatsApp/Telegram message by skipping a DB round-trip.

### Priority 8 — Conversations: message count in conversation list
Add `messages_count` to the conversation list by using a `.select('id, count', { count: 'exact' })` or just show the last message preview text instead of just the phone number.

---

## Files to change

```
MOD  src/pages/app/AIChat.tsx         — fix markdown renderer + dynamic prompts
MOD  src/pages/app/Tasks.tsx          — RHF+Zod in TaskModal
MOD  src/pages/app/Reminders.tsx      — RHF+Zod in create dialog
MOD  src/pages/app/Reports.tsx        — add .md export option  
MOD  src/pages/app/Dashboard.tsx      — add quick link on AI card
MOD  src/pages/app/Conversations.tsx  — show last message text in conversation list
MOD  supabase/functions/process-message/index.ts — integration cache
```

Total: 7 files modified, all safe, high-impact improvements. No new tables, no new edge functions.

### What I will NOT do:
- Add react-markdown package — not needed if we fix the parser properly
- Migrate to feature folders — pure risk, zero visible benefit
- Touch AuthContext — intentional timeout for race condition
- Touch supabase client — auto-generated
- Add new DB tables — not needed for these improvements
