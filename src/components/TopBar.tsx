import React from 'react'
import { Moon, Sun, LogOut, Settings, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSidebarCtx } from '@/layouts/AppLayout'

const pageTitles: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/notes': 'Notas',
  '/app/tasks': 'Tarefas',
  '/app/reminders': 'Lembretes',
  '/app/reports': 'Relatórios',
  '/app/conversations': 'Conversas',
  '/app/integrations': 'Integrações',
  '/app/whitelist': 'Whitelist',
  '/app/settings': 'Configurações',
  '/app/logs': 'Logs de Webhook',
}

export const TopBar: React.FC = () => {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleMobile } = useSidebarCtx()

  const title = pageTitles[location.pathname] ?? 'Assistente WhatsApp'
  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  return (
    <header className="h-16 border-b border-border bg-card px-4 sm:px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={toggleMobile}
          title="Menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Toggle tema */}
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Alternar tema">
          {theme === 'dark'
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />
          }
        </Button>

        {/* Menu usuário */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium text-foreground">{profile?.name ?? 'Usuário'}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile?.role ?? 'member'}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/app/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
