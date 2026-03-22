import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, CheckSquare, BarChart3, MessageSquare,
  Settings, List, Hash, ScrollText, ChevronLeft, ChevronRight,
  MessageCircle, X, Bell, Users, Sparkles, Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebarCtx } from '@/layouts/AppLayout'

interface NavItem {
  label: string
  path: string
  icon: React.ElementType
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
      { label: 'Notas', path: '/app/notes', icon: FileText },
      { label: 'Tarefas', path: '/app/tasks', icon: CheckSquare },
      { label: 'Lembretes', path: '/app/reminders', icon: Bell },
      { label: 'Chat IA', path: '/app/ai-chat', icon: Sparkles },
      { label: 'Minhas Finanças', path: '/app/finance', icon: Wallet },
    ],
  },
  {
    title: 'Comunicação',
    items: [
      { label: 'Conversas', path: '/app/conversations', icon: MessageSquare },
      { label: 'Contatos', path: '/app/contacts', icon: Users },
      { label: 'Relatórios', path: '/app/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Integrações', path: '/app/integrations', icon: MessageCircle },
      { label: 'Whitelist', path: '/app/whitelist', icon: List },
      { label: 'Configurações', path: '/app/settings', icon: Settings },
      { label: 'Logs', path: '/app/logs', icon: ScrollText },
    ],
  },
]

export const AppSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { workspace } = useAuth()
  const { mobileOpen, closeMobile } = useSidebarCtx()

  const isActive = (path: string) =>
    path === '/app' ? location.pathname === '/app' : location.pathname.startsWith(path)

  const renderNavItem = ({ label, path, icon: Icon }: NavItem) => {
    const active = isActive(path)

    const item = (
      <NavLink
        key={path}
        to={path}
        onClick={closeMobile}
        className={cn(
          'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          active
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
  }

  const nav = (
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
        <div className="flex items-center gap-1">
          {/* Close button on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0 h-8 w-8"
            onClick={closeMobile}
          >
            <X className="w-4 h-4" />
          </Button>
          {/* Collapse toggle on desktop */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex shrink-0 h-8 w-8"
            onClick={() => setCollapsed(prev => !prev)}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map(({ title, items }) => (
          <div key={title}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                {title}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:flex h-full">
        {nav}
      </div>

      {/* Mobile sidebar — slide-in overlay */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-30 lg:hidden transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {nav}
      </div>
    </>
  )
}
