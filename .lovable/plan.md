

## Problema raiz de performance

**Pipeline atual para áudio:**
```
Boot (~30ms) → Contexto DB (~150ms) → Transcrição [gemini-2.5-pro] (~5-6s) → AI principal [gemini-2.5-pro] (~5s) → Salvar + Enviar (~400ms)
= ~13 segundos
```

**Causa:** `isComplexRequest()` retorna `true` para qualquer `msgType === 'audio'` (linha 55), então SEMPRE usa Pro em ambas as chamadas. Mas "apaga tarefa X" transcrito é tão simples quanto texto.

**Pipeline depois das correções:**
```
Boot → Contexto DB → Transcrição [gemini-2.5-flash] (~1-2s) → AI principal [flash, quando simples] (~1-2s) → Enviar (~400ms)
= ~3-5 segundos
```

---

## Arquivo: `supabase/functions/process-message/index.ts`

### Mudança A — Transcrição usa Flash primeiro

**Linha 308:**
```typescript
// ANTES
for (const model of ['google/gemini-2.5-pro', 'google/gemini-2.5-flash']) {

// DEPOIS  
for (const model of ['google/gemini-2.5-flash', 'google/gemini-2.5-pro']) {
```

Flash transcreve português com a mesma qualidade. Pro como fallback se Flash falhar.
Economia: **~3-4 segundos por áudio**.

---

### Mudança B — Roteamento pós-transcrição mais inteligente

**Linha 820 (atual):**
```typescript
const isComplex = isComplexRequest(effectiveText ?? '', message_type)
```

**Novo (depois da transcrição):**
```typescript
// Para áudio: usa o TEXTO transcrito para avaliar complexidade,
// não o tipo 'audio'. "Remover tarefa X" transcrito → rota para flash.
const routingType = message_type === 'audio' ? 'text' : message_type
const isComplex = isComplexRequest(effectiveText ?? '', routingType)
```

Comandos simples de áudio (criar nota, apagar tarefa, criar lembrete) → Flash.
Comandos complexos de áudio (resumo semanal, análise financeira) → Pro.
Economia: **~3-4 segundos para comandos simples de áudio**.

---

### Mudança C — Precarregar integration em paralelo com o contexto

Atualmente `sendReply` faz uma nova query ao banco toda vez (sequential, depois do AI call). 

Adicionar no `Promise.all` da linha 198:
```typescript
supabase.from('integrations')
  .select('*')
  .eq('workspace_id', workspace_id)
  .eq('is_active', true)
  .maybeSingle()
```

Passar `integration` para `sendReply` como parâmetro. Elimina uma round-trip serial ao banco.
Economia: **~100-200ms**.

---

### Mudança D — Skip da query financeira para mensagens sem contexto financeiro

A 5ª query em paralelo (`todayFinancialNotes`) roda para TODA mensagem, mesmo "oi" ou "apaga tarefa".

```typescript
// Só faz query financeira se a mensagem tem contexto financeiro
const needsFinancial = hasFinancialContent(effectiveText ?? '') || message_type === 'audio'

// No Promise.all:
needsFinancial 
  ? supabase.from('notes').select('title, content').eq('workspace_id', workspace_id)...
  : Promise.resolve({ data: [] })
```

Para mensagens de texto simples (maioria das mensagens), elimina uma query. Economia: **~50-100ms**.

---

### Mudança E — Reduzir tamanho do contexto no system prompt para pedidos simples

Para `isComplex === false` (texto simples), reduzir:
- `recentNotes`: de `.limit(15)` → `.limit(6)`
- `pendingTasks`: de `.limit(10)` → `.limit(6)`
- `history`: de `.limit(12)` → `.limit(8)`

Context menor = menos tokens = resposta mais rápida do modelo. Economia: **~200-500ms**.

---

## Resumo do impacto esperado

```
               ANTES       DEPOIS
─────────────────────────────────
Texto simples: ~3-4s    → ~1.5-2s
Áudio simples: ~13s     → ~3-5s
Áudio complexo: ~13s    → ~6-8s (ainda usa Pro, mas só transcr. usa flash)
```

Arquivo único alterado: `supabase/functions/process-message/index.ts`
Zero mudanças de banco de dados. Deploy automático.

