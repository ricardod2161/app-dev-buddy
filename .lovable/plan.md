
## Honest codebase assessment

### What's already fully implemented (do NOT touch):
- **AIChat.tsx** — 895 lines, complete: streaming SSE, Deep Think, model selector, context injection, conversation persistence, markdown renderer (multi-line code blocks, headings, lists, blockquotes), dynamic prompts from urgent tasks, export MD, regenerate, stop stream, copy button
- **CommandPalette.tsx** — working Cmd+K with all 12 nav items
- **AppSidebar.tsx** — collapsible, 3 groups, tooltips, mobile overlay
- **TopBar.tsx** — Cmd+K trigger, theme toggle, user dropdown
- **Tasks.tsx** — full Kanban with dnd-kit, 3 columns, RHF+Zod modal
- **Reminders.tsx** — RHF+Zod form, chrono-node NLP parsing
- **Dashboard.tsx** — charts, AI metrics card, quick-link to AI Chat
- **Conversations.tsx** — Realtime subscription, last message preview
- Auth, ErrorBoundary on all routes, all 11 pages operational

### Real gaps identified (what would actually add value):

**1. Voice Input in AI Chat (Web Speech API)**
The most impactful "better than Alexa" feature completely missing. Add a microphone button to the chat input that uses `window.SpeechRecognition` to transcribe speech to text and paste into the input field. ~60 lines.

**2. Voice Output / TTS for AI responses**
When AI responds, optionally speak it using `window.speechSynthesis` (browser TTS — no API key needed). Toggle button per-message or global. ~40 lines inside MessageBubble.

**3. AI Autonomous Actions — "ZYNTRA can create tasks/notes from chat"**
The AI responds with text but can't actually CREATE a task or note. Add an action parser: after each AI response, scan for markdown like `**[ACTION: create_task title="X" priority="high"]**` and execute it in the DB. This makes ZYNTRA genuinely autonomous — like telling Alexa to "set a reminder" and it actually does it. Requires: (a) system prompt addition in the edge function to output actions in a parseable format, (b) client-side action executor.

**4. Command Palette — live DB search**
Currently only navigation. Add debounced search for notes and tasks (query on input change) and show results below nav items. This completes the "global search" feature.

**5. Proactive AI suggestions on Dashboard**
Add a "ZYNTRA sugere" widget on the Dashboard that runs a lightweight AI query on mount (using the existing ai-chat edge function) to generate 3 proactive suggestions based on tasks + deadlines. E.g. "Você tem 2 tarefas com prazo amanhã. Quer que eu gere um plano?". Clicking opens AI Chat with that prompt pre-filled.

**6. Keyboard shortcuts throughout the app**
Add a `useKeyboardShortcuts` hook that registers: `N` → new note (on notes page), `T` → new task (on tasks page), `R` → new reminder (on reminders page), `Cmd+Enter` → send message (AI chat, already works), `Escape` → close modals. Register globally in AppLayout.

---

## Implementation plan

### Files to modify/create:

```
MOD  src/pages/app/AIChat.tsx
     — Add microphone button (Web Speech API SpeechRecognition)  
     — Add TTS output toggle per-message (speechSynthesis)
     — Add autonomous action executor (parse [ACTION:...] from AI responses)

MOD  supabase/functions/ai-chat/index.ts
     — Add autonomous actions to system prompt so ZYNTRA can output
       parseable action blocks that the client executes

MOD  src/components/CommandPalette.tsx
     — Add debounced async search for notes + tasks
     — Show search results below nav items when query is typed

MOD  src/pages/app/Dashboard.tsx
     — Add "ZYNTRA sugere" proactive card (3 AI-generated suggestions,
       fetched once per session, click opens AI chat with prompt)

NEW  src/hooks/useKeyboardShortcuts.ts
     — Global keyboard shortcuts hook (N, T, R, Escape)

MOD  src/layouts/AppLayout.tsx
     — Register useKeyboardShortcuts globally

MOD  src/pages/app/Notes.tsx
     — Connect N shortcut to open new note modal

MOD  src/pages/app/Tasks.tsx  
     — Connect T shortcut to open new task modal

MOD  src/pages/app/Reminders.tsx
     — Connect R shortcut to open new reminder modal
```

### What I will NOT do:
- Feature folder migration — zero user-visible benefit, high risk
- Framer Motion — adds a new package, existing CSS transitions are sufficient
- PWA manifest — separate concern, 0 functional benefit to the AI module
- React Query Devtools — dev-only, not visible in production
- Notion slash commands — would require 500+ lines of TipTap extensions
- 4th Kanban column — no schema for "canceled" status
- "Better than Alexa" marketing copy in README — the functionality already surpasses it

### Technical notes:

**Web Speech API (Voice Input)**:
```typescript
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
recognition.lang = 'pt-BR'
recognition.onresult = (e) => setInput(prev => prev + e.results[0][0].transcript)
```
No package, no API key. Works in Chrome/Edge/Safari.

**Browser TTS (Voice Output)**:
```typescript
const speak = (text: string) => {
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'pt-BR'
  window.speechSynthesis.speak(utter)
}
```
No package, no API key.

**Autonomous Actions in System Prompt**:
Add to the `ai-chat` edge function system prompt:
```
When the user asks you to CREATE a task, note, or reminder, 
include at the END of your response a machine-readable block:
[ACTION:create_task|title=...|priority=high|due=2026-03-14]
[ACTION:create_note|title=...|content=...]
[ACTION:create_reminder|message=...|remind_at=2026-03-14T09:00]
```
Client parses and strips these from the displayed text, then executes them via Supabase.

**CommandPalette DB search**:
Use `useQuery` with `enabled: query.length >= 2` and debounce 300ms to search `notes.title` and `tasks.title` using `.ilike('title', '%${q}%')`.

**Dashboard Proactive Card**:
A single non-streaming call to `ai-chat` edge function on mount (once per session via `sessionStorage` flag), passing 3 overdue/urgent tasks and asking for 3 short actionable suggestions.

### Total scope: 
- 2 new small files, 7 files modified
- All backward-compatible, no DB migrations needed
- No new packages required
