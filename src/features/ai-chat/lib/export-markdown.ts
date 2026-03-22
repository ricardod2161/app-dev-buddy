import { toast } from 'sonner'

export interface ChatMessageForExport {
  role: 'user' | 'assistant'
  content: string
}

export function exportConversationMD(title: string, messages: ChatMessageForExport[]): void {
  const md = messages.map(m =>
    `## ${m.role === 'user' ? '👤 Você' : '🤖 ZYNTRA'}\n\n${m.content}`
  ).join('\n\n---\n\n')

  const blob = new Blob([`# ${title}\n\n${md}`], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
  a.click()
  toast.success('Conversa exportada!')
}
