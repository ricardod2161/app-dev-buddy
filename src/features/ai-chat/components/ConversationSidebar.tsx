import React from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Sparkles, Plus, Trash2, Search, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AIConversation {
  id: string
  workspace_id: string
  title: string
  model: string
  created_at: string
  updated_at: string
}

interface ConversationSidebarProps {
  conversations: AIConversation[]
  isLoading: boolean
  selectedConvId: string | null
  proactiveMode: boolean
  convSearch: string
  onSelectConv: (id: string) => void
  onDeleteConv: (id: string) => void
  onNewChat: () => void
  onProactiveModeChange: (v: boolean) => void
  onSearchChange: (v: string) => void
  // Mobile drawer control
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const SidebarContent: React.FC<ConversationSidebarProps> = ({
  conversations, isLoading, selectedConvId, proactiveMode,
  convSearch, onSelectConv, onDeleteConv, onNewChat,
  onProactiveModeChange, onSearchChange,
}) => {
  const filtered = React.useMemo(() => {
    if (!convSearch.trim()) return conversations
    const q = convSearch.toLowerCase()
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, convSearch])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Conversas IA</span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onNewChat} title="Nova conversa">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Proactive mode toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-xs font-medium text-primary">Modo Proativo</span>
        </div>
        <Switch checked={proactiveMode} onCheckedChange={onProactiveModeChange} className="scale-75" />
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={convSearch}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar conversas…"
            className="w-full pl-7 pr-2 py-1 text-xs rounded-md bg-background border border-input focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading
          ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 mx-2 my-1 rounded-lg" />)
          : filtered.length === 0
            ? (
              <p className="text-xs text-muted-foreground text-center mt-6 px-3">
                {convSearch ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda. Comece digitando abaixo!'}
              </p>
            )
            : filtered.map(conv => (
              <div
                key={conv.id}
                className={cn(
                  'group flex items-center gap-2 mx-1 px-2 py-2 rounded-lg cursor-pointer text-sm transition-colors',
                  selectedConvId === conv.id
                    ? 'bg-primary/10 text-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
                onClick={() => onSelectConv(conv.id)}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate text-xs">{conv.title}</span>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteConv(conv.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
        }
      </div>
    </div>
  )
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = (props) => {
  const { mobileOpen, onMobileClose } = props

  return (
    <>
      {/* Desktop: always-visible panel */}
      <div className="hidden lg:flex flex-col w-64 border-r border-border shrink-0 bg-muted/20">
        <SidebarContent {...props} />
      </div>

      {/* Mobile: Sheet drawer */}
      <Sheet open={mobileOpen} onOpenChange={open => !open && onMobileClose?.()}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversas IA</SheetTitle>
          </SheetHeader>
          <SidebarContent {...props} />
        </SheetContent>
      </Sheet>
    </>
  )
}
