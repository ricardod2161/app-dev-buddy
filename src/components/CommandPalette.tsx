import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
  Sparkles, Search,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'

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

// Simple debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange }) => {
  const navigate = useNavigate()
  const { workspaceId } = useAuth()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 280)

  // Reset query when closed
  useEffect(() => {
    if (!open) setTimeout(() => setQuery(''), 200)
  }, [open])

  const handleSelect = useCallback((path: string) => {
    navigate(path)
    onOpenChange(false)
  }, [navigate, onOpenChange])

  // Live DB search — notes
  const { data: noteResults } = useQuery({
    queryKey: ['cmd-search-notes', workspaceId, debouncedQuery],
    queryFn: async () => {
      if (!workspaceId || debouncedQuery.length < 2) return []
      const { data } = await supabase
        .from('notes')
        .select('id, title, category')
        .eq('workspace_id', workspaceId)
        .ilike('title', `%${debouncedQuery}%`)
        .limit(5)
      return data ?? []
    },
    enabled: !!workspaceId && debouncedQuery.length >= 2,
    staleTime: 10_000,
  })

  // Live DB search — tasks
  const { data: taskResults } = useQuery({
    queryKey: ['cmd-search-tasks', workspaceId, debouncedQuery],
    queryFn: async () => {
      if (!workspaceId || debouncedQuery.length < 2) return []
      const { data } = await supabase
        .from('tasks')
        .select('id, title, status, priority')
        .eq('workspace_id', workspaceId)
        .ilike('title', `%${debouncedQuery}%`)
        .limit(5)
      return data ?? []
    },
    enabled: !!workspaceId && debouncedQuery.length >= 2,
    staleTime: 10_000,
  })

  const hasSearchResults = (noteResults?.length ?? 0) + (taskResults?.length ?? 0) > 0
  const isSearching = debouncedQuery.length >= 2

  // Filter nav items by query
  const filteredNavGroups = useMemo(() => {
    if (!query) return GROUPS
    return GROUPS.filter(group =>
      NAV_ITEMS.some(item => item.group === group && item.label.toLowerCase().includes(query.toLowerCase()))
    )
  }, [query])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Para onde deseja ir? Digite para buscar…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? 'Nenhum resultado encontrado.' : 'Digite para buscar…'}
        </CommandEmpty>

        {/* Live DB Results */}
        {isSearching && hasSearchResults && (
          <>
            {(noteResults?.length ?? 0) > 0 && (
              <CommandGroup heading="Notas encontradas">
                {noteResults!.map(note => (
                  <CommandItem
                    key={`note-${note.id}`}
                    value={`note-${note.id}-${note.title}`}
                    onSelect={() => handleSelect('/app/notes')}
                    className="cursor-pointer"
                  >
                    <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{note.title || '(sem título)'}</span>
                      {note.category && (
                        <span className="text-xs text-muted-foreground">{note.category}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(taskResults?.length ?? 0) > 0 && (
              <>
                {(noteResults?.length ?? 0) > 0 && <CommandSeparator />}
                <CommandGroup heading="Tarefas encontradas">
                  {taskResults!.map(task => (
                    <CommandItem
                      key={`task-${task.id}`}
                      value={`task-${task.id}-${task.title}`}
                      onSelect={() => handleSelect('/app/tasks')}
                      className="cursor-pointer"
                    >
                      <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{task.title}</span>
                        <span className="text-xs text-muted-foreground capitalize">{task.status} · {task.priority}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            <CommandSeparator />
          </>
        )}

        {/* Nav items — hidden when there are DB results and query is active */}
        {filteredNavGroups.map((group, gi) => {
          const items = NAV_ITEMS.filter(i => i.group === group).filter(
            item => !query || item.label.toLowerCase().includes(query.toLowerCase())
          )
          if (items.length === 0) return null
          return (
            <React.Fragment key={group}>
              {(gi > 0 || (isSearching && hasSearchResults)) && <CommandSeparator />}
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

        {/* Search hint */}
        {!isSearching && (
          <div className="py-2 px-3 text-xs text-muted-foreground flex items-center gap-1.5 border-t border-border">
            <Search className="w-3 h-3" />
            <span>Digite 2+ caracteres para buscar notas e tarefas</span>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  )
}

export default CommandPalette
