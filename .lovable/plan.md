
## Reality check on the request

The user wants to "transform the app into the most complete and intelligent productivity app in Brazil." This is an extremely broad prompt asking for dozens of features simultaneously. I need to be honest about what's realistic to implement in one pass without breaking the existing production system.

**What's already working well:**
- App.tsx, main.tsx, all Providers — fully correct
- AuthContext — intentional timeouts for DB trigger race conditions, must not touch
- All 11 pages — functional
- ErrorBoundary — already wrapping all routes
- Sidebar with groups — already done
- Tasks Kanban with dnd-kit — already 3 columns
- Notes with TipTap — already rich editor
- Real-time conversations via Supabase
- AI logs panel with metrics
- process-message edge function with Flash/Pro routing

**What I'll actually build** (high-impact, realistic, safe):

### 1. AI Chat Module — `/app/ai-chat` (NEW PAGE — the crown jewel)
A dedicated AI chat page with the Lovable AI Gateway that:
- Premium chat UI (Claude/ChatGPT-style bubbles with copy button, timestamp)
- Streams responses token-by-token via SSE
- Model selector (Flash / Pro / GPT-5 Mini) visible in UI
- Auto-pulls context: fetches last 5 notes + 5 open tasks + workspace name to inject into system prompt
- Suggests 3 contextual prompts on load based on pending tasks/notes
- "Deep Think" toggle: when ON, uses gemini-2.5-pro and adds chain-of-thought prefix to system prompt
- Conversation persisted in Supabase `ai_conversations` + `ai_messages` tables for history
- Copy message, clear chat, export as Markdown buttons
- Add new edge function `supabase/functions/ai-chat/index.ts`
- Requires DB migration for 2 new tables

### 2. Command Palette — `src/components/CommandPalette.tsx` (NEW)
- Global Cmd/K using the `cmdk` package (already installed)
- Navigate to any page, search notes/tasks by title
- Keyboard shortcut registered in App.tsx

### 3. Conversations page — real-time upgrade
- Add Supabase Realtime subscription for new messages in the active conversation
- Auto-scroll to bottom when new messages arrive
- This completes the "real-time" feature already described in project memory

### 4. AppSidebar — add AI Chat link
- Add the new `/app/ai-chat` route as a highlighted item ("IA" with sparkle icon) in the "Principal" group

### 5. TopBar — add Command Palette trigger button
- Add a `Search` button (Cmd+K shortcut hint) in the TopBar

### What I will NOT do (scope management):
- Full Notion-style slash commands — would require 500+ lines of complex TipTap extensions
- Calendar view for reminders — not enough existing schema support
- PWA manifest — minor, separate concern
- Framer Motion — adds dependency, existing CSS animations are good
- Kanban 4th column — Tasks already has 3 columns with full dnd-kit, a 4th "canceled" column has no schema support
- Feature folder migration — high risk, zero user-visible benefit
- Command Palette searching DB records — requires careful async search with debounce (will do navigation only)

---

## Detailed Implementation Plan

### DB Migration
```sql
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nova Conversa',
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can CRUD ai_conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can CRUD ai_messages"
  ON public.ai_messages FOR ALL TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
```

### Edge Function: `supabase/functions/ai-chat/index.ts`
- Receives: `{ messages, model, workspace_id, include_context }`
- When `include_context=true`: fetches last 5 notes + 5 open tasks + workspace settings from Supabase using service role key
- Builds system prompt with: personality, context, today's date, workspace name
- When `deep_think=true` (passed as model="google/gemini-2.5-pro"): prefixes system with chain-of-thought instructions
- Calls Lovable AI Gateway with streaming=true
- Returns SSE stream directly

### New Page: `src/pages/app/AIChat.tsx`
- Left sidebar (250px): conversation list with dates, New Chat button, delete
- Right main area: message stream + input
- Header: model selector dropdown (Flash / Flash Preview / Pro), Deep Think toggle, Clear, Export MD
- Context banner: shows when workspace context is loaded ("Contexto carregado: 5 notas, 3 tarefas")
- Suggested prompts: shown on empty chat — dynamically built from tasks titles
- Streaming: token-by-token using `useRef` + `ReadableStream` reader
- Copy individual messages, regenerate last response

### File: `src/components/CommandPalette.tsx`
- Uses `cmdk` Dialog pattern (already in ui/command.tsx)
- Groups: Navigation (all 12 routes with icons), Recent (last 3 notes from useQuery cache)
- Opens on `Cmd/Ctrl+K` via `useEffect` in App.tsx
- State: `commandOpen` lifted up with a small context or simple prop

### Route additions
- `src/App.tsx`: add `/app/ai-chat` route
- `src/components/AppSidebar.tsx`: add AI Chat entry with `Sparkles` icon at top of Principal group
- `src/components/TopBar.tsx`: add search button that opens palette
- `src/types/database.ts`: add `AIConversation`, `AIMessage` types

### Files to create/modify:
```
NEW  supabase/migrations/YYYYMMDD_ai_chat_tables.sql
NEW  supabase/functions/ai-chat/index.ts
NEW  src/pages/app/AIChat.tsx
NEW  src/components/CommandPalette.tsx
MOD  src/App.tsx                — add /app/ai-chat route + CommandPalette
MOD  src/components/AppSidebar.tsx — add AI Chat nav item (Sparkles icon)
MOD  src/components/TopBar.tsx  — add Cmd+K button
MOD  src/types/database.ts      — add AIConversation, AIMessage types
MOD  src/pages/app/Conversations.tsx — add Supabase Realtime subscription
```

Total: 4 new files, 5 modified files. All safe, isolated, no breaking changes.
