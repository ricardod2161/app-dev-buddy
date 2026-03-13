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
  Mic, MicOff, Volume2, VolumeX, CheckSquare, FileText, Bell,
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
  actions?: ParsedAction[]
}

interface ParsedAction {
  type: 'create_task' | 'create_note' | 'create_reminder'
  params: Record<string, string>
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Action Parser ────────────────────────────────────────────────────────────

/**
 * Parses [ACTION:type|key=value|key=value] blocks from AI text.
 * Returns { cleanText, actions }
 */
function parseActionsFromText(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = []
  const actionRegex = /\[ACTION:(create_task|create_note|create_reminder)\|([^\]]*)\]/gi

  const cleanText = text.replace(actionRegex, (_, type, paramsStr) => {
    const params: Record<string, string> = {}
    paramsStr.split('|').forEach((pair: string) => {
      const eqIdx = pair.indexOf('=')
      if (eqIdx > -1) {
        params[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim()
      }
    })
    actions.push({ type: type as ParsedAction['type'], params })
    return '' // strip from visible text
  }).trim()

  return { cleanText, actions }
}

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

// ─── TTS Button ──────────────────────────────────────────────────────────────

const TTSButton: React.FC<{ text: string }> = ({ text }) => {
  const [speaking, setSpeaking] = useState(false)

  const toggle = () => {
    if (!('speechSynthesis' in window)) {
      toast.error('Seu navegador não suporta síntese de voz')
      return
    }
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    // Strip markdown for cleaner speech
    const plainText = text
      .replace(/```[\s\S]*?```/g, ' trecho de código ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#{1,3} /gm, '')
      .replace(/^[-*•] /gm, '')
      .replace(/\[ACTION:[^\]]*\]/g, '')
      .trim()

    const utter = new SpeechSynthesisUtterance(plainText)
    utter.lang = 'pt-BR'
    utter.rate = 1.05
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utter)
    setSpeaking(true)
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        'p-1 rounded transition-colors',
        speaking
          ? 'text-primary bg-primary/10'
          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
      )}
      title={speaking ? 'Parar leitura' : 'Ouvir resposta'}
    >
      {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Action Badge ─────────────────────────────────────────────────────────────

const ActionBadge: React.FC<{ action: ParsedAction }> = ({ action }) => {
  const icons = {
    create_task: <CheckSquare className="w-3 h-3" />,
    create_note: <FileText className="w-3 h-3" />,
    create_reminder: <Bell className="w-3 h-3" />,
  }
  const labels = {
    create_task: `Tarefa: ${action.params.title ?? '—'}`,
    create_note: `Nota: ${action.params.title ?? '—'}`,
    create_reminder: `Lembrete: ${action.params.message ?? '—'}`,
  }
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary w-fit mt-1">
      {icons[action.type]}
      <span>{labels[action.type]}</span>
      <Badge variant="secondary" className="text-[9px] py-0 px-1">Executado ✓</Badge>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: ChatMessage
  onRegenerate?: () => void
  isLast?: boolean
}> = ({ msg, onRegenerate, isLast }) => {
  const isUser = msg.role === 'user'

  const renderContent = (content: string) => {
    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0

    const applyInline = (text: string, key: string | number): React.ReactNode => {
      const html = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background:hsl(var(--muted));padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.85em">$1</code>')
      return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />
    }

    while (i < lines.length) {
      const line = lines[i]

      // Fenced code block
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim()
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i])
          i++
        }
        elements.push(
          <div key={`code-${i}`} className="my-2 rounded-lg overflow-hidden border border-border">
            {lang && (
              <div className="flex items-center gap-2 px-3 py-1 bg-muted/80 border-b border-border">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{lang}</span>
              </div>
            )}
            <pre className="bg-muted/50 p-3 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre text-foreground">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        )
        i++
        continue
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(<h3 key={`h3-${i}`} className="text-sm font-semibold mt-3 mb-1 text-foreground">{applyInline(line.slice(4), `h3i-${i}`)}</h3>)
        i++; continue
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={`h2-${i}`} className="text-base font-bold mt-3 mb-1 text-foreground">{applyInline(line.slice(3), `h2i-${i}`)}</h2>)
        i++; continue
      }
      if (line.startsWith('# ')) {
        elements.push(<h1 key={`h1-${i}`} className="text-lg font-bold mt-3 mb-2 text-foreground">{applyInline(line.slice(2), `h1i-${i}`)}</h1>)
        i++; continue
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        elements.push(<hr key={`hr-${i}`} className="my-3 border-border" />)
        i++; continue
      }

      // Blockquote
      if (line.startsWith('> ')) {
        const quoteLines: string[] = []
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2))
          i++
        }
        elements.push(
          <blockquote key={`bq-${i}`} className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
            {quoteLines.map((ql, qi) => <p key={qi}>{applyInline(ql, qi)}</p>)}
          </blockquote>
        )
        continue
      }

      // Unordered list
      if (line.match(/^[-*•] /)) {
        const items: string[] = []
        while (i < lines.length && lines[i].match(/^[-*•] /)) {
          items.push(lines[i].replace(/^[-*•] /, ''))
          i++
        }
        elements.push(
          <ul key={`ul-${i}`} className="list-disc list-inside my-1 space-y-0.5 pl-2">
            {items.map((item, idx) => <li key={idx} className="text-sm">{applyInline(item, idx)}</li>)}
          </ul>
        )
        continue
      }

      // Ordered list
      if (line.match(/^\d+\. /)) {
        const items: string[] = []
        while (i < lines.length && lines[i].match(/^\d+\. /)) {
          items.push(lines[i].replace(/^\d+\. /, ''))
          i++
        }
        elements.push(
          <ol key={`ol-${i}`} className="list-decimal list-inside my-1 space-y-0.5 pl-2">
            {items.map((item, idx) => <li key={idx} className="text-sm">{applyInline(item, idx)}</li>)}
          </ol>
        )
        continue
      }

      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={`br-${i}`} className="h-1" />)
        i++; continue
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="text-sm leading-relaxed">{applyInline(line, `pi-${i}`)}</p>
      )
      i++
    }

    return elements
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

        {/* Action badges — shown after streaming completes */}
        {!msg.isStreaming && msg.actions && msg.actions.length > 0 && (
          <div className="flex flex-col gap-1 px-1">
            {msg.actions.map((a, idx) => <ActionBadge key={idx} action={a} />)}
          </div>
        )}

        <div className={cn(
          'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}>
          <CopyButton text={msg.content} />
          {!isUser && !msg.isStreaming && (
            <TTSButton text={msg.content} />
          )}
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
  const [proactiveMode, setProactiveMode] = useState(() => {
    try { return localStorage.getItem('zyntra_proactive_mode') !== 'false' } catch { return true }
  })
  const [convSearch, setConvSearch] = useState('')

  // Voice state
  const [isListening, setIsListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const proactiveTriggeredRef = useRef(false)

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── Voice input setup ──────────────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      toast.error('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionAPI() as any
    recognition.lang = 'pt-BR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => setIsListening(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput((prev: string) => (prev ? prev + ' ' + transcript : transcript))
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
      toast.error('Erro no reconhecimento de voz. Tente novamente.')
    }

    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
  }, [isListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  useEffect(() => {
    if (!selectedConvId || !workspaceId) return
    sb
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', selectedConvId)
      .neq('role', 'system')
      .order('created_at', { ascending: true })
      .then(({ data }: { data: AIMessage[] | null }) => {
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

  // Save message mutation
  const saveMessage = useCallback(async (
    convId: string,
    role: 'user' | 'assistant',
    content: string
  ) => {
    if (!workspaceId) return
    await sb
      .from('ai_messages')
      .insert({ conversation_id: convId, workspace_id: workspaceId, role, content })
  }, [workspaceId])

  // Delete conversation
  const deleteConvMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('ai_conversations')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] })
      if (selectedConvId === id) { setSelectedConvId(null); setChatMessages([]) }
    },
  })

  // ── Autonomous action executor ────────────────────────────────────────────
  const executeActions = useCallback(async (actions: ParsedAction[]) => {
    if (!workspaceId || actions.length === 0) return

    for (const action of actions) {
      try {
        if (action.type === 'create_task') {
          const { error } = await supabase.from('tasks').insert({
            workspace_id: workspaceId,
            title: action.params.title || 'Nova tarefa',
            priority: (action.params.priority as 'low' | 'medium' | 'high') || 'medium',
            status: 'todo',
            due_at: action.params.due || null,
            project: action.params.project || null,
          })
          if (!error) {
            qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
            toast.success(`✅ Tarefa criada: ${action.params.title}`)
          }
        } else if (action.type === 'create_note') {
          const { error } = await supabase.from('notes').insert({
            workspace_id: workspaceId,
            title: action.params.title || 'Nova nota',
            content: action.params.content || '',
            category: action.params.category || null,
          })
          if (!error) {
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
            toast.success(`📝 Nota criada: ${action.params.title}`)
          }
        } else if (action.type === 'create_reminder') {
          const remindAt = action.params.remind_at
            ? new Date(action.params.remind_at).toISOString()
            : new Date(Date.now() + 60 * 60 * 1000).toISOString()
          const { error } = await supabase.from('reminders').insert({
            workspace_id: workspaceId,
            message: action.params.message || 'Lembrete',
            title: action.params.title || null,
            channel: action.params.channel || 'whatsapp',
            remind_at: remindAt,
            status: 'scheduled',
          })
          if (!error) {
            qc.invalidateQueries({ queryKey: ['reminders', workspaceId] })
            toast.success(`🔔 Lembrete agendado!`)
          }
        }
      } catch (e) {
        console.error('Action execution error:', e)
      }
    }
  }, [workspaceId, qc])

  const handleNewChat = () => {
    setSelectedConvId(null)
    setChatMessages([])
    setInput('')
    window.speechSynthesis?.cancel()
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

          // Execute autonomous actions
          if (actions.length > 0) {
            await executeActions(actions)
          }

          if (convId) await saveMessage(convId, 'assistant', cleanText)
          // Update conversation updated_at
          await sb
            .from('ai_conversations')
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
  }, [input, isStreaming, workspaceId, selectedConvId, chatMessages, model, includeContext, deepThink, createConvMut, saveMessage, qc, executeActions])

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

  // ── Dynamic suggested prompts from real tasks ──────────────────────────────
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
      const dynamic = urgentTasks.map(t =>
        `Me ajuda a concluir a tarefa: "${t.title}"`
      )
      if (urgentTasks.length >= 2) {
        dynamic.push(`Como priorizar: "${urgentTasks[0].title}" vs "${urgentTasks[1].title}"?`)
      } else {
        dynamic.push('Faça um resumo das minhas notas mais recentes')
      }
      return dynamic.slice(0, 4)
    }
    return FALLBACK_PROMPTS
  }, [urgentTasks])

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
                  Seu assistente de produtividade inteligente. Posso criar tarefas, notas e lembretes por você.
                  Tenho acesso às suas notas e tarefas. Como posso te ajudar hoje?
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

        {/* Input area */}
        <div className="px-4 py-3 border-t border-border bg-card shrink-0">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            {/* Mic button */}
            <Button
              variant={isListening ? 'default' : 'outline'}
              size="icon"
              className={cn(
                'shrink-0 h-11 w-11 transition-all',
                isListening && 'animate-pulse ring-2 ring-primary ring-offset-2'
              )}
              onClick={toggleListening}
              disabled={isStreaming}
              title={isListening ? 'Parar gravação' : 'Falar com ZYNTRA (pt-BR)'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isListening
                    ? '🎙️ Ouvindo… fale agora'
                    : deepThink
                      ? 'Faça uma pergunta complexa para análise profunda…'
                      : 'Pergunte ou mande criar uma tarefa/nota/lembrete… (Enter para enviar)'
                }
                className="min-h-[44px] max-h-36 resize-none pr-2 text-sm"
                rows={1}
                disabled={isStreaming || isListening}
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
            ZYNTRA pode criar tarefas, notas e lembretes automaticamente. Verifique sempre as ações executadas.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AIChat
