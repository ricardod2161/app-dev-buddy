import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { AIConversation } from '@/features/ai-chat/components/ConversationSidebar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export function useAIConversations(workspaceId: string | null) {
  const qc = useQueryClient()

  const { data: conversations = [], isLoading } = useQuery({
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

  const deleteConvMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('ai_conversations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', workspaceId] })
    },
  })

  return {
    conversations,
    isLoading,
    deleteConv: (id: string) => deleteConvMut.mutate(id),
  }
}
