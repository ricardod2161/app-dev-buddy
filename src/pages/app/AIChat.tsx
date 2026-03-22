import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sparkles, Download, Send, BrainCircuit, Info, ChevronRight, X,
  Mic, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'

// Feature modules
import { parseActionsFromText } from '@/features/ai-chat/lib/parse-actions'
import { streamAIChat } from '@/features/ai-chat/lib/stream-chat'
import { exportConversationMD } from '@/features/ai-chat/lib/export-markdown'
import { executeActions } from '@/features/ai-chat/services/action-executor'
import { MessageBubble, type ChatMessage } from '@/features/ai-chat/components/MessageBubble'
import { ConversationSidebar, type AIConversation } from '@/features/ai-chat/components/ConversationSidebar'
import { ChatComposer } from '@/features/ai-chat/components/ChatComposer'
import { useVoiceInput } from '@/features/ai-chat/hooks/useVoiceInput'
import { useProactiveMode } from '@/features/ai-chat/hooks/useProactiveMode'

const MODELS = [
  { id: 'google/gemini-3-flash-preview', label: 'Flash Preview', badge: 'Rápido' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Balanceado' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Preciso' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', badge: 'OpenAI' },
]

const FALLBACK_PROMPTS = [
  'Quais são minhas tarefas mais urgentes hoje?',
  'Faça um resumo das minhas notas mais recentes',
  'Me ajuda a planejar minha semana com base nas minhas tarefas abertas',
  'Analisa minha produtividade e dá sugestões de melhoria',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

const AIChat: React.FC = () => {
  const { workspaceId } = useAuth()
  const location = useLocation()
  const qc = useQueryClient()

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [model, setModel] = useState('google/gemini-3-flash-preview')
  const [includeContext, setIncludeContext] = useState(true)
  const [deepThink, setDeepThink] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)
  const [contextLoaded, setContextLoaded] = useState<{ notes: number; tasks: number } | null>(null)
  const [proactiveMode, setProactiveMode] = useState(() => {
    try { return localStorage.getItem('zyntra_proactive_mode') !== 'false' } catch { return true }
  })
  const [convSearch, setConvSearch] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Persist proactive mode preference
  useEffect(() => {
    try { localStorage.setItem('zyntra_proactive_mode', String(proactiveMode)) } catch { /* ignore */ }
  }, [proactiveMode])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Handle incoming prompt from navigation state (Dashboard ZYNTRA card)
  useEffect(() => {
    const state = location.state as { prompt?: string } | null
    if (state?.prompt) {
      setInput(state.prompt)
      window.history.replaceState({}, '', location.pathname)
    }
  }, [location])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Voice input
  const { isListening, toggleListening } = useVoiceInput((transcript) => {
    setInput(prev => prev ? prev + ' ' + transcript : transcript)
  })

  // Load conversations
  const { data: conversations = [], isLoading: loadingConvs } = useQuery({
    queryKey: ['ai-conversations', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await sb
        .from('ai_conversations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AIConversation[]
    },
    enabled: !!workspaceId,
  })

  // Load context counts for banner
  useEffect(() => {
    if (!workspaceId || !includeContext) { setContextLoaded(null); return }
    Promise.all([
      supabase.from('notes').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['todo', 'doing']),
    ]).then(([n, t]) => {
      setContextLoaded({ notes: Math.min(n.count ?? 0, 5), tasks: Math.min(t.count ?? 0, 5) })
    })
  }, [workspaceId, includeContext])

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConvId || !workspaceId) return
    sb
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', selectedConvId)
      .neq('role', 'system')
      .order('created_at', { ascending: true })
      .then(({ data }: { data: Array<{ id: string; role: string; content: string }> | null }) => {
        if (data) {
          setChatMessages(data.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })))
        }
      })
  }, [selectedConvId, workspaceId])

  // Create conversation mutation
  const createConvMut = useMutation({
    mutationFn: async (firstMessage: string) => {
      if (!workspaceId) throw new Error('No workspace')
      const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + '…' : firstMessage
      const { data, error } = await sb
        .from('ai_conversations')
        .insert({ workspace_id: workspaceId, title, model })
        .select()
        .single()
      if (error) throw error
      return data as AIConversation
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] }),
  })

  const saveMessage = useCallback(async (convId: string, role: 'user' | 'assistant', content: string) => {
    if (!workspaceId) return
    await sb.from('ai_messages').insert({ conversation_id: convId, workspace_id: workspaceId, role, content })
  }, [workspaceId])

  const deleteConvMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('ai_conversations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] })
      if (selectedConvId === id) { setSelectedConvId(null); setChatMessages([]) }
    },
  })

  const handleNewChat = () => {
    setSelectedConvId(null)
    setChatMessages([])
    setInput('')
    window.speechSynthesis?.cancel()
    setMobileSidebarOpen(false)
  }

  const handleSelectConv = (id: string) => {
    setSelectedConvId(id)
    setChatMessages([])
    setMobileSidebarOpen(false)
  }

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || isStreaming || !workspaceId) return

    setInput('')

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', isStreaming: true }

    setChatMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    let convId = selectedConvId
    if (!convId) {
      try {
        const conv = await createConvMut.mutateAsync(text)
        convId = conv.id
        setSelectedConvId(conv.id)
      } catch {
        toast.error('Erro ao criar conversa')
        setIsStreaming(false)
        return
      }
    }

    await saveMessage(convId, 'user', text)

    const historyForAPI = [
      ...chatMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]

    const ctrl = new AbortController()
    abortRef.current = ctrl
    let accum = ''

    try {
      await streamAIChat({
        messages: historyForAPI,
        model: deepThink ? 'google/gemini-2.5-pro' : model,
        workspaceId,
        includeContext,
        deepThink,
        signal: ctrl.signal,
        onDelta: (chunk) => {
          accum += chunk
          const { cleanText } = parseActionsFromText(accum)
          setChatMessages(prev =>
            prev.map(m => m.id === assistantMsg.id ? { ...m, content: cleanText, isStreaming: true } : m)
          )
        },
        onDone: async () => {
          const { cleanText, actions } = parseActionsFromText(accum)
          setChatMessages(prev =>
            prev.map(m => m.id === assistantMsg.id
              ? { ...m, content: cleanText, isStreaming: false, actions: actions.length > 0 ? actions : undefined }
              : m
            )
          )
          setIsStreaming(false)

          if (actions.length > 0) {
            await executeActions(actions, workspaceId, (type) => {
              qc.invalidateQueries({ queryKey: [type, workspaceId] })
            })
          }

          if (convId) await saveMessage(convId, 'assistant', cleanText)
          await sb.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId)
          qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] })
        },
        onError: (err) => {
          toast.error(err)
          setChatMessages(prev => prev.filter(m => m.id !== assistantMsg.id))
          setIsStreaming(false)
        },
      })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error('Erro ao processar mensagem')
        setChatMessages(prev => prev.filter(m => m.id !== assistantMsg.id))
      }
      setIsStreaming(false)
    }
  }, [input, isStreaming, workspaceId, selectedConvId, chatMessages, model, includeContext, deepThink, createConvMut, saveMessage, qc])

  const handleRegenerate = useCallback(async () => {
    if (isStreaming || chatMessages.length < 2) return
    const lastUser = [...chatMessages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    setChatMessages(prev => prev.filter((_, i) => i < prev.length - 1))
    setInput(lastUser.content)
    setTimeout(() => handleSend(lastUser.content), 50)
  }, [isStreaming, chatMessages, handleSend])

  const handleStop = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setChatMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Proactive mode hook
  useProactiveMode({ workspaceId, proactiveMode, onTrigger: handleSend })

  // Dynamic suggested prompts
  const { data: urgentTasks } = useQuery({
    queryKey: ['ai-chat-urgent-tasks', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase
        .from('tasks')
        .select('title, priority, due_at')
        .eq('workspace_id', workspaceId)
        .in('status', ['todo', 'doing'])
        .order('priority', { ascending: false })
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(3)
      return data ?? []
    },
    enabled: !!workspaceId,
  })

  const suggestedPrompts = React.useMemo(() => {
    if (urgentTasks && urgentTasks.length > 0) {
      const dynamic = urgentTasks.map(t => `Me ajuda a concluir a tarefa: "${t.title}"`)
      if (urgentTasks.length >= 2) {
        dynamic.push(`Como priorizar: "${urgentTasks[0].title}" vs "${urgentTasks[1].title}"?`)
      } else {
        dynamic.push('Faça um resumo das minhas notas mais recentes')
      }
      return dynamic.slice(0, 4)
    }
    return FALLBACK_PROMPTS
  }, [urgentTasks])

  if (!workspaceId) {
    return <EmptyState title="Sem workspace" description="Faça login para usar o Chat IA." icon={MessageSquare} />
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border bg-card">
      {/* Conversation Sidebar — desktop panel + mobile Sheet */}
      <ConversationSidebar
        conversations={conversations}
        isLoading={loadingConvs}
        selectedConvId={selectedConvId}
        proactiveMode={proactiveMode}
        convSearch={convSearch}
        onSelectConv={handleSelectConv}
        onDeleteConv={(id) => deleteConvMut.mutate(id)}
        onNewChat={handleNewChat}
        onProactiveModeChange={setProactiveMode}
        onSearchChange={setConvSearch}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-card shrink-0 gap-2 sm:gap-3">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Mobile: open sidebar drawer */}
            <Button
              variant="ghost" size="icon" className="h-8 w-8 lg:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              title="Ver conversas"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
            {/* Desktop: toggle sidebar panel */}
            <Button
              variant="ghost" size="icon" className="h-8 w-8 hidden lg:flex"
              onClick={() => setDesktopSidebarOpen(v => !v)}
              title={desktopSidebarOpen ? 'Ocultar histórico' : 'Ver histórico'}
            >
              <ChevronRight className={cn('w-4 h-4 transition-transform', desktopSidebarOpen && 'rotate-180')} />
            </Button>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">ZYNTRA</span>
              <Badge variant="outline" className="text-xs py-0 hidden sm:inline-flex">IA</Badge>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {/* Context toggle */}
            <div className="hidden sm:flex items-center gap-1.5">
              <Switch id="ctx-toggle" checked={includeContext} onCheckedChange={setIncludeContext} className="scale-75" />
              <Label htmlFor="ctx-toggle" className="text-xs cursor-pointer whitespace-nowrap">Contexto</Label>
            </div>

            {/* Deep Think toggle */}
            <div className="flex items-center gap-1.5">
              <Switch id="dt-toggle" checked={deepThink} onCheckedChange={setDeepThink} className="scale-75" />
              <Label htmlFor="dt-toggle" className={cn('text-xs cursor-pointer flex items-center gap-1 whitespace-nowrap', deepThink && 'text-primary font-medium')}>
                <BrainCircuit className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Deep Think</span>
              </Label>
            </div>

            {/* Model selector */}
            <Select value={model} onValueChange={setModel} disabled={deepThink}>
              <SelectTrigger className="h-7 text-xs w-32 sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="text-xs">{m.label}</span>
                    <Badge variant="secondary" className="ml-1.5 text-[10px] py-0">{m.badge}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {chatMessages.length > 0 && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      const conv = conversations.find(c => c.id === selectedConvId)
                      exportConversationMD(conv?.title ?? 'conversa', chatMessages)
                    }}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar como Markdown
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat} title="Limpar chat">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Context / Deep Think banners */}
        {includeContext && contextLoaded && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-primary/10 text-xs text-primary">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              Contexto: <strong>{contextLoaded.notes} notas</strong> e{' '}
              <strong>{contextLoaded.tasks} tarefas abertas</strong> injetadas
            </span>
          </div>
        )}
        {deepThink && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border-b border-violet-500/20 text-xs text-violet-600 dark:text-violet-400">
            <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
            <strong>Deep Think ativo</strong> — usando Gemini 2.5 Pro com raciocínio em cadeia
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 max-w-lg mx-auto px-2">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Olá! Sou ZYNTRA ✨</h2>
                <p className="text-sm text-muted-foreground">
                  Seu assistente de produtividade inteligente. Posso criar tarefas, notas e lembretes por você.
                </p>
                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                  <Mic className="w-3.5 h-3.5" />
                  <span>Use o microfone para falar comigo</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt)}
                    className="text-left text-xs px-3 py-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isLast={i === chatMessages.length - 1}
                onRegenerate={!isStreaming ? handleRegenerate : undefined}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <ChatComposer
          input={input}
          isStreaming={isStreaming}
          isListening={isListening}
          deepThink={deepThink}
          textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          onToggleListening={toggleListening}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  )
}

export default AIChat
