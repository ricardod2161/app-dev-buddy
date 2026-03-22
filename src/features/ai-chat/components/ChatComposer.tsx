import React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Mic, MicOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatComposerProps {
  input: string
  isStreaming: boolean
  isListening: boolean
  deepThink: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onInputChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  onToggleListening: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  input, isStreaming, isListening, deepThink,
  textareaRef, onInputChange, onSend, onStop, onToggleListening, onKeyDown,
}) => {
  return (
    <div className="px-3 sm:px-4 py-3 border-t border-border bg-card shrink-0">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        {/* Mic button */}
        <Button
          variant={isListening ? 'default' : 'outline'}
          size="icon"
          className={cn(
            'shrink-0 h-11 w-11 transition-all',
            isListening && 'animate-pulse ring-2 ring-primary ring-offset-2'
          )}
          onClick={onToggleListening}
          disabled={isStreaming}
          title={isListening ? 'Parar gravação' : 'Falar com ZYNTRA (pt-BR)'}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
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
          <Button variant="outline" size="icon" onClick={onStop} className="shrink-0 h-11 w-11">
            <Loader2 className="w-4 h-4 animate-spin" />
          </Button>
        ) : (
          <Button
            onClick={onSend}
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
  )
}
