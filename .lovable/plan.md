

## Diagnóstico Definitivo — Causa Raiz Confirmada

### O que a análise do banco de dados revelou

O usuário `ricardodelima1988@gmail.com` existe no `auth.users` (email confirmado), mas as tabelas `workspaces` e `workspace_members` estão **completamente vazias**. 

**Por que isso aconteceu:** No fluxo de registro, o `supabase.auth.signUp()` cria o usuário mas pode retornar um `user` sem sessão ativa (quando email confirmation está ativo). O código em seguida tenta `INSERT INTO workspaces` — mas como não há sessão JWT ativa ainda, a política RLS `auth.uid() IS NOT NULL` falha silenciosamente. O `wsError` pode retornar `null` em alguns casos pelo Supabase, fazendo o código prosseguir normalmente. Resultado: usuário existe, workspace não existe, `workspaceId` fica `null` para sempre.

### Todos os problemas que serão corrigidos

**Crítico — causa a tela em branco:**
1. **Registro sem workspace**: quando email confirmation está ativo, o INSERT de workspace falha silenciosamente. A solução é criar o workspace dentro de um hook `handle_new_user` no banco (trigger) OU usar service role key na edge function de registro para garantir a criação.
2. **Usuário sem workspace**: o `AuthContext.tsx` não tem fallback para criar workspace se não encontrar um, então a UI fica presa.
3. **Integrações page**: mesmo com o fix anterior, se `workspaceId` é null, a UI mostra "Workspace não encontrado" — mensagem correta mas o usuário não tem como resolver sozinho.

**Solução arquitetural:** Criar um trigger no banco que executa `handle_new_user_workspace()` automaticamente após INSERT em `auth.users`, criando o workspace e associando o membro — similar ao que já existe para `user_profiles`. Assim, mesmo que o JavaScript falhe, o workspace sempre existe.

**Adicionalmente**, adicionar um mecanismo de recuperação no `AuthContext`: se o usuário está logado mas sem workspace, tentar criar um automaticamente.

---

## Plano de Implementação

### 1. Migration: Trigger automático de criação de workspace

Criar função `handle_new_user_with_workspace()` que é acionada pelo trigger `on auth.users insert`. Ela cria o workspace, workspace_member, workspace_settings e seeds dados iniciais automaticamente, independente do JavaScript.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_workspace_id UUID;
  ws_name TEXT;
BEGIN
  -- Criar user_profile
  INSERT INTO public.user_profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  
  -- Criar workspace automaticamente
  ws_name := COALESCE(NEW.raw_user_meta_data->>'workspace_name', 
                      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || '''s Workspace');
  INSERT INTO public.workspaces (name, owner_user_id) 
  VALUES (ws_name, NEW.id)
  RETURNING id INTO new_workspace_id;
  
  -- Associar o usuário como admin
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'admin');
  
  -- Criar settings do workspace
  INSERT INTO public.workspace_settings (workspace_id)
  VALUES (new_workspace_id);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**IMPORTANTE**: Também criar workspace para o usuário existente que ficou sem workspace (inserção manual via migration).

### 2. `src/contexts/AuthContext.tsx` — Auto-recuperação

Adicionar lógica de recuperação: se `loadWorkspace` retornar vazio, criar workspace automaticamente:

```tsx
const loadWorkspace = async (userId: string) => {
  // ... busca existente
  if (!memberData?.workspace_id) {
    // Tentar criar workspace de recuperação
    const { data: ws } = await supabase.from('workspaces')
      .insert({ name: 'Meu Workspace', owner_user_id: userId }).select().single()
    if (ws) {
      await supabase.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'admin' })
      await supabase.from('workspace_settings').insert({ workspace_id: ws.id })
      setWorkspace(ws)
    }
  }
}
```

### 3. `src/pages/auth/Register.tsx` — Fix race condition de email confirmation

Passar `workspace_name` nos metadados do signUp para o trigger poder usar:

```tsx
await supabase.auth.signUp({
  email, password,
  options: {
    data: { name, workspace_name: workspaceName },
    emailRedirectTo: window.location.origin,
  }
})
```

Remover os INSERTs manuais de workspace do Register.tsx (o trigger cuida disso). Manter apenas o seed de notas/tarefas de boas-vindas (com timeout para esperar o trigger executar).

### 4. `src/pages/app/Integrations.tsx` — Melhorar mensagem de erro

A tela "Workspace não encontrado" já existe, mas adicionar um botão "Tentar novamente" que recarrega a página/chama `refreshWorkspace`.

---

## Arquivos a Modificar

```text
supabase/migrations/          ← novo arquivo: trigger handle_new_user + workspace para usuário existente
src/contexts/AuthContext.tsx  ← auto-criação de workspace em fallback
src/pages/auth/Register.tsx   ← passar workspace_name nos metadados, remover INSERTs duplicados
src/pages/app/Integrations.tsx ← botão "Tentar novamente" na tela de erro
```

