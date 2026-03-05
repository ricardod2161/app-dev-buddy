import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Conversation, Message } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, MessageSquare, Headphones, Image, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

const typeIcon: Record<Message['type'], React.ReactNode> = {
  text: null,
  audio: <Headphones className="w-3 h-3" />,
  image: <Image className="w-3 h-3" />,
  file: <Paperclip className="w-3 h-3" />,
}

const ConversationsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('conversations').select('*')
        .eq('workspace_id', workspaceId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as Conversation[]
    },
    enabled: !!workspaceId,
  })

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ['messages', workspaceId, selectedId],
    queryFn: async () => {
      if (!workspaceId || !selectedId) return []
      const { data, error } = await supabase
        .from('messages').select('*')
        .eq('workspace_id', workspaceId)
        .eq('conversation_id', selectedId)
        .order('timestamp', { ascending: true })
      if (error) throw error
      return (data ?? []) as Message[]
    },
    enabled: !!workspaceId && !!selectedId,
  })

  const filteredConvs = (conversations ?? []).filter(c => {
    const q = search.toLowerCase()
    return !q
      || (c.contact_name ?? '').toLowerCase().includes(q)
      || c.contact_phone.includes(q)
  })

  const selectedConv = conversations?.find(c => c.id === selectedId)

  const filteredMessages = search
    ? (messages ?? []).filter(m => (m.body_text ?? '').toLowerCase().includes(search.toLowerCase()))
    : (messages ?? [])

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border rounded-xl overflow-hidden bg-card">
      {/* Lista de contatos */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar conversas..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs
            ? [...Array(5)].map((_, i) => <div key={i} className="p-3 border-b"><Skeleton className="h-12 w-full" /></div>)
            : filteredConvs.length === 0
              ? <p className="text-center text-muted-foreground p-6 text-sm">Nenhuma conversa</p>
              : filteredConvs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    'w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors',
                    selectedId === conv.id && 'bg-primary/10 border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">
                        {conv.contact_name ?? conv.contact_phone}
                      </p>
                      <div className="flex items-center gap-1">
                        <p className="text-xs text-muted-foreground truncate">{conv.contact_phone}</p>
                        <Badge variant="outline" className="text-xs shrink-0 scale-90">{conv.provider}</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              ))
          }
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-14 border-b border-border px-4 flex items-center">
              <div>
                <p className="font-semibold text-foreground text-sm">
                  {selectedConv?.contact_name ?? selectedConv?.contact_phone}
                </p>
                <p className="text-xs text-muted-foreground">{selectedConv?.contact_phone}</p>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMsgs
                ? [...Array(5)].map((_, i) => <Skeleton key={i} className={`h-12 w-56 ${i % 2 ? 'ml-auto' : ''}`} />)
                : filteredMessages.length === 0
                  ? <p className="text-center text-muted-foreground text-sm">Nenhuma mensagem</p>
                  : filteredMessages.map(msg => (
                    <div key={msg.id} className={cn('flex', msg.direction === 'OUT' ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[70%] rounded-2xl px-4 py-2 text-sm',
                        msg.direction === 'OUT'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      )}>
                        <div className="flex items-center gap-1">
                          {typeIcon[msg.type] && <span className="opacity-70">{typeIcon[msg.type]}</span>}
                          <p>{msg.body_text ?? `[${msg.type}]`}</p>
                        </div>
                        <p className={cn('text-xs mt-1', msg.direction === 'OUT' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground')}>
                          {msg.timestamp ? format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR }) : ''}
                        </p>
                      </div>
                    </div>
                  ))
              }
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ConversationsPage
