import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProviders } from '@/app/providers/AppProviders'
import { appRoutes } from '@/app/router/route-config'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import ErrorBoundary from '@/components/ErrorBoundary'
import LoginPage from '@/pages/auth/Login'
import RegisterPage from '@/pages/auth/Register'
import NotFound from './pages/NotFound'

const App = () => (
  <AppProviders>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route element={<AuthLayout />}>
          <Route path="/auth/login" element={<ErrorBoundary fallbackTitle="Erro na tela de login"><LoginPage /></ErrorBoundary>} />
          <Route path="/auth/register" element={<ErrorBoundary fallbackTitle="Erro no cadastro"><RegisterPage /></ErrorBoundary>} />
        </Route>
        <Route element={<AppLayout />}>
          {appRoutes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </AppProviders>
)

export default App
