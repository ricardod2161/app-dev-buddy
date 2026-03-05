import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, CheckSquare, BarChart3, MessageSquare,
  Settings, List, Hash, ScrollText, ChevronLeft, ChevronRight,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  label: string
  path: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
  { label: 'Notas', path: '/app/notes', icon: FileText },
  { label: 'Tarefas', path: '/app/tasks', icon: CheckSquare },
  { label: 'Relatórios', path: '/app/reports', icon: BarChart3 },
  { label: 'Conversas', path: '/app/conversations', icon: MessageSquare },
  { label: 'Integrações', path: '/app/integrations', icon: MessageCircle },
  { label: 'Whitelist', path: '/app/whitelist', icon: List },
  { label: 'Configurações', path: '/app/settings', icon: Settings },
  { label: 'Logs', path: '/app/logs', icon: ScrollText },
]

export const AppSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { workspace } = useAuth()

  return (
    <aside className={cn(
      'h-full bg-card border-r border-border flex flex-col transition-all duration-300 shrink-0',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center border-b border-border px-3 h-16 shrink-0',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Hash className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">
                {workspace?.name ?? 'Meu Workspace'}
              </p>
              <p className="text-xs text-muted-foreground">WhatsApp + Telegram</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={() => setCollapsed(prev => !prev)}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map(({ label, path, icon: Icon }) => {
          const isActive = path === '/app'
            ? location.pathname === '/app'
            : location.pathname.startsWith(path)

          const item = (
            <NavLink
              key={path}
              to={path}
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive
                  ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          )

          if (collapsed) {
            return (
              <Tooltip key={path} delayDuration={0}>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          }

          return item
        })}
      </nav>
    </aside>
  )
}
