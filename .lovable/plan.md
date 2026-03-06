
## Two features to implement

---

### Feature 1 — Configurações de Voz do ElevenLabs na página de Settings

**O que fazer:**

#### Banco de dados
Adicionar duas colunas à tabela `workspace_settings` via migration:
- `tts_enabled boolean DEFAULT false` — toggle ativar/desativar respostas em áudio
- `tts_voice_id text DEFAULT 'nPczCjzI2devNBz1zQrb'` — ID da voz selecionada

#### UI — `src/pages/app/Settings.tsx`
Adicionar um novo Card **"Respostas em Áudio (ElevenLabs)"** com:
- **Switch** ativar/desativar respostas de voz
- **Select de vozes** com as principais opções masculinas e femininas do ElevenLabs:

```text
Masculinas:
  Brian  (nPczCjzI2devNBz1zQrb)  ← padrão atual
  George (JBFqnCBsd6RMkjVDRZzb)
  Charlie (IKne3meq5aSn9XLyUdCD)
  Liam   (TX3LPaxmHKxFdv7VOQHJ)
  Daniel (onwK4e9ZLuTAKqWW03F9)

Femininas:
  Sarah   (EXAVITQu4vr4xnSDxMaL)
  Laura   (FGY2WhTYpPnrIDTdsKH5)
  Alice   (Xb7hH8MSUJpSbSDYk0k2)
  Matilda (XrExE9yKIg1WjnnlVkGX)
  Jessica (cgSgspJ2msm6clMCkdW9)
```

Incluir no `save()` os campos `tts_enabled` e `tts_voice_id`.
Atualizar `WorkspaceSettings` em `src/types/database.ts` com os dois novos campos.

#### Edge function — `process-message/index.ts`
Buscar `workspace_settings` (já carregado no fluxo) e:
- Só executar o bloco TTS se `settings.tts_enabled === true`
- Passar `voice_id: settings.tts_voice_id` na chamada da função `elevenlabs-tts`

#### Edge function — `process-reminders/index.ts`
Mesma lógica: verificar `tts_enabled` antes de gerar áudio para lembretes.

---

### Feature 2 — Adicionar número de um amigo para o assistente responder

**Explicação para o usuário:**
O sistema já tem uma **Whitelist** (`/app/whitelist`) — é exatamente para isso. Qualquer número adicionado lá receberá respostas do bot.

**O que fazer:**
Melhorar a página **Whitelist** (`src/pages/app/Whitelist.tsx`) com uma seção explicativa clara no topo:

```text
┌─────────────────────────────────────────────────────────────┐
│  ℹ️ Como funciona                                            │
│  Adicione aqui os números que podem usar o assistente.      │
│  Se a lista estiver vazia, QUALQUER número pode usar.       │
│  Quando há números na lista, APENAS eles são atendidos.     │
│                                                              │
│  Para WhatsApp: +5511999990000  ou  5511999990000           │
│  Para Telegram: tg:123456789                                │
└─────────────────────────────────────────────────────────────┘
```

Isso esclarece o comportamento existente sem precisar de código novo para a funcionalidade em si — o usuário só precisa saber que deve ir em Whitelist e adicionar o número do amigo no formato `+5511999990000`.

---

### Arquivos a modificar

```
DB MIGRATION  workspace_settings: +tts_enabled, +tts_voice_id
MOD  src/types/database.ts                        ← novos campos
MOD  src/pages/app/Settings.tsx                   ← Card de voz ElevenLabs  
MOD  supabase/functions/process-message/index.ts  ← respeitar tts_enabled + voice_id
MOD  supabase/functions/process-reminders/index.ts← respeitar tts_enabled
MOD  src/pages/app/Whitelist.tsx                  ← banner explicativo
```
