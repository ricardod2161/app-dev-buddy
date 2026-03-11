import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard, FileText, CheckSquare, Bell, MessageSquare,
  Users, BarChart3, MessageCircle, List, Settings, ScrollText,
  Sparkles,
} from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app', icon: LayoutDashboard, group: 'Navegação' },
  { label: 'Notas', path: '/app/notes', icon: FileText, group: 'Navegação' },
  { label: 'Tarefas', path: '/app/tasks', icon: CheckSquare, group: 'Navegação' },
  { label: 'Lembretes', path: '/app/reminders', icon: Bell, group: 'Navegação' },
  { label: 'Chat IA (ZYNTRA)', path: '/app/ai-chat', icon: Sparkles, group: 'IA & Comunicação' },
  { label: 'Conversas WhatsApp', path: '/app/conversations', icon: MessageSquare, group: 'IA & Comunicação' },
  { label: 'Contatos', path: '/app/contacts', icon: Users, group: 'IA & Comunicação' },
  { label: 'Relatórios', path: '/app/reports', icon: BarChart3, group: 'IA & Comunicação' },
  { label: 'Integrações', path: '/app/integrations', icon: MessageCircle, group: 'Sistema' },
  { label: 'Whitelist', path: '/app/whitelist', icon: List, group: 'Sistema' },
  { label: 'Configurações', path: '/app/settings', icon: Settings, group: 'Sistema' },
  { label: 'Logs de Webhook', path: '/app/logs', icon: ScrollText, group: 'Sistema' },
]

const GROUPS = ['Navegação', 'IA & Comunicação', 'Sistema']

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange }) => {
  const navigate = useNavigate()

  const handleSelect = useCallback((path: string) => {
    navigate(path)
    onOpenChange(false)
  }, [navigate, onOpenChange])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Para onde deseja ir? Digite para buscar…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        {GROUPS.map((group, gi) => {
          const items = NAV_ITEMS.filter(i => i.group === group)
          return (
            <React.Fragment key={group}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map(item => (
                  <CommandItem
                    key={item.path}
                    value={item.label}
                    onSelect={() => handleSelect(item.path)}
                    className="cursor-pointer"
                  >
                    <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

export default CommandPalette
