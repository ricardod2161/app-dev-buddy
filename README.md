# 🤖 WhatsApp & Telegram AI Assistant

> Seu assistente pessoal de produtividade inteligente, integrado ao WhatsApp e Telegram.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-purple?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud-green?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-blue?logo=tailwindcss)](https://tailwindcss.com/)

---

## ✨ Funcionalidades

| Módulo | Descrição |
|---|---|
| 📊 **Dashboard** | KPIs em tempo real, gráficos de tendência, métricas de IA |
| 📝 **Notas** | Criadas automaticamente via mensagem de voz ou texto |
| ✅ **Tarefas** | Kanban drag-and-drop com prioridade e prazos |
| 🔔 **Lembretes** | Agendamento natural de linguagem ("amanhã às 9h") |
| 💬 **Conversas** | Histórico completo WhatsApp + Telegram por contato |
| 👥 **Contatos** | Agenda com tags e anotações |
| 📈 **Relatórios** | Resumo semanal gerado por IA |
| 🔌 **Integrações** | Conecte WhatsApp (Evolution API) e Telegram Bot |
| 📋 **Whitelist** | Controle quais números podem usar o assistente |
| 📟 **Logs** | Monitoramento em tempo real com métricas de IA (modelo, tempo, ação) |
| ⚙️ **Configurações** | Personalidade do bot, fuso, idioma, voz TTS |

---

## 🏗️ Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS + Radix UI
- **State**: TanStack Query (React Query v5)
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **Drag & Drop**: @dnd-kit
- **Backend**: Supabase (Lovable Cloud) — Postgres + RLS + Edge Functions + Realtime
- **Messaging**: Evolution API (WhatsApp) + Telegram Bot API
- **AI**: Google Gemini (via Lovable AI Gateway)
- **TTS**: ElevenLabs

---

## 🚀 Rodando localmente

### Pré-requisitos
- Node.js ≥ 18
- npm ≥ 9

```bash
# 1. Clone o repositório
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais do Supabase

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:5173`

### Comandos disponíveis

```bash
npm run dev        # Servidor de desenvolvimento
npm run build      # Build de produção
npm run preview    # Preview do build
npm run lint       # Verificar erros de lint
npm run test       # Rodar testes
```

---

## 📁 Estrutura do Projeto

```
src/
├── components/       # Componentes compartilhados (Sidebar, TopBar, ErrorBoundary…)
│   └── ui/           # shadcn/ui primitives
├── contexts/         # AuthContext, ThemeContext
├── hooks/            # Hooks customizados
├── layouts/          # AppLayout, AuthLayout
├── lib/              # Utilitários (utils.ts)
├── pages/
│   ├── app/          # Páginas protegidas (Dashboard, Tasks, Notes…)
│   └── auth/         # Login, Register
└── types/            # TypeScript types e interfaces

supabase/
├── functions/        # Edge Functions (webhooks, process-message, reports…)
└── migrations/       # SQL migrations versionadas
```

---

## 🔐 Segurança

- Row Level Security (RLS) ativo em todas as tabelas
- Tokens e chaves de API armazenados como secrets no servidor (nunca expostos ao frontend)
- Autenticação via Supabase Auth com JWT
- Whitelist de números para controle de acesso ao bot

---

## 🗺️ Roadmap

- [ ] Suporte a múltiplos workspaces com convite por e-mail
- [ ] Integração com Google Calendar para lembretes
- [ ] Modo offline com sync quando reconectar
- [ ] App mobile (PWA)
- [ ] Dashboard de gastos com categorias automáticas por IA

---

## 👤 Autor

**Paulo Ricardo Dantas de Lima**

---

## 📄 Licença

Privado — todos os direitos reservados.
