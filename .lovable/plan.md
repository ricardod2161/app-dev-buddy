
## Plan: Contacts Page + Financial Fix + Bot Improvements

### Root cause of financial bug
The note "Rapadura e Doce" was created without `category = "Financeiro"` — likely because the AI used a generic category. The `financial_summary` tool only queries `category = 'Financeiro'`. Fix: make the query also find notes containing monetary patterns (R$/reais) in content OR in title, using OR filter.

Also add a fallback in `financial_summary` execution: if notes with `category=Financeiro` return 0 total but there are notes with R$ in content, parse those too.

---

### 1. New `contacts` table (database migration)
A dedicated contacts table allows naming a phone number once, across all conversations:

```sql
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  phone_e164 text NOT NULL,
  name text NOT NULL,
  notes text,
  tags jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, phone_e164)
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
-- RLS: workspace members can CRUD
```

---

### 2. New page: `src/pages/app/Contacts.tsx`
Full CRUD page with:
- **List**: table/card showing phone, name, notes, tags, last seen (from conversations join)
- **Add button**: dialog with phone + name + notes fields
- **Edit**: inline or dialog to rename
- **Delete**: with confirmation
- **Auto-populated**: when a conversation exists for that phone, show last message date
- **Sync button**: populate contacts from existing conversations that have no contact entry yet

---

### 3. Sidebar + Router
Add "Contatos" to `AppSidebar.tsx` nav (using `Users` icon) and route in `App.tsx` at `/app/contacts`.

---

### 4. Bot uses contact name
In `process-message/index.ts`:
- After fetching workspace settings, also fetch the contact name from `contacts` table by `workspace_id + phone_e164`
- If found, inject into system prompt: `"O usuário se chama ${contactName}."`
- Also update `conversations.contact_name` if a contacts entry exists and conversation doesn't have a name yet

---

### 5. Fix financial_summary — dual query strategy
In `financial_summary` execution, change from single category filter to:
```typescript
// Strategy 1: notes tagged as Financeiro
const { data: taggedNotes } = await supabase
  .from('notes').select('...')
  .eq('workspace_id', workspace_id)
  .eq('category', 'Financeiro')
  .gte('created_at', dateFrom.toISOString())

// Strategy 2: notes containing monetary values (not already Financeiro)  
const { data: allNotes } = await supabase
  .from('notes').select('...')
  .eq('workspace_id', workspace_id)
  .gte('created_at', dateFrom.toISOString())
  .or('title.ilike.%reais%,content.ilike.%reais%,title.ilike.%R$%,content.ilike.%R$%')

// Merge, deduplicate, parse values
```

Also improve `create_note` auto-detection: when the raw user message contains financial content, force `category = 'Financeiro'` even if AI didn't set it.

---

### 6. Dashboard: Gastos de Hoje widget
Add a 5th metric card showing today's financial total (sum of financial notes created today). Uses the same pattern as the financial_summary query.

---

### 7. Webhook: auto-populate contact_name on conversation
In `webhook-whatsapp/index.ts`: when upserting/creating conversation, also check if a `contacts` entry exists for that phone and, if so, set `contact_name` automatically.

---

### Files to create/modify

```
NEW  src/pages/app/Contacts.tsx
MOD  src/App.tsx                          ← add /app/contacts route
MOD  src/components/AppSidebar.tsx        ← add Contacts nav item
MOD  supabase/functions/process-message/index.ts  ← contact name injection + financial fix
MOD  supabase/functions/webhook-whatsapp/index.ts ← auto-set contact_name from contacts table
MOD  src/pages/app/Dashboard.tsx         ← add financial spend widget
MOD  src/types/database.ts               ← add Contact type
NEW  supabase/migrations/...sql          ← create contacts table with RLS
```

### No breaking changes
All existing conversations still work. The contacts table augments without replacing anything.
