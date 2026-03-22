
## Diagnóstico

### O que o usuário quer
Configurar o assistente IA (ZYNTRA) com a persona completa do "Buddy Financeiro Pessoal do Paulo" — com tom nordestino-carioca, formatação obrigatória exata (✅, "Gastos — Hoje", bullets •, datas DD/MM), memória de metas financeiras e regras rígidas de resposta.

### Onde isso precisa entrar
Dois pontos independentes no sistema:

1. **`supabase/functions/ai-chat/index.ts`** — chat web (app, streaming SSE)
   - Linha 38-76: system prompt do ZYNTRA genérico
   - Linha 164-169: chamada ao gateway — sem `temperature`, `top_p`, `max_tokens`

2. **`supabase/functions/process-message/index.ts`** — bot WhatsApp/Telegram
   - Linha 443-525: system prompt do WhatsApp — genérico, sem persona do Paulo
   - Linha 525: onde `botPersonality` é appendado (via workspace_settings)

### Abordagem

A persona do Paulo é uma **camada adicional de instrução** acima da lógica base de ações autônomas. Não vou substituir as capacidades existentes (create_note, create_task, etc.) — vou **injetar a persona como prefixo de alta prioridade** em ambos os prompts, garantindo que:
- O formato de resposta seja sempre o exato das prints (✅, "Gastos — Hoje", bullets •, datas DD/MM)
- A temperatura/top_p/max_tokens sejam configurados corretamente
- A memória de meta diária R$40 e contexto do Paulo estejam presentes
- As ações autônomas de finanças ainda funcionem (create_note com category="Financeiro")

---

## Plano de implementação

### Arquivo 1: `supabase/functions/ai-chat/index.ts`

**Mudança 1 (linhas 38-76):** Substituir o system prompt genérico por uma versão que começa com a persona do Paulo e mantém as capacidades do ZYNTRA.

O novo system prompt terá esta estrutura:
```
## PERSONA — Buddy Financeiro Pessoal do Paulo
Você é o assistente pessoal de finanças e produtividade de Paulo Ricardo Dantas de Lima,
amigo de 15 anos, contador expert + dev sênior. Fala como irmão do RN — direto, leve,
mistura nordestino com carioca. Use "mano", "salvo", "bora", "desculpa a confusão anterior".

DADOS DO PAULO:
- Nome: Paulo | Cidade: Alexandria/RN | Meta diária de reserva: R$ 40,00
- Data atual: [dinâmica] | Última reserva registrada: use o contexto de notas

FORMATO OBRIGATÓRIO (nunca mude o layout):
[... todas as regras de formato exatas das prints]

EXEMPLOS OBRIGATÓRIOS:
"E os 40?" → ✅ Reserva registrada! R$ 40,00...
"Mim der o relatório..." → Gastos — Hoje: • ...
[etc]

CAPACIDADES ZYNTRA (mantidas):
[ACTION:create_note|...] para registrar gastos automaticamente
[ACTION:create_task|...] etc
```

**Mudança 2 (linha 164-169):** Adicionar `temperature: 0.3`, `top_p: 0.85`, `max_tokens: 1200` na chamada ao gateway.

---

### Arquivo 2: `supabase/functions/process-message/index.ts`

**Mudança (linhas 443-525):** Injetar a persona do Paulo no início do system prompt do WhatsApp, antes da lógica de capacidades. O tom, os formatos de resposta e os exemplos são idênticos ao ai-chat — o Paulo usa o mesmo assistente tanto no app quanto no WhatsApp.

A injeção fica logo após o cabeçalho `Você é ${botName}...`, adicionando:
```
## Buddy Financeiro — Paulo Ricardo (Alexandria/RN)
Meta diária R$40. Fala como irmão nordestino-carioca.
FORMATO OBRIGATÓRIO: ✅ confirmações, "Gastos — Hoje:", bullets •, datas DD/MM
[exemplos exatos das prints]
Temperatura mental: 0.3 — Seja consistente, direto, nunca mude o layout.
```

Também adicionar `temperature: 0.3`, `top_p: 0.85`, `max_tokens: 1200` na chamada ao gateway dentro do process-message (por volta da linha 800-900 onde o fetch do gateway acontece).

---

## Resumo dos arquivos

```
MOD  supabase/functions/ai-chat/index.ts
       — Injetar persona completa do Paulo no system prompt
       — Adicionar temperature:0.3, top_p:0.85, max_tokens:1200

MOD  supabase/functions/process-message/index.ts  
       — Injetar persona do Paulo no início do system prompt WhatsApp
       — Adicionar temperature:0.3, top_p:0.85, max_tokens:1200 na chamada gateway
```

Sem mudanças de banco. Sem novos pacotes. Deploy automático dos edge functions.

### Resultado
- Chat web (app) e WhatsApp respondem com formatação idêntica às prints do Paulo
- Temperatura 0.3 garante consistência de layout (nunca muda o formato)
- Meta diária R$40 é memória permanente no prompt
- Ações autônomas (create_note "Financeiro") continuam funcionando por baixo do formato
