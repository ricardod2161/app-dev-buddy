
## O que o usuário quer

Todos os dias de manhã, o bot deve **proativamente** entrar em contato com o usuário via WhatsApp/Telegram, como um assistente humano, perguntando o que vai ser feito no dia e listando as tarefas/lembretes pendentes — **em áudio** (usando ElevenLabs TTS), com linguagem humanizada e calorosa.

---

## Diagnóstico do problema atual de TTS

Ao olhar os logs, o TTS está configurado corretamente (tts_enabled=true, voz Laura), mas preciso verificar se o bloco TTS no process-message está sendo atingido. A lógica está correta na linha 952-975. O issue pode ser de deploy — os arquivos foram editados mas a função pode não ter sido reimplantada. Isso será resolvido com o novo deploy.

---

## Arquitetura da nova feature: Morning Briefing

```text
NOVO: supabase/functions/daily-briefing/index.ts
  ← Agendado via pg_cron todo dia às 7h
  ← Para cada workspace com tts_enabled OU pelo menos 1 conversa ativa:
    1. Busca tarefas pendentes (todo + doing) com due_at próximo
    2. Busca lembretes agendados para hoje
    3. Gera texto humanizado via AI (Gemini/Lovable gateway)
    4. Envia TEXTO via send-whatsapp
    5. Se tts_enabled → gera áudio via elevenlabs-tts → envia via sendAudioReply
    6. Registra o envio para não repetir no mesmo dia

NOVO CAMPO: workspace_settings.daily_briefing_enabled (boolean, default false)
NOVO CAMPO: workspace_settings.daily_briefing_time (text, default '07:00')
NOVO CAMPO: workspace_settings.daily_briefing_last_sent (date, para evitar duplicata)

UI: Settings.tsx ← novo Card "Briefing Matinal" com toggle + horário
```

---

## Detalhes de implementação

### 1. Migração do banco
Adicionar 3 colunas em `workspace_settings`:
```sql
ALTER TABLE public.workspace_settings
  ADD COLUMN IF NOT EXISTS daily_briefing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_briefing_time text NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS daily_briefing_last_sent date;
```

### 2. Nova Edge Function: `daily-briefing/index.ts`

Fluxo:
1. Busca todos os workspaces com `daily_briefing_enabled = true`
2. Para cada workspace, verifica se `daily_briefing_last_sent` é diferente de hoje (evita duplicata)
3. Verifica o horário configurado vs hora atual no timezone do workspace
4. Busca tarefas `todo/doing` + lembretes do dia
5. Chama o Lovable AI gateway para gerar uma mensagem humanizada, como:

```
"Bom dia! ☀️ Hoje é [dia da semana], [data]. Tenho [X] tarefas esperando por você: [lista]. Você também tem [Y] lembretes hoje. Por onde quer começar?"
```

6. Envia texto via `send-whatsapp`
7. Se `tts_enabled`, gera áudio via `elevenlabs-tts` e envia via Evolution/Telegram
8. Atualiza `daily_briefing_last_sent` com a data de hoje

Para o número de destino: usa o `target_phone` do primeiro lembrete ativo, ou o `contact_phone` da conversa mais recente do workspace.

### 3. pg_cron agendamento
Agendar a função para rodar a cada 15 minutos (a função internamente verifica quais workspaces estão no horário certo):
```sql
SELECT cron.schedule(
  'daily-briefing-check',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url:='https://qymbrzhrfcstvwkvrgnm.supabase.co/functions/v1/daily-briefing',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) $$
);
```

### 4. UI — Settings.tsx
Novo Card **"Briefing Matinal"** com:
- Toggle ativar/desativar
- Select de horário (06:00 até 10:00 de 30 em 30 min)
- Descrição: "Todos os dias nesse horário, o assistente vai te mandar uma mensagem em áudio perguntando o que você quer fazer hoje e listando suas pendências"

### 5. config.toml
```toml
[functions.daily-briefing]
verify_jwt = false
```

---

## Prompt humanizado para o AI

```
Você é {botName}, assistente pessoal. Hoje é {diaSemana}, {data}. 
Gere uma mensagem de bom dia CURTA (máx 4 linhas), calorosa e humanizada.
Mencione as tarefas pendentes: {listaTarefas}
Mencione os lembretes de hoje: {listaLembretes}
Termine com uma pergunta natural como "Por onde quer começar?" ou "O que você quer priorizar hoje?"
Use linguagem natural, como um amigo próximo falaria.
NÃO use emojis excessivos. Seja breve e natural.
```

---

## Arquivos

```
DB MIGRATION  workspace_settings: +daily_briefing_enabled, +daily_briefing_time, +daily_briefing_last_sent
NEW  supabase/functions/daily-briefing/index.ts
MOD  supabase/config.toml
MOD  src/pages/app/Settings.tsx      ← Card "Briefing Matinal"
MOD  src/types/database.ts           ← novos campos
SQL  pg_cron schedule (via insert tool, não migration)
```

---

## Nota sobre TTS não funcionando

O deploy anterior pode não ter sido atualizado. Durante a implementação, o `process-message` e `elevenlabs-tts` serão reimplantados automaticamente, o que deve resolver o problema do áudio não retornado.
