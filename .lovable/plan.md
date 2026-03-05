
## Análise Completa do Sistema

After reading all 15+ source files, here are the issues and improvements identified across every layer:

### Bugs & Functional Issues Found
1. **`AppLayout.tsx`** — `Skeleton` recebe `ref` sem `forwardRef` → warning no console, trocar por `div` com `animate-pulse`
2. **`Logs.tsx`** — `<SelectItem value="">` → mesmo bug do Notes, `filterProvider` e `filterStatus` iniciando como `""` causam erro de runtime no Radix Select
3. **`src/App.css`** — Regras de CSS do Vite starter (`#root`, `.logo`) que conflitam com o layout real (max-width 1280px quebrando o layout full-height)
4. **`Index.tsx`** — Página nunca renderizada mas com conteúdo antigo do template Vite
5. **Dashboard** — Sem estado vazio amigável quando não há dados
6. **Conversations** — Lista lateral não tem scroll independente no mobile; não tem indicador de "provedor" visual no avatar
7. **Tasks** — Kanban sem droppable correto entre colunas (só funciona dentro da mesma coluna com `closestCenter`)
8. **Sidebar** — Sem suporte mobile (não colapsa em tela pequena, fica visível empurrando o conteúdo)

### Design & UX Issues
1. **Auth pages** — Sem indicador visual de força de senha, sem animações de entrada
2. **Dashboard** — Cards de métricas sem tendência/mudança, sem atividade recente
3. **Sidebar mobile** — Não existe; em telas pequenas a sidebar empurra o conteúdo e não fecha
4. **TopBar** — Sem breadcrumb em sub-páginas; botão de menu mobile ausente
5. **Notes** — Conteúdo HTML raw exibido no card (tags `<p>`, `<strong>`, etc.) em vez de preview limpo
6. **Tasks** — Kanban colunas sem "drop zone" visual quando arrastar sobre elas
7. **Settings** — Select de timezone com 400+ itens sem busca/filtro
8. **Empty states** — Inconsistentes: algumas páginas têm, outras não

### Responsive Issues
1. **Conversations** — layout de dois painéis quebra em mobile (painel esquerdo ocupa tudo)
2. **Whitelist** — tabela não tem scroll horizontal em mobile
3. **Logs** — tabela muito larga para mobile sem scroll
4. **Integrations** — grid de campos sem wrap correto em telas pequenas

---

## Plan

### 1. Fix `App.css` + `AppLayout` + `Index.tsx`
- Limpar `App.css` (remover regras do starter Vite)
- Corrigir `AppLayout.tsx` loading skeleton (usar `div` em vez de `Skeleton` com ref)
- Melhorar `Index.tsx` para redirecionar corretamente

### 2. Fix runtime bugs em Logs (Select com `value=""`)
- `filterProvider` e `filterStatus` iniciam como `'all'` em vez de `''`
- `<SelectItem value="">` → `<SelectItem value="all">`
- Condicionais de filtro: `if (filterProvider !== 'all')` em vez de `if (filterProvider)`

### 3. Sidebar responsiva com menu mobile
- Adicionar estado `mobileOpen` no `AppSidebar`
- Em mobile (`< lg`): sidebar vira overlay com backdrop + slide-in
- `TopBar`: adicionar botão hambúrguer que chama `toggleMobile` (prop ou context)
- Em desktop: comportamento atual mantido

### 4. Dashboard melhorado
- Adicionar seção "Atividade Recente" (últimas 5 notas + tarefas recentes)
- Melhorar cards de métricas: adicionar subtexto contextual
- Corrigir cores dos gráficos para funcionar bem no dark mode (usar `stroke` via CSS vars)

### 5. Notes — preview de conteúdo HTML limpo
- Criar `stripHtml(html: string): string` helper para exibir preview limpo no card
- Mostrar até 80 chars do conteúdo sem tags HTML nos cards

### 6. Tasks — Kanban com droppable correto entre colunas
- Usar `useDroppable` do `@dnd-kit/core` para cada coluna
- Adicionar highlight visual quando arrastar sobre coluna (border colorido)
- Corrigir `handleDragEnd` para detectar `over.id` como coluna

### 7. Conversations responsivo
- Em mobile: mostrar apenas lista; ao selecionar conversa, mostrar apenas as mensagens com botão "Voltar"
- Adicionar avatar com iniciais coloridas para cada contato

### 8. Settings — Select timezone com busca
- Substituir Select simples por combo com `Input` de busca
- Filtrar a lista de 400+ timezones em tempo real

### 9. Whitelist & Logs — tabelas responsivas
- Envolver tabelas em `overflow-x-auto` container
- Em mobile, esconder colunas menos importantes com `hidden sm:table-cell`

### 10. Auth pages — melhorias visuais
- Adicionar animação de fade-in no card
- Indicador de força de senha no register
- Melhorar o logo/brand na tela de auth

### 11. Empty states consistentes
- Criar componente `EmptyState` reutilizável com ícone, título e descrição
- Aplicar em todas as páginas (Notes, Tasks, Reports, Conversations, etc.)

### 12. Melhorias gerais de polimento
- `NavLink` no sidebar: usar `NavLink` do react-router em vez de lógica manual de `isActive`
- Adicionar `title` nas páginas no `<head>` via `useEffect`
- Micro-animações nos cards (hover elevation)
- Cor primária mais vibrante — alterar de navy escuro para um azul mais moderno

---

## Files to Change

```text
src/App.css                          ← limpar CSS do starter
src/pages/Index.tsx                  ← remover conteúdo velho
src/layouts/AppLayout.tsx            ← corrigir Skeleton ref + mobile menu button
src/components/AppSidebar.tsx        ← sidebar mobile overlay + responsivo
src/components/TopBar.tsx            ← botão hambúrguer mobile
src/pages/app/Logs.tsx               ← fix Select value="" bug
src/pages/app/Dashboard.tsx          ← atividade recente + dark mode charts
src/pages/app/Notes.tsx              ← stripHtml preview nos cards
src/pages/app/Tasks.tsx              ← kanban droppable correto
src/pages/app/Conversations.tsx      ← responsivo mobile
src/pages/app/Settings.tsx           ← timezone com busca
src/pages/app/Whitelist.tsx          ← tabela responsiva
src/pages/app/Reports.tsx            ← melhorias visuais
src/pages/app/Integrations.tsx       ← polish + responsivo
src/pages/auth/Login.tsx             ← animação + melhorias
src/pages/auth/Register.tsx          ← força de senha + animação
src/index.css                        ← cor primária mais vibrante
src/lib/utils.ts                     ← adicionar stripHtml helper
```
