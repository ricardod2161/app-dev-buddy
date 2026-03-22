import React from 'react'
import { Moon, Sun, LogOut, Settings, Menu, Search } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { appRoutes } from '@/app/router/route-config'

// Build title map from the central route config — single source of truth
const pageTitles: Record<string, string> = Object.fromEntries(
  appRoutes.map(r => [r.path, r.title])
)
// Override AI Chat title to include branding
pageTitles['/app/ai-chat'] = 'Chat IA — ZYNTRA'

interface TopBarProps {
  onOpenSearch?: () => void
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSearch }) => {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleMobile } = useSidebarCtx()

  const title = pageTitles[location.pathname] ?? 'Assistente WhatsApp'
  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'
  const isAIChat = location.pathname === '/app/ai-chat'

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
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {isAIChat && (
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
              Beta
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Cmd+K search trigger */}
        {onOpenSearch && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSearch}
            className="hidden sm:flex items-center gap-2 text-muted-foreground h-8 px-3 text-xs"
          >
            <Search className="w-3.5 h-3.5" />
            Buscar
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
              ⌘K
            </kbd>
          </Button>
        )}

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
