import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Copy, Check, RotateCcw, Volume2, VolumeX, CheckSquare, FileText, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { ParsedAction } from '../lib/parse-actions'

// ─── Sub-components ──────────────────────────────────────────────────────────

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
        speaking ? 'text-primary bg-primary/10' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
      )}
      title={speaking ? 'Parar leitura' : 'Ouvir resposta'}
    >
      {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  )
}

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

// ─── ChatMessage type (local, minimal) ───────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  actions?: ParsedAction[]
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage
  onRegenerate?: () => void
  isLast?: boolean
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, onRegenerate, isLast }) => {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('group flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      <div className={cn('max-w-[85%] sm:max-w-[80%] flex flex-col gap-1', isUser && 'items-end')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm',
        )}>
          {msg.isStreaming && msg.content === '' ? (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            <div className="space-y-1">
              <MarkdownRenderer content={msg.content} />
            </div>
          )}
          {msg.isStreaming && msg.content !== '' && (
            <span className="inline-block w-0.5 h-4 bg-current animate-pulse ml-0.5 align-middle" />
          )}
        </div>

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
          {!isUser && !msg.isStreaming && <TTSButton text={msg.content} />}
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
