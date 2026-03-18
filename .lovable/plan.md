
## Root Cause Analysis

**Build error**: `Error: Failed to load native binding` from `@swc/core/binding.js`

`vite.config.ts` uses `@vitejs/plugin-react-swc`, which depends on `@swc/core` — a Rust-compiled native binary. The Lovable sandbox build environment lacks the correct binary platform target for `@swc/core`, causing the build to fail entirely. This is unrelated to any recent code change — it's a compatibility issue between the SWC native binary and the sandbox OS/architecture.

**Fix**: Replace `@vitejs/plugin-react-swc` with `@vitejs/plugin-react` (Babel-based, pure JS, no native binaries). Both produce identical React output.

**Secondary request**: User also wants to expand `hasFinancialContent` in `process-message/index.ts` to recognize more Portuguese financial keywords (`registre`, `marque`, `despesa`, `despesas`, `gasto de`, `despesa de`), and update the `/ajuda` help text to show these new commands.

---

## Files to modify

**1. `vite.config.ts`** — swap SWC plugin import for Babel plugin
```
- import react from "@vitejs/plugin-react-swc"
+ import react from "@vitejs/plugin-react"
```

**2. `vitest.config.ts`** — same swap (vitest also uses it)
```
- import react from "@vitejs/plugin-react-swc"
+ import react from "@vitejs/plugin-react"
```

**3. `package.json`** — replace dev dependency
```
- "@vitejs/plugin-react-swc": "^3.11.0"
+ "@vitejs/plugin-react": "^4.3.4"
```

**4. `supabase/functions/process-message/index.ts`** — two small changes:

**A) Line 59-61** — expand `hasFinancialContent` regex to add missing keywords:
```typescript
// Before:
/R\$|reais|real|\d+\s*(reais|real)|gastei|comprei|paguei|custou|vale\s+\d|valeu\s+\d|gasto\s+de|compra\s+de|me\s+cobrou|quanto\s+fica/i

// After (adds: registre, marque, despesa, despesas, gasto de, despesa de):
/R\$|reais|real|\d+\s*(reais|real)|gastei|comprei|paguei|custou|vale\s+\d|valeu\s+\d|gasto\s+de|compra\s+de|me\s+cobrou|quanto\s+fica|registre|marque|despesa|despesas|despesa\s+de/i
```

**B) Lines 141-143** — update the FINANÇAS help section in `/ajuda` command to show new commands:
```
• "Registre X reais" ou "marque despesa de X" → registra automaticamente
• "Gastei R$X de [item]" → registra gasto  
• "Gastos de hoje" / "do mês" → relatório financeiro
```

---

## Summary

```
MOD  vite.config.ts          — @vitejs/plugin-react-swc → @vitejs/plugin-react
MOD  vitest.config.ts        — same swap
MOD  package.json            — replace dev dep (no new packages, same API surface)
MOD  supabase/functions/process-message/index.ts
       — hasFinancialContent: add 6 new keywords
       — /ajuda help text: show new financial command examples
```

No DB changes. No new packages beyond the build tool swap. The `@vitejs/plugin-react` package is the original stable plugin — same transform output, just uses Babel instead of SWC native binary.
