

## Estado atual do repositório

Sprint 1 (providers, route-config) ✅ — já existe
Sprint 2 (Dashboard decomposição) ✅ — já existe em `src/features/dashboard/`
Sprint 3 base (ai-chat components/hooks/lib/services) ✅ — já existe em `src/features/ai-chat/`
`user_memory` table ✅ — migration já aplicada, Settings já tem card de memória financeira

**O que ainda não existe e o usuário pediu agora:**

1. `src/features/finance/` — feature completa de finanças pessoais
2. `src/features/ai-chat/finance-actions/` — parsers e executor dedicados às ações financeiras
3. Rota `/app/finance` + entrada na sidebar
4. Extração do hook `useAIChat` (lógica de estado/streaming ainda inline em `AIChat.tsx`)

---

## O que será construído

### 1. Feature `finance/` completa

```
src/features/finance/
  types/
    transaction.types.ts       — Transaction, ReservaEntry, GastoEntry
  lib/
    finance-prompts.ts         — prompts do Buddy Financeiro (tirar dos edge functions)
    parse-finance.ts           — parse de "R$ 40", "40 reais", "E os 40?" → número
  services/
    finance.service.ts         — getGastosMes, getReservasMes, getTotalGuardado, upsertMemory
  hooks/
    useGastosMensais.ts        — notas category="Financeiro" do mês corrente
    useTotalGuardado.ts        — lê user_memory, calcula progresso vs meta
    useReservaParser.ts        — detecta se nota é reserva ou gasto e retorna tipo+valor
  components/
    MetaDiariaProgress.tsx     — barra de progresso: total guardado / (meta × dias úteis)
    ReservaCard.tsx            — card de confirmação ✅ estilo WhatsApp
    GastoList.tsx              — lista bullets estilo "Gastos — Hoje" / "Gastos — Este mês"
    WhatsAppStyleReport.tsx    — renderiza relatório no formato exato das capturas do Paulo
  pages/
    FinanceDashboard.tsx       — página principal com MetaDiariaProgress + GastoList + ReservaCard
```

### 2. Feature `ai-chat/finance-actions/`

```
src/features/ai-chat/finance-actions/
  parse-reserva.ts           — identifica "reserva" vs "gasto" em texto livre
  generate-report.ts         — monta string no formato exato das capturas (WhatsApp-style)
  action-executor-finance.ts — executa create_note Financeiro + upsert user_memory em uma chamada
```

### 3. Hook `useAIChat.ts`

Extrai de `AIChat.tsx` (ainda inline, ~200 linhas de lógica):
- `handleSend`, `handleRegenerate`, `handleStop`
- gerenciamento de `chatMessages`, `isStreaming`
- `saveMessage`, `createConvMut`, `deleteConvMut`
- `selectedConvId`, `handleSelectConv`, `handleNewChat`

`AIChat.tsx` fica com ~150 linhas de JSX puro + glue.

```
src/features/ai-chat/hooks/
  useAIChat.ts               — estado + handlers do chat
  useAIConversations.ts      — CRUD de conversas (separado do chat)
```

### 4. Rota + Sidebar

`src/app/router/route-config.tsx` — adicionar `/app/finance`
`src/components/AppSidebar.tsx` — adicionar "Minhas Finanças" no grupo Principal (ícone `Wallet`)

### 5. Componente `WhatsAppStyleReport`

Renderiza no formato exato das capturas:
```
✅ Reserva registrada! R$ 40,00 adicionados...

Gastos — Hoje:
• Gasto com Reserva (22/03) — R$ 40,00 (22/03)
Total: R$ 40,00
```

Modo relatório mensal:
```
Gastos — Este mês:
• Gasto com Reserva (22/03) — R$ 40,00 (22/03)
• Gasto com Moto (19/03) — R$ 100,00 (19/03)
...
Total guardado este mês: R$ XXX,XX
```

---

## Arquivos

```
NEW  src/features/finance/types/transaction.types.ts
NEW  src/features/finance/lib/finance-prompts.ts
NEW  src/features/finance/lib/parse-finance.ts
NEW  src/features/finance/services/finance.service.ts
NEW  src/features/finance/hooks/useGastosMensais.ts
NEW  src/features/finance/hooks/useTotalGuardado.ts
NEW  src/features/finance/hooks/useReservaParser.ts
NEW  src/features/finance/components/MetaDiariaProgress.tsx
NEW  src/features/finance/components/ReservaCard.tsx
NEW  src/features/finance/components/GastoList.tsx
NEW  src/features/finance/components/WhatsAppStyleReport.tsx
NEW  src/features/finance/pages/FinanceDashboard.tsx

NEW  src/features/ai-chat/finance-actions/parse-reserva.ts
NEW  src/features/ai-chat/finance-actions/generate-report.ts
NEW  src/features/ai-chat/finance-actions/action-executor-finance.ts

NEW  src/features/ai-chat/hooks/useAIChat.ts
NEW  src/features/ai-chat/hooks/useAIConversations.ts

MOD  src/pages/app/AIChat.tsx          — usa useAIChat + useAIConversations (JSX puro)
MOD  src/app/router/route-config.tsx   — adiciona rota /app/finance
MOD  src/components/AppSidebar.tsx     — adiciona "Minhas Finanças" na sidebar
```

**Total: 16 novos arquivos, 3 modificados. Sem migrations. Sem novos pacotes.**

### Dados lidos do banco (finance.service.ts)
- `notes` onde `category = 'Financeiro'` e `created_at` no mês corrente → lista de gastos/reservas
- `user_memory` por `workspace_id` → meta_diaria, total_guardado_mes, ultima_reserva_data
- Tudo já existe na DB, zero migrations necessárias

