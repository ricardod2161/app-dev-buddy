import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { WhitelistNumber } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Plus, Trash2, List } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { EmptyState } from '@/components/EmptyState'

const phoneSchema = z.object({
  phone_e164: z.string().regex(
    /^(\+\d{7,15}|tg:-?\d{5,15})$/,
    'Formato inválido. Use +5511999990000 (WhatsApp) ou tg:123456789 (Telegram)'
  ),
  label: z.string().optional(),
})

type PhoneForm = z.infer<typeof phoneSchema>

const WhitelistPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<WhitelistNumber | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
  })

  const { data: whitelist, isLoading } = useQuery({
    queryKey: ['whitelist', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('whitelist_numbers').select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WhitelistNumber[]
    },
    enabled: !!workspaceId,
  })

  const addMutation = useMutation({
    mutationFn: async (data: PhoneForm) => {
      if (!workspaceId) throw new Error('Workspace não encontrado')
      const exists = whitelist?.some(w => w.phone_e164 === data.phone_e164)
      if (exists) throw new Error('Este número já está cadastrado')
      const { error } = await supabase.from('whitelist_numbers').insert({
        workspace_id: workspaceId,
        phone_e164: data.phone_e164,
        label: data.label || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Número adicionado à whitelist')
      qc.invalidateQueries({ queryKey: ['whitelist', workspaceId] })
      reset()
      setAddOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('whitelist_numbers').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whitelist', workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whitelist_numbers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Número removido')
      qc.invalidateQueries({ queryKey: ['whitelist', workspaceId] })
      setDeleteItem(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {whitelist?.length ?? 0} número(s) cadastrado(s)
        </p>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />Adicionar Número
        </Button>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (whitelist ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={List}
            title="Whitelist vazia"
            description="Adicione números para autorizar comandos via WhatsApp/Telegram."
            action={{ label: 'Adicionar Número', onClick: () => setAddOpen(true) }}
          />
        </Card>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Número</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Rótulo</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Adicionado em</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(whitelist ?? []).map(item => (
                  <tr key={item.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs sm:text-sm">{item.phone_e164}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{item.label ?? '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={checked => toggleMutation.mutate({ id: item.id, is_active: checked })}
                        />
                        <Badge variant={item.is_active ? 'default' : 'secondary'} className="text-xs hidden sm:inline-flex">
                          {item.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell">
                      {format(new Date(item.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteItem(item)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Adicionar */}
      <Dialog open={addOpen} onOpenChange={v => !v && (reset(), setAddOpen(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Whitelist</DialogTitle>
            <DialogDescription>Apenas números autorizados podem enviar comandos</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(d => addMutation.mutate(d))} className="space-y-4">
            <div>
              <Label>Número / ID *</Label>
              <Input {...register('phone_e164')} placeholder="+5511999990001 ou tg:123456789" className="mt-1 font-mono" />
              <p className="text-xs text-muted-foreground mt-1">WhatsApp: <code>+55...</code> · Telegram: <code>tg:CHAT_ID</code></p>
              {errors.phone_e164 && <p className="text-sm text-destructive mt-1">{errors.phone_e164.message}</p>}
            </div>
            <div>
              <Label>Rótulo (opcional)</Label>
              <Input {...register('label')} placeholder="Ex: João Silva" className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { reset(); setAddOpen(false) }}>Cancelar</Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={!!deleteItem} onOpenChange={v => !v && setDeleteItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Número</DialogTitle>
            <DialogDescription>Deseja remover <strong>{deleteItem?.phone_e164}</strong> da whitelist?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}>
              {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WhitelistPage
