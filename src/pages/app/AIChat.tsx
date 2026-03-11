import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sparkles, Plus, Trash2, Copy, Check, RotateCcw, Download,
  Send, BrainCircuit, Info, ChevronRight, X, Loader2, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { EmptyState } from '@/components/EmptyState'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AIConversation {
  id: string
  workspace_id: string
  title: string
  model: string
  created_at: string
  updated_at: string
}

interface AIMessage {
  id: string
  conversation_id: string
  workspace_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { id: 'google/gemini-3-flash-preview', label: 'Flash Preview', badge: 'Rápido' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Balanceado' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Preciso' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', badge: 'OpenAI' },
]

const SUGGESTED_PROMPTS = [
  'Quais são minhas tarefas mais urgentes hoje?',
  'Faça um resumo das minhas notas mais recentes',
  'Me ajuda a planejar minha semana com base nas minhas tarefas abertas',
  'Analisa minha produtividade e dá sugestões de melhoria',
  'Crie um plano de ação para minhas tarefas em atraso',
  'Que tipo de projeto você acha que estou trabalhando com base nas minhas notas?',
]

// ─── Streaming helper ─────────────────────────────────────────────────────────

async function streamAIChat({
  messages,
  model,
  workspaceId,
  includeContext,
  deepThink,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: { role: string; content: string }[]
  model: string
  workspaceId: string
  includeContext: boolean
  deepThink: boolean
  onDelta: (chunk: string) => void
  onDone: () => void
  onError: (err: string) => void
  signal: AbortSignal
}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages,
        model,
        workspace_id: workspaceId,
        include_context: includeContext,
        deep_think: deepThink,
      }),
      signal,
    }
  )

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: 'Erro desconhecido' }))
    onError(data.error ?? `Erro HTTP ${resp.status}`)
    return
  }

  if (!resp.body) {
    onError('Stream vazio')
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false

  while (!done) {
    const { done: rdDone, value } = await reader.read()
    if (rdDone) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIdx)
      buffer = buffer.slice(newlineIdx + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (jsonStr === '[DONE]') { done = true; break }
      try {
        const parsed = JSON.parse(jsonStr)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch {
        buffer = line + '\n' + buffer
        break
      }
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    for (let raw of buffer.split('\n')) {
      if (!raw.startsWith('data: ')) continue
      const jsonStr = raw.slice(6).trim()
      if (jsonStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(jsonStr)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch { /* ignore */ }
    }
  }

  onDone()
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: ChatMessage
  onRegenerate?: () => void
  isLast?: boolean
}> = ({ msg, onRegenerate, isLast }) => {
  const isUser = msg.role === 'user'

  // Render markdown-like formatting
  const renderContent = (content: string) => {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      // Code block start/end handled simply
      if (line.startsWith('```')) {
        return <div key={i} className="font-mono text-xs bg-muted/50 rounded px-2 py-1 my-1">{line}</div>
      }
      // Bold
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-xs font-mono">$1</code>')
      return (
        <p
          key={i}
          className={cn('leading-relaxed', line.startsWith('# ') && 'font-bold text-base', line.startsWith('## ') && 'font-semibold')}
          dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }}
        />
      )
    })
  }

  return (
    <div className={cn('group flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      <div className={cn('max-w-[80%] flex flex-col gap-1', isUser && 'items-end')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm',
          msg.isStreaming && 'animate-pulse-subtle'
        )}>
          {msg.isStreaming && msg.content === '' ? (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            <div className="space-y-1">{renderContent(msg.content)}</div>
          )}
          {msg.isStreaming && msg.content !== '' && (
            <span className="inline-block w-0.5 h-4 bg-current animate-pulse ml-0.5 align-middle" />
          )}
        </div>
        <div className={cn(
          'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}>
          <CopyButton text={msg.content} />
          {!isUser && isLast && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Regenerar resposta"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-secondary-foreground">
          Eu
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AIChat: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [model, setModel] = useState('google/gemini-3-flash-preview')
  const [includeContext, setIncludeContext] = useState(true)
  const [deepThink, setDeepThink] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [contextLoaded, setContextLoaded] = useState<{ notes: number; tasks: number } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Load conversations
  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ['ai-conversations', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
    supabase
      .from('ai_messages' as never)
      .select('*')
      .eq('conversation_id', selectedConvId)
      .neq('role', 'system')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setChatMessages((data as AIMessage[]).map(m => ({
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
      const { data, error } = await supabase
        .from('ai_conversations' as never)
        .insert({ workspace_id: workspaceId, title, model })
        .select()
        .single()
      if (error) throw error
      return data as AIConversation
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] }),
  })

  // Save message mutation
  const saveMessage = useCallback(async (
    convId: string,
    role: 'user' | 'assistant',
    content: string
  ) => {
    if (!workspaceId) return
    await supabase
      .from('ai_messages' as never)
      .insert({ conversation_id: convId, workspace_id: workspaceId, role, content })
  }, [workspaceId])

  // Delete conversation
  const deleteConvMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_conversations' as never)
        .delete()
        .eq('id', id)
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
  }

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || isStreaming || !workspaceId) return

    setInput('')

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', isStreaming: true }

    setChatMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    // Create or reuse conversation
    let convId = selectedConvId
    if (!convId) {
      try {
        const conv = await createConvMut.mutateAsync(text)
        convId = conv.id
        setSelectedConvId(conv.id)
      } catch (e) {
        toast.error('Erro ao criar conversa')
        setIsStreaming(false)
        return
      }
    }

    // Save user message
    await saveMessage(convId, 'user', text)

    // Prepare messages for API (excluding streaming placeholder)
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
          setChatMessages(prev =>
            prev.map(m => m.id === assistantMsg.id ? { ...m, content: accum, isStreaming: true } : m)
          )
        },
        onDone: async () => {
          setChatMessages(prev =>
            prev.map(m => m.id === assistantMsg.id ? { ...m, content: accum, isStreaming: false } : m)
          )
          setIsStreaming(false)
          if (convId) await saveMessage(convId, 'assistant', accum)
          // Update conversation updated_at
          await supabase
            .from('ai_conversations' as never)
            .update({ updated_at: new Date().toISOString() })
            .eq('id', convId)
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
    // Remove last assistant message
    setChatMessages(prev => prev.filter((_, i) => i < prev.length - 1))
    setInput(lastUser.content)
    setTimeout(() => handleSend(lastUser.content), 50)
  }, [isStreaming, chatMessages, handleSend])

  const handleStop = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setChatMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m))
  }

  const handleExportMD = () => {
    const conv = conversations?.find(c => c.id === selectedConvId)
    const title = conv?.title ?? 'conversa'
    const md = chatMessages.map(m =>
      `## ${m.role === 'user' ? '👤 Você' : '🤖 ZYNTRA'}\n\n${m.content}`
    ).join('\n\n---\n\n')
    const blob = new Blob([`# ${title}\n\n${md}`], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click()
    toast.success('Conversa exportada!')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const suggestedPrompts = SUGGESTED_PROMPTS.slice(0, 4)

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border bg-card">
      {/* ── Left: Conversation List ── */}
      <div className={cn(
        'flex flex-col border-r border-border transition-all duration-300 shrink-0 bg-muted/20',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
      )}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Conversas IA</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleNewChat} title="Nova conversa">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loadingConvs
            ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 mx-2 my-1 rounded-lg" />)
            : (conversations ?? []).length === 0
              ? (
                <p className="text-xs text-muted-foreground text-center mt-6 px-3">
                  Nenhuma conversa ainda. Comece digitando abaixo!
                </p>
              )
              : (conversations ?? []).map(conv => (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-center gap-2 mx-1 px-2 py-2 rounded-lg cursor-pointer text-sm transition-colors',
                    selectedConvId === conv.id
                      ? 'bg-primary/10 text-foreground'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => { setSelectedConvId(conv.id); setChatMessages([]) }}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 truncate text-xs">{conv.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConvMut.mutate(conv.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
          }
        </div>
      </div>

      {/* ── Right: Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0 gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(v => !v)}
              title={sidebarOpen ? 'Ocultar histórico' : 'Ver histórico'}
            >
              <ChevronRight className={cn('w-4 h-4 transition-transform', sidebarOpen && 'rotate-180')} />
            </Button>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">ZYNTRA</span>
              <Badge variant="outline" className="text-xs py-0">IA</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Context toggle */}
            <div className="flex items-center gap-1.5">
              <Switch
                id="ctx-toggle"
                checked={includeContext}
                onCheckedChange={setIncludeContext}
                className="scale-75"
              />
              <Label htmlFor="ctx-toggle" className="text-xs cursor-pointer whitespace-nowrap">
                Contexto do app
              </Label>
            </div>

            {/* Deep Think toggle */}
            <div className="flex items-center gap-1.5">
              <Switch
                id="dt-toggle"
                checked={deepThink}
                onCheckedChange={setDeepThink}
                className="scale-75"
              />
              <Label htmlFor="dt-toggle" className={cn('text-xs cursor-pointer flex items-center gap-1 whitespace-nowrap', deepThink && 'text-primary font-medium')}>
                <BrainCircuit className="w-3.5 h-3.5" />
                Deep Think
              </Label>
            </div>

            {/* Model selector */}
            <Select value={model} onValueChange={setModel} disabled={deepThink}>
              <SelectTrigger className="h-7 text-xs w-40">
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

            {/* Export */}
            {chatMessages.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportMD}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar como Markdown
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Clear */}
            {chatMessages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat} title="Limpar chat">
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Context banner */}
        {includeContext && contextLoaded && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-primary/10 text-xs text-primary">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              Contexto carregado: <strong>{contextLoaded.notes} notas</strong> e{' '}
              <strong>{contextLoaded.tasks} tarefas abertas</strong> injetadas no sistema
            </span>
          </div>
        )}

        {deepThink && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border-b border-violet-500/20 text-xs text-violet-600 dark:text-violet-400">
            <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>Deep Think ativo</strong> — usando Gemini 2.5 Pro com raciocínio em cadeia
            </span>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 max-w-lg mx-auto">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Olá! Sou ZYNTRA ✨</h2>
                <p className="text-sm text-muted-foreground">
                  Seu assistente de produtividade inteligente. Tenho acesso às suas notas e tarefas.
                  Como posso te ajudar hoje?
                </p>
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

        {/* Input area */}
        <div className="px-4 py-3 border-t border-border bg-card shrink-0">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={deepThink ? 'Faça uma pergunta complexa para análise profunda…' : 'Pergunte algo ou peça uma análise… (Enter para enviar, Shift+Enter para nova linha)'}
                className="min-h-[44px] max-h-36 resize-none pr-2 text-sm"
                rows={1}
                disabled={isStreaming}
              />
            </div>
            {isStreaming ? (
              <Button variant="outline" size="icon" onClick={handleStop} className="shrink-0 h-11 w-11">
                <Loader2 className="w-4 h-4 animate-spin" />
              </Button>
            ) : (
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                size="icon"
                className="shrink-0 h-11 w-11"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-1.5">
            ZYNTRA pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AIChat
