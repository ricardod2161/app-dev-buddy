import React from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import DashboardPage from '@/pages/app/Dashboard'
import NotesPage from '@/pages/app/Notes'
import TasksPage from '@/pages/app/Tasks'
import ReportsPage from '@/pages/app/Reports'
import ConversationsPage from '@/pages/app/Conversations'
import IntegrationsPage from '@/pages/app/Integrations'
import WhitelistPage from '@/pages/app/Whitelist'
import SettingsPage from '@/pages/app/Settings'
import LogsPage from '@/pages/app/Logs'
import RemindersPage from '@/pages/app/Reminders'
import ContactsPage from '@/pages/app/Contacts'
import AIChatPage from '@/pages/app/AIChat'
import FinanceDashboard from '@/features/finance/pages/FinanceDashboard'
import FinanceHistory from '@/features/finance/pages/FinanceHistory'

export interface AppRoute {
  path: string
  title: string
  element: React.ReactNode
}

export const appRoutes: AppRoute[] = [
  {
    path: '/app',
    title: 'Dashboard',
    element: <ErrorBoundary fallbackTitle="Erro no Dashboard"><DashboardPage /></ErrorBoundary>,
  },
  {
    path: '/app/notes',
    title: 'Notas',
    element: <ErrorBoundary fallbackTitle="Erro nas Notas"><NotesPage /></ErrorBoundary>,
  },
  {
    path: '/app/tasks',
    title: 'Tarefas',
    element: <ErrorBoundary fallbackTitle="Erro nas Tarefas"><TasksPage /></ErrorBoundary>,
  },
  {
    path: '/app/reports',
    title: 'Relatórios',
    element: <ErrorBoundary fallbackTitle="Erro nos Relatórios"><ReportsPage /></ErrorBoundary>,
  },
  {
    path: '/app/conversations',
    title: 'Conversas',
    element: <ErrorBoundary fallbackTitle="Erro nas Conversas"><ConversationsPage /></ErrorBoundary>,
  },
  {
    path: '/app/contacts',
    title: 'Contatos',
    element: <ErrorBoundary fallbackTitle="Erro nos Contatos"><ContactsPage /></ErrorBoundary>,
  },
  {
    path: '/app/reminders',
    title: 'Lembretes',
    element: <ErrorBoundary fallbackTitle="Erro nos Lembretes"><RemindersPage /></ErrorBoundary>,
  },
  {
    path: '/app/integrations',
    title: 'Integrações',
    element: <ErrorBoundary fallbackTitle="Erro nas Integrações"><IntegrationsPage /></ErrorBoundary>,
  },
  {
    path: '/app/whitelist',
    title: 'Whitelist',
    element: <ErrorBoundary fallbackTitle="Erro na Whitelist"><WhitelistPage /></ErrorBoundary>,
  },
  {
    path: '/app/settings',
    title: 'Configurações',
    element: <ErrorBoundary fallbackTitle="Erro nas Configurações"><SettingsPage /></ErrorBoundary>,
  },
  {
    path: '/app/logs',
    title: 'Logs',
    element: <ErrorBoundary fallbackTitle="Erro nos Logs"><LogsPage /></ErrorBoundary>,
  },
  {
    path: '/app/ai-chat',
    title: 'Chat IA',
    element: <ErrorBoundary fallbackTitle="Erro no Chat IA"><AIChatPage /></ErrorBoundary>,
  },
  {
    path: '/app/finance',
    title: 'Minhas Finanças',
    element: <ErrorBoundary fallbackTitle="Erro nas Finanças"><FinanceDashboard /></ErrorBoundary>,
  },
  {
    path: '/app/finance/history',
    title: 'Histórico Financeiro',
    element: <ErrorBoundary fallbackTitle="Erro no Histórico"><FinanceHistory /></ErrorBoundary>,
  },
]

