
## Assessment: What actually needs to be done

The codebase is already well-built — it has working auth, Supabase integration, all pages, proper TypeScript, Zod forms, TanStack Query, dark/light theme, and a good sidebar. The user's prompt is a generic "refactor everything" request, but applying it blindly would break a working production system.

**What is already correct (do NOT change):**
- App.tsx and main.tsx are complete and working
- AuthContext is functional (the setTimeout is intentional to handle DB trigger race conditions)
- All 11 pages exist and work
- Type safety is already good
- shadcn/ui + Tailwind design is already clean
- RLS policies, edge functions, and Supabase integration are production-ready

**What can realistically be improved without breaking things:**

### 1. `package.json` — metadata update
- Change `name` to `"whatsapp-assistant"` (reflects actual product)
- Add `description` and `author`

### 2. `README.md` — complete rewrite
- Modern README with features, stack, setup guide, architecture overview

### 3. `.env.example` — create new file
- Add example env vars so other developers know what's needed
- `.gitignore` already ignores `.env`

### 4. `src/App.tsx` — add ErrorBoundary
- Wrap each route's page component in a per-route ErrorBoundary class component
- This prevents one broken page from crashing the entire app
- No architecture changes needed

### 5. `src/pages/app/Dashboard.tsx` — add response time chart
- Add a small "Tempo de Resposta IA" card using the new `webhook_logs` data (ai_model, response_ms)
- Uses the same pattern as existing Recharts charts already in the page

### 6. `src/components/AppSidebar.tsx` — visual grouping
- Add visual section separators between groups: Core (Dashboard, Notes, Tasks, Reminders), Reports/Conversations, and Settings/Admin
- Small cosmetic improvement, no structural change

### 7. `src/index.css` — add missing animations
- Add `animate-slide-up` keyframe (used in several pages but may be missing from CSS)
- Verify `animate-fade-in` exists

### Files to change:
```
MOD  package.json              — name, description, author
NEW  README.md                 — complete rewrite
NEW  .env.example              — document required env vars
MOD  src/App.tsx               — add ErrorBoundary wrapping routes
NEW  src/components/ErrorBoundary.tsx  — class component ErrorBoundary
MOD  src/components/AppSidebar.tsx     — add section separators
MOD  src/pages/app/Dashboard.tsx       — add AI response time mini-card using webhook_logs
```

### What I will NOT do (would break production):
- Migrate to feature-folder structure — would require updating dozens of imports across all files, very high risk, no functional benefit
- Remove AuthContext setTimeout — it's there intentionally to handle DB trigger race conditions on signup
- Move Supabase client — it's already correctly at `@/integrations/supabase/client` (auto-generated)
- Add Husky/lint-staged — not supported in Lovable environment
- Add React Query Devtools — minor, and already works fine without it
- "Kanban preparado para crescer" — Tasks already has full dnd-kit Kanban with 3 columns

### Scope summary
This is a focused, safe set of improvements that elevates the project's professionalism (README, .env.example, error boundaries, sidebar UX, dashboard AI metrics) without touching what already works.
