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
import { Plus, Trash2, List, AlertCircle, RefreshCw, Loader2, Info } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { EmptyState } from '@/components/EmptyState'

const phoneSchema = z.object({
  phone_e164: z.string()
    .transform(v => {
      // Auto-add + prefix for numeric-only WhatsApp numbers
      if (/^\d{7,15}$/.test(v)) return `+${v}`
      return v
    })
    .pipe(z.string().regex(
      /^(\+\d{7,15}|tg:-?\d{5,15})$/,
      'Formato inválido. Use +5511999990000 ou apenas 5511999990000 (WhatsApp) · tg:123456789 (Telegram)'
    )),
  label: z.string().optional(),
})

type PhoneForm = z.infer<typeof phoneSchema>

const WhitelistPage: React.FC = () => {
  const { workspaceId, loading: authLoading, refreshWorkspace } = useAuth()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<WhitelistNumber | null>(null)
  const [retrying, setRetrying] = useState(false)

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

  const handleRetry = async () => {
    setRetrying(true)
    await refreshWorkspace()
    setRetrying(false)
  }

  // Auth loading state
  if (authLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  // No workspace found
  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Workspace não encontrado</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Seu usuário não está associado a nenhum workspace. Clique em "Tentar novamente" para recuperar automaticamente.
        </p>
        <Button variant="outline" onClick={handleRetry} disabled={retrying}>
          {retrying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Info banner */}
      <div className="flex gap-3 p-4 rounded-xl border border-border bg-muted/40">
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm space-y-1">
          <p className="font-medium text-foreground">Como funciona a whitelist</p>
          <p className="text-muted-foreground">Adicione aqui os números autorizados a usar o assistente.</p>
          <ul className="text-muted-foreground space-y-0.5 list-none">
            <li>• <strong>Lista vazia:</strong> qualquer número pode interagir com o bot</li>
            <li>• <strong>Com números na lista:</strong> apenas eles são atendidos</li>
          </ul>
          <p className="text-muted-foreground pt-1">
            WhatsApp: <code className="bg-muted px-1 rounded text-xs">+5511999990000</code> ou <code className="bg-muted px-1 rounded text-xs">5511999990000</code>
            {' · '}Telegram: <code className="bg-muted px-1 rounded text-xs">tg:123456789</code>
          </p>
        </div>
      </div>

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
              <p className="text-xs text-muted-foreground mt-1">WhatsApp: <code>5511999990000</code> ou <code>+5511999990000</code> · Telegram: <code>tg:CHAT_ID</code></p>
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
