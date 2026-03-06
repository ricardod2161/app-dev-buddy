import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import AppLayout from "@/layouts/AppLayout"
import AuthLayout from "@/layouts/AuthLayout"
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
                <Route path="/auth/login" element={<LoginPage />} />
                <Route path="/auth/register" element={<RegisterPage />} />
              </Route>
              <Route element={<AppLayout />}>
                <Route path="/app" element={<DashboardPage />} />
                <Route path="/app/notes" element={<NotesPage />} />
                <Route path="/app/tasks" element={<TasksPage />} />
                <Route path="/app/reports" element={<ReportsPage />} />
                <Route path="/app/conversations" element={<ConversationsPage />} />
                <Route path="/app/contacts" element={<ContactsPage />} />
                <Route path="/app/reminders" element={<RemindersPage />} />
                <Route path="/app/integrations" element={<IntegrationsPage />} />
                <Route path="/app/whitelist" element={<WhitelistPage />} />
                <Route path="/app/settings" element={<SettingsPage />} />
                <Route path="/app/logs" element={<LogsPage />} />
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
