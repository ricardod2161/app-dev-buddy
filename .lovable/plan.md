
## Diagnóstico: Formulário de Configuração Não Aparece

### Causa Raiz — 2 bugs combinados

**Bug 1 — `workspaceId` null bloqueia o render:**
```tsx
// IntegrationsPage linha 347
{workspaceId && <IntegrationForm ... workspaceId={workspaceId} />}
```
Se `workspaceId` é `null` (AuthContext ainda carregando ou workspace não encontrado), a expressão curto-circuita e **nada é renderizado** dentro do `CardContent`. O usuário vê só o título e descrição do card, sem nenhum campo.

**Bug 2 — Ausência de loading/erro no `CardContent`:**
Quando `isLoading=false` mas `workspaceId=null` (ex: workspace não criado ainda), o componente renderiza `null` silenciosamente. Não há fallback, não há mensagem de erro, não há skeleton.

### Outros Problemas Identificados
1. **TopBar `pageTitles`** — `/app/reminders` não mapeado → título fica "Assistente WhatsApp"
2. **`isActive` state não reseta** ao trocar entre abas Evolution/Cloud/Telegram
3. **`simulateWebhook`** — não chama edge function real, só faz `setTimeout`
4. **Estado inicial do form** — campos mostrados mas sem indicação visual clara de "não configurado ainda"
5. **Console warning** no Logs — Sheet/Dialog com ref em função component

---

## Plano de Implementação

### Arquivo 1: `src/pages/app/Integrations.tsx` — reescrita completa

**Fix 1 — Loading state robusto:**
```tsx
const IntegrationsPage = () => {
  const { workspaceId, loading: authLoading } = useAuth()

  if (authLoading || !workspaceId) {
    return <div className="space-y-4">
      {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
    </div>
  }
  // resto do componente...
}
```

**Fix 2 — `key` prop em IntegrationForm para reset de estado ao trocar aba:**
```tsx
<IntegrationForm key="evolution" provider="EVOLUTION" ... />
<IntegrationForm key="cloud" provider="CLOUD" ... />
<IntegrationForm key="telegram" provider="TELEGRAM" ... />
```

**Fix 3 — Badge de status "Configurada/Não configurada" no CardHeader:**
Mostrar visualmente se a integração já foi configurada antes.

**Fix 4 — `simulateWebhook` real:**
```tsx
const simulateWebhook = async () => {
  try {
    JSON.parse(simulatePayload) // valida JSON
    const url = provider === 'TELEGRAM' ? webhookTelegramUrl : webhookWhatsappUrl
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: simulatePayload,
    })
    const result = await res.json()
    if (res.ok) toast.success(`Webhook processado! ${JSON.stringify(result)}`)
    else toast.error(`Erro ${res.status}: ${JSON.stringify(result)}`)
    setSimulateOpen(false)
  } catch {
    toast.error('JSON inválido no payload')
  }
}
```

**Melhoria visual geral:**
- Seção de status da conexão com indicador verde/vermelho
- URL do webhook em destaque maior com instrução clara acima
- Label "Campos obrigatórios" no topo do form
- Separadores entre grupos de campos

### Arquivo 2: `src/components/TopBar.tsx`
Adicionar `/app/reminders` ao `pageTitles`:
```tsx
'/app/reminders': 'Lembretes',
```

---

## Arquivos a Editar

```text
src/pages/app/Integrations.tsx   ← fix principal dos bugs + melhorias visuais
src/components/TopBar.tsx        ← adicionar Lembretes ao pageTitles
```
