import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users, Plus, Search, Pencil, Trash2, RefreshCw, Phone,
  MessageSquare, Loader2,
} from 'lucide-react'

interface Contact {
  id: string
  workspace_id: string
  phone_e164: string
  name: string
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

interface ContactWithConv extends Contact {
  last_seen?: string | null
  conversation_id?: string | null
}

const contactSchema = z.object({
  phone_e164: z
    .string()
    .min(1, 'Telefone obrigatório')
    .regex(/^\+?[\d\s\-().]{7,20}$|^tg:\d+$/, 'Número inválido. Use +5511999999999 ou tg:123456789'),
  name: z.string().min(1, 'Nome obrigatório').max(100),
  notes: z.string().max(500).optional(),
})

type ContactForm = z.infer<typeof contactSchema>

function normalizePhone(raw: string): string {
  if (raw.startsWith('tg:')) return raw
  const digits = raw.replace(/[^\d+]/g, '')
  return digits.startsWith('+') ? digits : `+${digits}`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const avatarColors = [
  'bg-primary/20 text-primary',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
]

function getAvatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

const ContactsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editContact, setEditContact] = useState<ContactWithConv | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // ── Fetch contacts + conversations join ──────────────────────────────────
  const { data: contacts, isLoading } = useQuery<ContactWithConv[]>({
    queryKey: ['contacts', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const [{ data: ctcts }, { data: convs }] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('name', { ascending: true }),
        supabase
          .from('conversations')
          .select('id, contact_phone, last_message_at')
          .eq('workspace_id', workspaceId),
      ])
      const convMap: Record<string, { id: string; last_message_at: string | null }> = {}
      for (const c of convs ?? []) {
        convMap[c.contact_phone] = { id: c.id, last_message_at: c.last_message_at }
      }
      return (ctcts ?? []).map((c) => ({
        ...c,
        tags: (c.tags as string[]) ?? [],
        last_seen: convMap[c.phone_e164]?.last_message_at ?? null,
        conversation_id: convMap[c.phone_e164]?.id ?? null,
      }))
    },
    enabled: !!workspaceId,
  })

  const filtered = contacts?.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone_e164.includes(search)
  ) ?? []

  // ── Add / Edit form ───────────────────────────────────────────────────────
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { phone_e164: '', name: '', notes: '' },
  })

  const resetAndOpen = () => {
    form.reset({ phone_e164: '', name: '', notes: '' })
    setAddOpen(true)
  }

  const openEdit = (c: ContactWithConv) => {
    setEditContact(c)
    form.reset({ phone_e164: c.phone_e164, name: c.name, notes: c.notes ?? '' })
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (data: ContactForm) => {
      const phone = normalizePhone(data.phone_e164)
      const { error } = await supabase.from('contacts').insert({
        workspace_id: workspaceId!,
        phone_e164: phone,
        name: data.name.trim(),
        notes: data.notes?.trim() || null,
      })
      if (error) {
        if (error.code === '23505') throw new Error('Este número já está cadastrado.')
        throw error
      }
      // Auto-update conversation contact_name if exists
      await supabase
        .from('conversations')
        .update({ contact_name: data.name.trim() })
        .eq('workspace_id', workspaceId!)
        .eq('contact_phone', phone)
    },
    onSuccess: () => {
      toast.success('Contato adicionado!')
      qc.invalidateQueries({ queryKey: ['contacts', workspaceId] })
      qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
      setAddOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const editMutation = useMutation({
    mutationFn: async (data: ContactForm) => {
      if (!editContact) return
      const { error } = await supabase
        .from('contacts')
        .update({ name: data.name.trim(), notes: data.notes?.trim() || null })
        .eq('id', editContact.id)
      if (error) throw error
      // Sync conversation name
      await supabase
        .from('conversations')
        .update({ contact_name: data.name.trim() })
        .eq('workspace_id', workspaceId!)
        .eq('contact_phone', editContact.phone_e164)
    },
    onSuccess: () => {
      toast.success('Contato atualizado!')
      qc.invalidateQueries({ queryKey: ['contacts', workspaceId] })
      qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
      setEditContact(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Contato removido.')
      qc.invalidateQueries({ queryKey: ['contacts', workspaceId] })
      setDeleteId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Sync from conversations ───────────────────────────────────────────────
  const syncFromConversations = async () => {
    if (!workspaceId) return
    setSyncing(true)
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select('contact_phone, contact_name')
        .eq('workspace_id', workspaceId)
        .not('contact_name', 'is', null)

      const existingPhones = new Set(contacts?.map((c) => c.phone_e164) ?? [])
      const toImport = (convs ?? []).filter(
        (c) => c.contact_name && !existingPhones.has(c.contact_phone)
      )

      if (!toImport.length) {
        toast.info('Nenhuma conversa nova para importar.')
        return
      }

      const { error } = await supabase.from('contacts').insert(
        toImport.map((c) => ({
          workspace_id: workspaceId,
          phone_e164: c.contact_phone,
          name: c.contact_name!,
        }))
      )
      if (error) throw error
      toast.success(`${toImport.length} contato(s) importado(s)!`)
      qc.invalidateQueries({ queryKey: ['contacts', workspaceId] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const onSubmit = (data: ContactForm) => {
    if (editContact) editMutation.mutate(data)
    else addMutation.mutate(data)
  }

  const isSubmitting = addMutation.isPending || editMutation.isPending

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou número..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={syncFromConversations} disabled={syncing} size="sm">
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Sincronizar Conversas</span>
          </Button>
          <Button onClick={resetAndOpen} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Contato
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="secondary" className="gap-1.5">
          <Users className="w-3 h-3" />
          {contacts?.length ?? 0} contatos
        </Badge>
        {contacts?.filter((c) => c.last_seen).length ? (
          <Badge variant="outline" className="gap-1.5">
            <MessageSquare className="w-3 h-3" />
            {contacts?.filter((c) => c.last_seen).length} com conversa
          </Badge>
        ) : null}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">
                {search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search
                  ? 'Tente outro nome ou número'
                  : 'Adicione um contato manualmente ou sincronize suas conversas existentes.'}
              </p>
            </div>
            {!search && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={syncFromConversations} disabled={syncing}>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Sincronizar Conversas
                </Button>
                <Button onClick={resetAndOpen}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Adicionar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((contact) => (
            <Card key={contact.id} className="hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${getAvatarColor(contact.name)}`}>
                    {getInitials(contact.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold truncate">{contact.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1 text-xs mt-0.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span className="truncate">{contact.phone_e164}</span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(contact)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => setDeleteId(contact.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {(contact.notes || contact.last_seen) && (
                <CardContent className="pt-0 space-y-2">
                  {contact.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{contact.notes}</p>
                  )}
                  {contact.last_seen && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="w-3 h-3 text-primary/60" />
                      Última mensagem:{' '}
                      {format(new Date(contact.last_seen), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={addOpen || !!editContact}
        onOpenChange={(o) => {
          if (!o) { setAddOpen(false); setEditContact(null); form.reset() }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="phone_e164"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de telefone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="+5511999999999 ou tg:123456789"
                        disabled={!!editContact}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: João Silva" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Contexto extra, cargo, empresa..."
                        className="resize-none min-h-[80px]"
                        maxLength={500}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setAddOpen(false); setEditContact(null); form.reset() }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editContact ? 'Salvar' : 'Adicionar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá o nome deste número. As conversas existentes não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ContactsPage
