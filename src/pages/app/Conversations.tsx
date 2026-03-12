import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Conversation, Message } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, MessageSquare, Headphones, Image, Paperclip, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'

const typeIcon: Record<Message['type'], React.ReactNode> = {
  text: null,
  audio: <Headphones className="w-3 h-3" />,
  image: <Image className="w-3 h-3" />,
  file: <Paperclip className="w-3 h-3" />,
}

function getInitials(name: string | null, phone: string): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return phone.slice(-2)
}

function getAvatarColor(str: string): string {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
    'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-red-500',
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const ConversationsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  // Load last message per conversation for preview
  const { data: lastMessages } = useQuery({
    queryKey: ['last-messages', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return {}
      const { data } = await supabase
        .from('messages')
        .select('conversation_id, body_text, type, direction, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(100)
      const map: Record<string, { text: string; direction: string }> = {}
      for (const m of data ?? []) {
        if (!map[m.conversation_id]) {
          map[m.conversation_id] = {
            text: m.body_text ?? `[${m.type}]`,
            direction: m.direction,
          }
        }
      }
      return map
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

  // Real-time: invalidate queries when new messages arrive
  useEffect(() => {
    if (!workspaceId || !selectedId) return
    const channel = supabase
      .channel(`conv-messages-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['messages', workspaceId, selectedId] })
          qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, selectedId, qc])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredConvs = (conversations ?? []).filter(c => {
    const q = search.toLowerCase()
    return !q || (c.contact_name ?? '').toLowerCase().includes(q) || c.contact_phone.includes(q)
  })

  const selectedConv = conversations?.find(c => c.id === selectedId)

  const filteredMessages = search
    ? (messages ?? []).filter(m => (m.body_text ?? '').toLowerCase().includes(search.toLowerCase()))
    : (messages ?? [])

  const handleSelectConv = (id: string) => {
    setSelectedId(id)
    setMobileView('chat')
  }

  const handleBack = () => {
    setMobileView('list')
  }

  const listPanel = (
    <div className={cn(
      'w-full md:w-80 shrink-0 border-r border-border flex flex-col',
      // Mobile: show/hide based on mobileView
      mobileView === 'chat' ? 'hidden md:flex' : 'flex'
    )}>
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
            ? (
              <EmptyState
                icon={MessageSquare}
                title="Nenhuma conversa"
                description="Conversas aparecem aqui quando alguém envia uma mensagem."
              />
            )
            : filteredConvs.map(conv => {
              const initials = getInitials(conv.contact_name, conv.contact_phone)
              const avatarColor = getAvatarColor(conv.contact_phone)
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                  className={cn(
                    'w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors',
                    selectedId === conv.id && 'bg-primary/10 border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold',
                      avatarColor
                    )}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-medium text-sm text-foreground truncate">
                          {conv.contact_name ?? conv.contact_phone}
                        </p>
                        {conv.last_message_at && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(conv.last_message_at), 'dd/MM', { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate flex-1">
                          {lastMessages?.[conv.id]
                            ? (
                              <>
                                {lastMessages[conv.id].direction === 'OUT' && <span className="text-primary">↩ </span>}
                                {lastMessages[conv.id].text.length > 35
                                  ? lastMessages[conv.id].text.slice(0, 35) + '…'
                                  : lastMessages[conv.id].text}
                              </>
                            )
                            : conv.contact_phone}
                        </p>
                        <Badge variant="outline" className="text-xs shrink-0 scale-90">{conv.provider}</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
        }
      </div>
    </div>
  )

  const chatPanel = (
    <div className={cn(
      'flex-1 flex flex-col min-w-0',
      mobileView === 'list' ? 'hidden md:flex' : 'flex'
    )}>
      {!selectedId ? (
        <EmptyState
          icon={MessageSquare}
          title="Selecione uma conversa"
          description="Clique em uma conversa à esquerda para ver as mensagens."
          className="flex-1"
        />
      ) : (
        <>
          {/* Header */}
          <div className="h-14 border-b border-border px-3 sm:px-4 flex items-center gap-3 shrink-0">
            {/* Back button mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold',
              getAvatarColor(selectedConv?.contact_phone ?? '')
            )}>
              {getInitials(selectedConv?.contact_name ?? null, selectedConv?.contact_phone ?? '')}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm truncate">
                {selectedConv?.contact_name ?? selectedConv?.contact_phone}
              </p>
              <p className="text-xs text-muted-foreground">{selectedConv?.contact_phone}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
            {loadingMsgs
              ? [...Array(5)].map((_, i) => (
                <Skeleton key={i} className={cn('h-12 w-56', i % 2 ? 'ml-auto' : '')} />
              ))
              : filteredMessages.length === 0
                ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                  </div>
                )
                : filteredMessages.map(msg => (
                  <div key={msg.id} className={cn('flex', msg.direction === 'OUT' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                      msg.direction === 'OUT'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    )}>
                      <div className="flex items-center gap-1">
                        {typeIcon[msg.type] && <span className="opacity-70">{typeIcon[msg.type]}</span>}
                        <p className="break-words">{msg.body_text ?? `[${msg.type}]`}</p>
                      </div>
                      <p className={cn(
                        'text-xs mt-0.5',
                        msg.direction === 'OUT' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'
                      )}>
                        {msg.timestamp ? format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR }) : ''}
                      </p>
                    </div>
                  </div>
                ))
            }
            <div ref={messagesEndRef} />
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border rounded-xl overflow-hidden bg-card animate-slide-up">
      {listPanel}
      {chatPanel}
    </div>
  )
}

export default ConversationsPage
