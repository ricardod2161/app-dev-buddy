
## Honest assessment

The codebase is a **working, feature-complete app**. The refactoring request is massive (full feature-folder migration) but the goal is real: files are too large (AIChat 1234 lines, Dashboard 636 lines), logic is mixed with UI, and the AI Chat sidebar doesn't work well on mobile.

### What I will actually build (high-value, low-risk)

**The golden rule**: do NOT break what works. Extract, don't rewrite.

---

## Sprint 1 — App Bootstrap & Route Config

**`src/app/providers/AppProviders.tsx`** (NEW)
Consolidate QueryClient, ThemeProvider, AuthProvider, TooltipProvider, Sonner into one composable provider. `App.tsx` becomes clean shell.

**`src/app/router/route-config.ts`** (NEW)
Central route config array `{ path, title, element, errorTitle }`. Sidebar and TopBar both read from it — titles stop being hardcoded in TopBar's `pageTitles` object.

**`src/App.tsx`** (MOD — simplified, reads from route-config)

---

## Sprint 2 — Dashboard decomposition

Extract Dashboard's 636 lines into focused pieces:

**`src/features/dashboard/hooks/useDashboardMetrics.ts`** (NEW)
All 5 metric queries (notes, tasks, reminders, messages, spend) + AI metrics in one hook. Returns `{ metrics, loading }`.

**`src/features/dashboard/hooks/useDashboardCharts.ts`** (NEW)
Notes 7-day chart + tasks-by-status queries.

**`src/features/dashboard/hooks/useDashboardRealtime.ts`** (NEW)
Supabase Realtime channel subscription + query invalidation.

**`src/features/dashboard/components/MetricsGrid.tsx`** (NEW)
Renders the 6 metric cards + AI card.

**`src/features/dashboard/components/ChartsSection.tsx`** (NEW)
LineChart + BarChart cards side by side.

**`src/features/dashboard/components/RecentActivity.tsx`** (NEW)
Recent notes list + recent tasks list in grid.

**`src/pages/app/Dashboard.tsx`** (MOD — becomes ~80 lines, composes the above)

---

## Sprint 3 — AI Chat decomposition (biggest gain)

Extract AIChat's 1234 lines into:

**`src/features/ai-chat/lib/parse-actions.ts`** (NEW)
`parseActionsFromText()` function extracted.

**`src/features/ai-chat/lib/stream-chat.ts`** (NEW)
`streamAIChat()` function extracted.

**`src/features/ai-chat/lib/export-markdown.ts`** (NEW)
`exportConversationMD()` function extracted.

**`src/features/ai-chat/services/action-executor.ts`** (NEW)
`executeActions()` with Supabase inserts for task/note/reminder. Cleanly separated from UI.

**`src/features/ai-chat/components/MarkdownRenderer.tsx`** (NEW)
The `renderContent()` function becomes a standalone component. Accepts `content: string`, renders headings/code/lists/blockquotes.

**`src/features/ai-chat/components/MessageBubble.tsx`** (NEW)
`MessageBubble` component extracted. Uses MarkdownRenderer internally. Contains CopyButton, TTSButton, ActionBadge.

**`src/features/ai-chat/components/ConversationSidebar.tsx`** (NEW)
Left panel: conversation list, search input, proactive mode toggle, new chat button. Receives props from parent.

**`src/features/ai-chat/components/ChatComposer.tsx`** (NEW)
Bottom input: Textarea + mic button + send/stop button + disclaimer text.

**`src/features/ai-chat/hooks/useAIChat.ts`** (NEW)
All chat state: `input`, `isStreaming`, `chatMessages`, `handleSend`, `handleRegenerate`, `handleStop`, `handleExportMD`. Uses stream-chat lib and action-executor service.

**`src/features/ai-chat/hooks/useVoiceInput.ts`** (NEW)
`toggleListening`, `isListening` state, Web Speech API setup/teardown.

**`src/features/ai-chat/hooks/useProactiveMode.ts`** (NEW)
`proactiveMode` state (persisted in localStorage), `sessionStorage` guard, Supabase query + auto-trigger logic.

**`src/pages/app/AIChat.tsx`** (MOD — becomes ~120 lines, composes everything)

---

## Sprint 4 — Mobile responsiveness for AI Chat

The AI Chat sidebar (conversation list) is invisible on mobile (`w-0`). Fix:

**`src/features/ai-chat/components/ConversationSidebar.tsx`** — on mobile, sidebar becomes a `Sheet` (bottom drawer) triggered by a button. Desktop keeps existing panel behavior.

**`src/pages/app/AIChat.tsx`** — on mobile: `sidebarOpen` state drives a Sheet instead of a side panel. Chat area is full-width on mobile.

Dashboard grid: already has `grid-cols-2` responsive. Add `grid-cols-1 sm:grid-cols-2 xl:grid-cols-6` for better mobile stacking.

---

## What I will NOT do

- Full feature folder for all 11 pages — risk of broken imports with no visible benefit
- Notion slash commands, PWA, Framer Motion — not requested functionality
- New DB tables for "personal memory" — requires design decisions + migrations
- Rewrite auth context, Supabase client — auto-generated / working fine
- Move `shared/`, `types/`, `hooks/` root folders — working, no gain

---

## Files summary

```
NEW  src/app/providers/AppProviders.tsx
NEW  src/app/router/route-config.ts
MOD  src/App.tsx

NEW  src/features/dashboard/hooks/useDashboardMetrics.ts
NEW  src/features/dashboard/hooks/useDashboardCharts.ts
NEW  src/features/dashboard/hooks/useDashboardRealtime.ts
NEW  src/features/dashboard/components/MetricsGrid.tsx
NEW  src/features/dashboard/components/ChartsSection.tsx
NEW  src/features/dashboard/components/RecentActivity.tsx
MOD  src/pages/app/Dashboard.tsx  (636 → ~80 lines)

NEW  src/features/ai-chat/lib/parse-actions.ts
NEW  src/features/ai-chat/lib/stream-chat.ts
NEW  src/features/ai-chat/lib/export-markdown.ts
NEW  src/features/ai-chat/services/action-executor.ts
NEW  src/features/ai-chat/components/MarkdownRenderer.tsx
NEW  src/features/ai-chat/components/MessageBubble.tsx
NEW  src/features/ai-chat/components/ConversationSidebar.tsx
NEW  src/features/ai-chat/components/ChatComposer.tsx
NEW  src/features/ai-chat/hooks/useAIChat.ts
NEW  src/features/ai-chat/hooks/useVoiceInput.ts
NEW  src/features/ai-chat/hooks/useProactiveMode.ts
MOD  src/pages/app/AIChat.tsx  (1234 → ~120 lines)
```

**Total: 18 new files, 3 modified. No DB migrations. No new packages.**

Every new file is an extraction of existing, working code — not a rewrite. The app continues to function identically while becoming dramatically more maintainable.
