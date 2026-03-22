import { useState, useRef, useCallback } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { streamAIChat } from '@/features/ai-chat/lib/stream-chat'
import { parseActionsFromText } from '@/features/ai-chat/lib/parse-actions'
import { executeActions } from '@/features/ai-chat/services/action-executor'
import type { ChatMessage } from '@/features/ai-chat/components/MessageBubble'
import type { AIConversation } from '@/features/ai-chat/components/ConversationSidebar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export interface UseAIChatOptions {
  workspaceId: string | null
  selectedConvId: string | null
  setSelectedConvId: (id: string | null) => void
  model: string
  includeContext: boolean
  deepThink: boolean
  onConversationCreated?: () => void
}

export function useAIChat({
  workspaceId,
  selectedConvId,
  setSelectedConvId,
  model,
  includeContext,
  deepThink,
  onConversationCreated,
}: UseAIChatOptions) {
  const qc = useQueryClient()

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Create conversation
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] })
      onConversationCreated?.()
    },
  })

  const saveMessage = useCallback(async (convId: string, role: 'user' | 'assistant', content: string) => {
    if (!workspaceId) return
    await sb.from('ai_messages').insert({ conversation_id: convId, workspace_id: workspaceId, role, content })
  }, [workspaceId])

  const loadMessages = useCallback(async (convId: string) => {
    if (!convId || !workspaceId) return
    const { data } = await sb
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', convId)
      .neq('role', 'system')
      .order('created_at', { ascending: true })
    if (data) {
      setChatMessages(data.map((m: { id: string; role: string; content: string }) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })))
    }
  }, [workspaceId])

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

          if (actions.length > 0 && workspaceId) {
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

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setChatMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m))
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const clearMessages = useCallback(() => {
    setChatMessages([])
    setInput('')
    window.speechSynthesis?.cancel()
  }, [])

  return {
    chatMessages, setChatMessages,
    input, setInput,
    isStreaming,
    handleSend, handleRegenerate, handleStop, handleKeyDown,
    loadMessages, clearMessages,
  }
}
