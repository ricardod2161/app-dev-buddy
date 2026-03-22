import { supabase } from '@/integrations/supabase/client'

export interface StreamAIChatOptions {
  messages: { role: string; content: string }[]
  model: string
  workspaceId: string
  includeContext: boolean
  deepThink: boolean
  onDelta: (chunk: string) => void
  onDone: () => void
  onError: (err: string) => void
  signal: AbortSignal
}

export async function streamAIChat({
  messages,
  model,
  workspaceId,
  includeContext,
  deepThink,
  onDelta,
  onDone,
  onError,
  signal,
}: StreamAIChatOptions): Promise<void> {
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

  // Flush remaining buffer
  if (buffer.trim()) {
    for (const raw of buffer.split('\n')) {
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
