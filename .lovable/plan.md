# SaaS: Assistente WhatsApp – Anotações & Relatórios

This is a large, multi-phase SaaS application. Given Lovable's React + Vite + TypeScript + Supabase stack, we'll build this in structured layers. Below is the full execution plan.

---

## Phase 0 — Infrastructure & Auth

**0.1 — Supabase Connection**

- Connect Supabase (Lovable Cloud backend)
- Run all schema migrations (all 16 tables + indexes)
- Enable RLS on every table

**0.2 — Supabase Auth setup**

- Configure email/password auth
- Wire `onAuthStateChange` listener in an `AuthProvider` context

**0.3 — Seed data**

- Run seed after schema: 1 workspace, 1 admin user, mock conversations, notes, tasks, etc.

---

## Phase 1 — Routing & Layout Shell

**New packages to install:**

- `@dnd-kit/core` + `@dnd-kit/sortable` — Kanban drag-and-drop
- `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder` — rich text editor
- `chrono-node` — natural language date parsing
- `react-syntax-highlighter` — JSON payload highlight in logs drawer

**New files:**

```
src/
  contexts/
    AuthContext.tsx         ← session state, user, workspace
    ThemeContext.tsx         ← dark/light toggle persisted to localStorage
  layouts/
    AppLayout.tsx            ← sidebar + topbar (dark mode toggle, user menu)
    AuthLayout.tsx           ← centered card layout for login/register
  components/
    Sidebar.tsx
    TopBar.tsx
    ThemeToggle.tsx
```

**Routes in App.tsx:**

```
/auth/login
/auth/register
/app              → Dashboard
/app/notes
/app/tasks
/app/reports
/app/conversations
/app/integrations
/app/whitelist
/app/settings
/app/logs
```

Protected routes redirect to `/auth/login` if no session.

---

## Phase 2 — Database Migrations

Single migration file covering all tables:

```
users, workspaces, workspace_members,
integrations, whitelist_numbers,
conversations, messages,
notes, attachments,
tasks, reminders, reports,
webhook_logs, processed_webhook_events,
workspace_settings
```

All with RLS enabled. All required indexes created. Policies scope every read/write to `workspace_id` via the user's `workspace_members` membership.

---

## Phase 3 — Auth Pages

`**/auth/login**`

- `react-hook-form` + `zod` (email, password)
- Calls `supabase.auth.signInWithPassword()`
- Redirects to `/app` on success

`**/auth/register**`

- Fields: name, email, password, workspace name
- Creates user via `supabase.auth.signUp()`
- Inserts into `users`, `workspaces`, `workspace_members` (role=admin), `workspace_settings`

---

## Phase 4 — Dashboard `/app`

- 4 metric cards (notes today, pending tasks, reminders next 24h, messages today)
- `LineChart` (recharts): notes per day last 7 days
- `BarChart` (recharts): tasks by status

---

## Phase 5 — Notes `/app/notes`

- Table with title, category, tags (chips), project, date
- Filters: date range, tag multi-select, project, category
- TipTap editor in modal (bold, italic, list, inline code)
- "Transform to task" button → pre-filled task modal
- CRUD + delete confirmation dialog

---

## Phase 6 — Tasks `/app/tasks`

- Toggle: List view ↔ Kanban
- Kanban: 3 columns (Todo / Doing / Done) with `@dnd-kit` drag-and-drop
- Status update on card drop → saves to Supabase
- Priority badge: red/yellow/green
- Visual highlight for overdue tasks (`due_at < now()`)
- Filters: priority, project, tag, due date window

---

## Phase 7 — Reports `/app/reports`

- Form: type selector + optional date range picker
- "Gerar Relatório" → calls Edge Function `generate-report`
- Displays formatted report card using the fixed template
- Paginated history table
- "Exportar .txt" button (client-side blob download)

---

## Phase 8 — Conversations `/app/conversations`

- Two-panel layout: contacts list (left) + chat bubbles (right)
- IN = gray left bubble / OUT = blue right bubble
- Full-text search on message body
- Type badge: text, audio, image, file

---

## Phase 9 — Integrations `/app/integrations`

- Tabs: EVOLUTION | CLOUD
- Form fields per provider
- "Testar conexão" → calls `send-whatsapp` edge function with test message
- "Simular webhook" → modal with editable JSON payload + "Disparar" button
- Active/inactive status badge

---

## Phase 10 — Whitelist `/app/whitelist`

- Table with E.164 number, label, status, date
- Validation: must match `+55XXXXXXXXXXX` pattern
- Inline toggle active/inactive
- Duplicate detection on add

---

## Phase 11 — Settings `/app/settings`

- Default categories: add/remove chip list
- Default tags: chip editor
- Bot response format: radio (short/medium/detailed)
- Timezone: `<select>` from `Intl.supportedValuesOf('timeZone')`
- Language: pt-BR / en-US

---

## Phase 12 — Logs `/app/logs`

- Table: timestamp, provider, event_type, status badge, error summary
- Filters: provider, status, date range
- Row click → side drawer with JSON payload (syntax highlighted)
- Offset-based pagination, 50 per page

---

## Phase 13 — Edge Functions

`**webhook-whatsapp**` (POST)

- 10-step flow: log → signature validation → idempotency check → rate limit → save conversation/messages → whitelist check → command parser → send reply → save OUT message → update log

`**send-whatsapp**` (POST)

- Resolve active integration → decrypt api_key → route to EVOLUTION or CLOUD → save OUT message

`**process-reminders**` (POST, cron every minute)

- Fetch due reminders → call `send-whatsapp` per reminder → update status

`**generate-report**` (POST)

- Aggregate notes, tasks, reminders for period → render fixed template → save to `reports`

---

## Phase 14 — Dark Mode

- `ThemeContext` reads/writes `localStorage.theme`
- Adds/removes `dark` class on `<html>`
- `ThemeToggle` button in TopBar

---

## Supabase Types

Generate typed client via `supabase gen types typescript` pattern, stored in `src/integrations/supabase/types.ts`.

---

## File Count Estimate

~60 new files across pages, components, contexts, layouts, hooks, edge functions, and migrations.

---

## Execution Order (approved → implement)

1. Install new packages
2. Run DB migration
3. Supabase Auth + contexts
4. Layout shell + routing
5. Auth pages
6. Dashboard
7. Notes → Tasks → Reports → Conversations → Integrations → Whitelist → Settings → Logs
8. Edge Functions (webhook, send, reminders, report)
9. Seed data
10. Dark mode toggle

**This plan requires connecting a Supabase project first before any code can be written.** Once approved, implementation begins with the Supabase connection prompt. faça tudo em português e deixar tambem a opção para que funcione no telegram.