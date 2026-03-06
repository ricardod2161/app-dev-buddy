
## Root Cause Analysis — Integrações Page Frozen in Skeleton

### The Real Bug
The session replay confirms: page reaches the skeleton state and **never exits**. Three specific causes compound together:

1. **`isLoading` race with `workspaceId`**: The guard `authLoading || !workspaceId || isLoading` is too broad. When `workspaceId` is null, `enabled: !!workspaceId` keeps the query in `isLoading=false` state but the `!workspaceId` clause blocks forever if workspace doesn't load. The database confirms: **zero workspace_members rows** — meaning this is a fresh account with no workspace, so `workspaceId` stays `null` and the page is permanently stuck in skeleton.

2. **No fallback for `workspaceId === null` after auth loaded**: The code has no path that renders the form when `authLoading=false` but `workspaceId=null` (workspace doesn't exist). Instead of showing a "create workspace" message or the form, it freezes.

3. **RLS SELECT policy on `integrations`** calls `is_workspace_member()` — correct, but if workspace_members table is empty (fresh account not fully onboarded), the query returns empty and isLoading flips — but by then workspaceId may still be null depending on async timing.

### All Issues Found Across the Entire App

**Critical (blocks functionality):**
- `Integrations.tsx` — page freezes in skeleton; form never renders
- `Settings.tsx` — console error: `Select` component given ref via function component — warns in console, may cause UI glitch
- `AuthContext.tsx` — `loadWorkspace` silently fails if no workspace_member row exists; `workspaceId` stays `null` forever with no error state exposed
- `Whitelist.tsx` — phone regex only accepts `+55` Brazil numbers; Telegram contacts (`tg:ID`) fail validation
- `Reports.tsx` — `generate-report` edge function call pattern may fail silently

**UX/Polish issues across pages:**
- All pages: no `workspaceId` guard with user-friendly empty state when workspace not found  
- `Dashboard.tsx` — no link/CTA buttons to navigate to notes/tasks from recent activity items
- `Conversations.tsx` — no "send reply" feature from the conversation view
- `Tasks.tsx` — drag-and-drop works but no visual indicator of current drag position on mobile
- `Reminders.tsx` — natural date parsing only shown as raw ISO string, not human-readable preview
- `Logs.tsx` — `statusConfig` missing `processing`, `ignored`, `duplicate` statuses added by new edge functions
- `TopBar.tsx` — "Meu Perfil" menu item has no route and does nothing

---

## What Will Be Fixed and Improved

### Fix 1 — `AuthContext.tsx`: Expose `workspaceLoading` state
The context needs to differentiate between "auth is loading" and "workspace is loading". Currently both collapse into `loading`. Add `workspaceLoading` boolean.

### Fix 2 — `Integrations.tsx`: Complete rewrite of loading guard
```tsx
// BEFORE (broken)
if (authLoading || !workspaceId || isLoading) { return <skeletons> }

// AFTER (correct)
if (authLoading) { return <skeletons> }          // auth still loading
if (!workspaceId) { return <no-workspace-msg> }  // workspace not found - show message
if (isLoading) { return <skeletons> }            // query loading (workspaceId is set)
// → renders form always
```

### Fix 3 — `Settings.tsx`: Fix Select ref warning
The `Select` inside `SelectContent` is passing ref to function component. Fix by ensuring the `Input` inside SelectContent doesn't receive a stray ref, and wrap the Search div correctly.

### Fix 4 — `Whitelist.tsx`: Allow Telegram format
Change phone regex to accept both `+55XXXXXXXXXXX` AND `tg:XXXXXXXX` formats.

### Fix 5 — `Logs.tsx`: Add missing status configs
Add `processing`, `ignored`, `duplicate` status entries to `statusConfig`.

### Fix 6 — `Reminders.tsx`: Show human-readable parsed date
Display the parsed date as a friendly string (e.g. "amanhã às 10:00") next to the ISO input.

### Fix 7 — `Dashboard.tsx`: Add navigation CTAs on empty states
When no notes/tasks exist, show a direct button to go create one.

### Fix 8 — `TopBar.tsx`: Wire "Meu Perfil" or remove dead link
Remove the dead menu item or navigate to `/app/settings`.

---

## Files to Edit

```text
src/contexts/AuthContext.tsx       ← add workspaceLoading state, expose it
src/pages/app/Integrations.tsx    ← fix loading guard + split authLoading vs workspaceId null
src/pages/app/Settings.tsx        ← fix Select/ref console warning  
src/pages/app/Whitelist.tsx       ← allow tg: format in phone validation
src/pages/app/Logs.tsx            ← add missing status types
src/pages/app/Reminders.tsx       ← show human-readable date preview
src/pages/app/Dashboard.tsx       ← add navigation CTAs on empty states
src/components/TopBar.tsx         ← fix dead "Meu Perfil" link
```
