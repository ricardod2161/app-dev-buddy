
## Diagnóstico: Delete já existe — problema é na experiência

O sistema **já tem** `delete_task` e `delete_note` implementados desde o último deploy. O problema real é diferente:

### Problemas identificados

**1. Reconhecimento de intenção — o AI às vezes não usa delete_task**
O system prompt tem "Tarefas: criar, atualizar status, mudar prioridade, deletar" mas não tem exemplos explícitos de frases de deleção em português. O AI pode interpretar "excluir tarefa X" como `just_reply` em vez de acionar `delete_task`.

**2. Match parcial pode falhar em casos reais**
A busca usa `.ilike('title', '%${term}%')`. Se o usuário diz "apaga a tarefa de ligar pro banco" e a tarefa se chama "Ligar para o banco", o match `%ligar pro banco%` vs `"Ligar para o banco"` pode não casar.

**3. Erro "não encontrei" não ajuda o usuário**
Quando o match falha, a mensagem atual é `❌ Não encontrei nenhuma tarefa com o nome "..."`. O usuário fica sem saber os nomes exatos disponíveis.

**4. Sem confirmação antes de deletar**
A deleção é imediata e irreversível. Boas práticas pedem confirmação para ações destrutivas.

**5. O help command (`/ajuda`) já menciona delete** — isso está correto. O problema é a execução.

---

### O que será feito

**Arquivo:** `supabase/functions/process-message/index.ts`

**A — Adicionar seção explícita no system prompt para deleção**
Antes das "Regras de Ouro", adicionar:

```
## Exclusão de Itens — OBRIGATÓRIO
Quando o usuário pedir para EXCLUIR, APAGAR, DELETAR, REMOVER, TIRAR qualquer item:
- Tarefa → use delete_task com o título completo ou parte do título
- Nota → use delete_note com o título
- Lembrete → use cancel_reminder

Palavras que indicam exclusão: "excluir", "apagar", "deletar", "remover", "tira", "some", 
"não preciso mais de", "cancela", "remove", "zera", "descarta"

ATENÇÃO: Quando não encontrar o item pelo nome exato, liste as opções disponíveis 
para o usuário escolher — não retorne erro vazio.
```

**B — Melhorar o handler `delete_task` quando não encontra**
Quando `.ilike` não retornar resultado, fazer uma segunda busca mostrando as tarefas disponíveis para o usuário escolher, em vez de só erro:

```typescript
// Quando não encontra: lista as tarefas disponíveis
const { data: allTasks } = await supabase
  .from('tasks')
  .select('title, status')
  .eq('workspace_id', workspace_id)
  .in('status', ['todo', 'doing'])
  .order('created_at', { ascending: false })
  .limit(8)

if (allTasks?.length) {
  const lista = allTasks.map((t, i) => `${i+1}. ${t.title}`).join('\n')
  replyText = `Não achei uma tarefa com o nome "${fnArgs.task_title}". Suas tarefas atuais:\n\n${lista}\n\nQual delas você quer excluir?`
} else {
  replyText = 'Não encontrei essa tarefa e você não tem tarefas em aberto no momento.'
}
```

**C — Mesma melhoria para `delete_note`**
Quando não encontrar a nota, listar as notas recentes:

```typescript
const { data: allNotes } = await supabase
  .from('notes')
  .select('title, category')
  .eq('workspace_id', workspace_id)
  .order('created_at', { ascending: false })
  .limit(8)

if (allNotes?.length) {
  const lista = allNotes.map((n, i) => `${i+1}. ${n.title} (${n.category ?? 'Geral'})`).join('\n')
  replyText = `Não achei uma nota com esse nome. Suas notas recentes:\n\n${lista}\n\nQual delas você quer apagar?`
} else {
  replyText = 'Não encontrei essa nota e você não tem notas salvas ainda.'
}
```

**D — Adicionar `delete_reminder` como alias de `cancel_reminder`**
Usuários dizem "excluir lembrete X" mas o tool se chama `cancel_reminder`. Adicionar no system prompt que para lembretes, "excluir" = "cancelar", e usar `cancel_reminder`.

**E — Melhorar o match com busca por palavras individuais**
Se a busca `.ilike('%termo completo%')` retornar vazio, tentar busca por cada palavra individualmente (primeira palavra com mais de 3 letras):

```typescript
// Fallback: tenta match por primeira palavra significativa
if (!matchingTasks?.length) {
  const words = fnArgs.task_title.split(' ').filter(w => w.length > 3)
  if (words.length > 0) {
    const { data: fallbackTasks } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('workspace_id', workspace_id)
      .ilike('title', `%${words[0]}%`)
      .limit(1)
    // use fallbackTasks if found
  }
}
```

---

### Resumo dos arquivos

```
MOD  supabase/functions/process-message/index.ts
  A — system prompt: nova seção "## Exclusão de Itens" com exemplos de palavras
  B — handler delete_task: quando não encontra, lista tarefas disponíveis
  C — handler delete_note: quando não encontra, lista notas recentes  
  D — system prompt: instrução "excluir lembrete = cancel_reminder"
  E — handlers delete_task + delete_note: fallback de busca por palavra individual
```

Sem mudanças de banco de dados. Sem novas edge functions. Deploy automático após a edição.
