
## Análise Completa — O Que Fazer na Tela de Integrações

### O Que Está na Tela Hoje (do print)
A tela atual tem:
- Tabs: WhatsApp Evolution | WhatsApp Cloud | Telegram
- Um card com formulário de configuração (URL, API Key, Instance ID, etc.)
- Badges de status (Configurada / Ativo)
- Botões de ação na base: Salvar, Testar Conexão, Simular Webhook, Configurar Webhook

### Problemas Identificados Como Engenheiro de Sistema

**1. Zero visibilidade de saúde em tempo real**
Não há nenhum indicador de "o sistema está vivo agora?". O usuário precisa mandar mensagem no WhatsApp para descobrir se está funcionando. Isso é crítico.

**2. Formulário sem feedback de diagnóstico**
Quando algo falha (webhook bloqueado, instância desconectada), a UI não mostra nada. A pessoa vai em Logs e não entende o que vê.

**3. Tabs planas não mostram status de relance**
Para saber qual integração está ativa, o usuário precisa clicar em cada tab. Em sistemas profissionais, o status aparece no próprio header da tab.

**4. Sem contagem de métricas operacionais**
Quantas mensagens foram processadas hoje? Quantas deram erro? Quanto tempo a última mensagem demorou? São métricas zero-cost de implementar (estão no DB) mas ausentes na UI.

**5. Botão "Configurar Webhook na Evolution" sem feedback de resultado real**
Chama a API mas não mostra o estado atual do webhook configurado (URL, eventos registrados, se está ativo).

**6. Campos de credenciais sem máscaras inteligentes**
API Key aparece como `password` cego. O usuário não consegue verificar se a chave está correta sem redigitar.

**7. Sem modo de "diagnóstico completo"**
Um botão único que testa todos os componentes em cadeia: API → Webhook → Process-message → WhatsApp reply.

---

### Plano de Melhorias (Da mais impactante para a menor)

#### A — Health Dashboard (visibilidade real-time)
Adicionar um painel de saúde NO TOPO da página com cards de status live:

```text
┌─────────────────────────────────────────────────────────────────┐
│  🟢 Evolution API     🟢 Webhook Ativo     🟢 IA Respondendo   │
│  Conectada            73 msgs hoje         Última: 2min atrás   │
└─────────────────────────────────────────────────────────────────┘
```

Dados já existem no DB: `messages` table (total hoje), `webhook_logs` (last entry), `integrations` (is_active). Sem custo de backend novo.

#### B — Tabs com indicadores de status embutidos
Mudar as tabs de texto simples para mostrar o badge inline:
- `WhatsApp Evolution ✅` quando configurada e ativa
- `WhatsApp Cloud ⚠️` quando não configurada
- `Telegram ○` quando inativa

#### C — Painel de Estatísticas por Integração
Dentro de cada tab, acima do formulário, exibir:
- Mensagens recebidas (IN) / enviadas (OUT) nos últimos 7 dias
- Última mensagem recebida (timestamp)
- Status do último webhook_log

Dados: query em `messages` + `webhook_logs` filtrado por `workspace_id` e `provider`.

#### D — Botão "Diagnóstico Completo"
Um único botão que executa 3 verificações em sequência com progresso visual:
1. Testa conexão com Evolution API (`/instance/connectionState`)
2. Verifica se webhook está registrado na Evolution (`/webhook/find/{instance}`)
3. Envia webhook simulado e verifica se chega no banco

Resultado: lista de ✅/❌ com explicação de cada passo.

#### E — Campo de API Key com toggle show/hide e verificação de format
Trocar `type="password"` puro por um input com botão 👁 para revelar parcialmente (últimos 4 chars) sem expor tudo.

#### F — Logs recentes integrados na página
Embaixo de cada formulário, mostrar os últimos 5 logs da integração (com status colorido) sem precisar ir para a aba de Logs separada.

---

### Arquitetura das Mudanças

```text
ARQUIVO A EDITAR:
src/pages/app/Integrations.tsx
  - Adicionar query: mensagens hoje (count IN/OUT por provider)
  - Adicionar query: último webhook_log por provider  
  - Adicionar query: connectionState health check (on-mount, silencioso)
  - Novo componente <IntegrationHealthBanner>
  - Novo componente <IntegrationStats>  
  - Novo componente <DiagnosticModal>
  - Novo componente <RecentLogsInline>
  - Melhorar TabsTrigger com status badges
  - Melhorar input de API Key com eye toggle
  - Melhorar autoConfigureWebhook para mostrar estado atual do webhook registrado
```

### O Que NÃO Muda
- Lógica de backend (process-message, webhook-whatsapp) — nenhuma mudança
- Banco de dados — sem novas tabelas, apenas queries de leitura
- Formulário de configuração existente — preservado integralmente
- Deploy de edge functions — não necessário

### Impacto Esperado
```text
Antes: "Será que está funcionando?" → Manda mensagem no WhatsApp → Espera resposta
Depois: Abre Integrações → Verde/Vermelho imediato → Se vermelho, diagnóstico em 1 clique
```
