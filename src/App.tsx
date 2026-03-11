import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import AppLayout from "@/layouts/AppLayout"
import AuthLayout from "@/layouts/AuthLayout"
import ErrorBoundary from "@/components/ErrorBoundary"
import LoginPage from "@/pages/auth/Login"
import RegisterPage from "@/pages/auth/Register"
import DashboardPage from "@/pages/app/Dashboard"
import NotesPage from "@/pages/app/Notes"
import TasksPage from "@/pages/app/Tasks"
import ReportsPage from "@/pages/app/Reports"
import ConversationsPage from "@/pages/app/Conversations"
import IntegrationsPage from "@/pages/app/Integrations"
import WhitelistPage from "@/pages/app/Whitelist"
import SettingsPage from "@/pages/app/Settings"
import LogsPage from "@/pages/app/Logs"
import RemindersPage from "@/pages/app/Reminders"
import ContactsPage from "@/pages/app/Contacts"
import AIChatPage from "@/pages/app/AIChat"
import NotFound from "./pages/NotFound"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } },
})

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Sonner richColors position="top-right" />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />
              <Route element={<AuthLayout />}>
                <Route path="/auth/login" element={<ErrorBoundary fallbackTitle="Erro na tela de login"><LoginPage /></ErrorBoundary>} />
                <Route path="/auth/register" element={<ErrorBoundary fallbackTitle="Erro no cadastro"><RegisterPage /></ErrorBoundary>} />
              </Route>
              <Route element={<AppLayout />}>
                <Route path="/app" element={<ErrorBoundary fallbackTitle="Erro no Dashboard"><DashboardPage /></ErrorBoundary>} />
                <Route path="/app/notes" element={<ErrorBoundary fallbackTitle="Erro nas Notas"><NotesPage /></ErrorBoundary>} />
                <Route path="/app/tasks" element={<ErrorBoundary fallbackTitle="Erro nas Tarefas"><TasksPage /></ErrorBoundary>} />
                <Route path="/app/reports" element={<ErrorBoundary fallbackTitle="Erro nos Relatórios"><ReportsPage /></ErrorBoundary>} />
                <Route path="/app/conversations" element={<ErrorBoundary fallbackTitle="Erro nas Conversas"><ConversationsPage /></ErrorBoundary>} />
                <Route path="/app/contacts" element={<ErrorBoundary fallbackTitle="Erro nos Contatos"><ContactsPage /></ErrorBoundary>} />
                <Route path="/app/reminders" element={<ErrorBoundary fallbackTitle="Erro nos Lembretes"><RemindersPage /></ErrorBoundary>} />
                <Route path="/app/integrations" element={<ErrorBoundary fallbackTitle="Erro nas Integrações"><IntegrationsPage /></ErrorBoundary>} />
                <Route path="/app/whitelist" element={<ErrorBoundary fallbackTitle="Erro na Whitelist"><WhitelistPage /></ErrorBoundary>} />
                <Route path="/app/settings" element={<ErrorBoundary fallbackTitle="Erro nas Configurações"><SettingsPage /></ErrorBoundary>} />
                <Route path="/app/logs" element={<ErrorBoundary fallbackTitle="Erro nos Logs"><LogsPage /></ErrorBoundary>} />
                <Route path="/app/ai-chat" element={<ErrorBoundary fallbackTitle="Erro no Chat IA"><AIChatPage /></ErrorBoundary>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

export default App
