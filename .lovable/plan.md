
## Full System Audit — Current Status & Improvement Plan

### System Status (Confirmed from DB)
The system IS working right now. Last messages at 11:19 today. Notes, tasks, and finances are all being recorded correctly. The bot name is "ZYNTRA", TTS is disabled, and the Evolution API integration is active.

### Critical Issues Found

**1. Duplicate financial notes** — "Gasto com Almoço" appears 4 times on the same day, "Gasto com Lanche" twice. The idempotency check only works for `provider_message_id`, but if the user sends the same message twice in natural language, it creates duplicate notes. Need smart deduplication.

**2. `tasks` status `in_progress` vs `doing`** — The DB schema has `'todo' | 'doing' | 'done'` but the AI tools use `'in_progress'` in `update_task_status`. This means "mark as in_progress" always fails silently. Critical bug.

**3. Context too narrow (only 8 recent notes, 8 tasks)** — System prompt shows last 8 notes but doesn't include the full search capability. The AI is missing important context about existing items, causing it to create duplicates instead of finding existing ones.

**4. No `update_note` tool** — User can't edit or correct notes via WhatsApp. Has to delete and recreate.

**5. No contact update tool** — When the user mentions someone's name or adds information about a contact, it's not auto-saved to the contacts table.

**6. Financial notes with category "Finanças" vs "Financeiro"** — Some notes are categorized "Finanças" (from the original AI) but the financial detection uses "Financeiro". The `normalizeFinancialCategory` function handles this but the AI is creating inconsistencies.

**7. `list_tasks` queries `in_progress` but DB has `doing`** — Another status mismatch causing empty lists when tasks exist.

**8. No `create_contact` / `update_contact` tool** — Bot can't save new people to contacts.

**9. `pending_tasks` query uses `in_progress` but DB has `doing`** — Line 213: `.in('status', ['todo', 'in_progress'])` — this returns 0 doing tasks in context.

**10. `weekly_summary` makes N+1 queries** — fetches each financial note individually inside a loop. For 20 notes that's 20 extra DB calls.

### AI Intelligence Upgrades

New tools to add:
- `update_note` — edit existing note by title
- `create_contact` — save new person to contacts table  
- `delete_task` — remove a task by title
- `productivity_insight` — AI-generated analysis of the user's week patterns
- `set_task_priority` — change priority of existing task

System prompt improvements:
- Add today's date in `dd/MM/yyyy` format explicitly (current uses long format that confuses the AI on dates)
- Add explicit instruction: before creating a note, check if a similar one exists today (deduplication hint)
- Use `google/gemini-2.5-pro` as primary model (smarter, handles tool calling better) with `gemini-3-flash-preview` as fast fallback for simple queries
- Upgrade model selection logic: use pro model for complex requests (audio, financial summaries, weekly reports) and flash for simple confirmations

### Files to change

```
MOD  supabase/functions/process-message/index.ts
  1. FIX: Change all 'in_progress' → 'doing' to match actual DB schema 
     (affects: pendingTasks query line 212, update_task_status handler, list_tasks tool)
  2. FIX: N+1 query in weekly_summary — fetch all note contents in one query
  3. ADD tool: update_note (find by title, update content/category)
  4. ADD tool: delete_task (find task by title, delete it)
  5. ADD tool: create_contact (save person to contacts table)
  6. ADD tool: set_task_priority (change priority of existing task)
  7. IMPROVE: Smart deduplication hint in system prompt — instruct AI to check 
     recentNotes before creating a new note with identical title
  8. IMPROVE: Model selection — use gemini-2.5-pro for complex requests (audio, 
     summaries) and gemini-3-flash-preview for quick text replies
  9. IMPROVE: Category normalization — always use "Financeiro" (never "Finanças")
     enforce in create_note handler
  10. IMPROVE: System prompt — add explicit "today's date in dd/MM/yyyy" + 
      stronger deduplication instructions
  11. FIX: `pending_tasks` context query uses wrong status 'in_progress' — fix to ['todo', 'doing']
  12. IMPROVE: Add `doing` tasks to context (currently they're invisible to AI)
```

### DB Note
No migrations needed. All fixes are pure logic changes in the edge function.

### Impact Summary
```text
Bug fixes (high priority):
  - 'in_progress' → 'doing' everywhere: fixes update task, list tasks, context
  - N+1 weekly_summary query: reduces DB calls from ~20 to 1
  - Category always 'Financeiro': eliminates mixed categorization

New capabilities:
  - update_note: edit existing notes without delete+recreate
  - delete_task: remove completed/wrong tasks
  - create_contact: save people to contacts from chat
  - set_task_priority: promote/demote task priority

AI Intelligence:
  - Smarter model routing (pro for complex, flash for simple)
  - Deduplication awareness in system prompt
  - Richer context with 'doing' tasks visible
```
