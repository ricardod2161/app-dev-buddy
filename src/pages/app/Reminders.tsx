import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import * as chrono from 'chrono-node'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Bell, Plus, X, Loader2, Calendar, Phone, Clock } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

// ── Schema ───────────────────────────────────────────────────────────────────
const reminderSchema = z.object({
  title: z.string().optional(),
  message: z.string().min(1, 'Mensagem é obrigatória'),
  channel: z.enum(['whatsapp', 'telegram']),
  target_phone: z.string().optional(),
  remind_at: z.string().min(1, 'Data/hora é obrigatória'),
})
type ReminderForm = z.infer<typeof reminderSchema>

// ── Types ─────────────────────────────────────────────────────────────────────
interface Reminder {
  id: string
  workspace_id: string
  title: string | null
  message: string
  channel: string | null
  status: string | null
  target_phone: string | null
  remind_at: string
  error_message: string | null
  created_at: string | null
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'outline' | 'secondary' | 'destructive' }> = {
  scheduled: { label: 'Agendado', variant: 'default' },
  sent: { label: 'Enviado', variant: 'secondary' },
  canceled: { label: 'Cancelado', variant: 'outline' },
  error: { label: 'Erro', variant: 'destructive' },
}

const RemindersPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [naturalDate, setNaturalDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const form = useForm<ReminderForm>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      title: '',
      message: '',
      channel: 'whatsapp',
      target_phone: '',
      remind_at: '',
    },
  })

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders', workspaceId, filterStatus],
    queryFn: async () => {
      if (!workspaceId) return []
      let q = supabase.from('reminders').select('*').eq('workspace_id', workspaceId).order('remind_at', { ascending: true })
      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Reminder[]
    },
    enabled: !!workspaceId,
  })

  const handleNaturalDateChange = (value: string) => {
    setNaturalDate(value)
    const parsed = chrono.pt.parseDate(value, new Date(), { forwardDate: true })
    if (parsed) {
      const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16)
      form.setValue('remind_at', local, { shouldValidate: true })
    }
  }

  const handleOpen = () => {
    setNaturalDate('')
    form.reset({ title: '', message: '', channel: 'whatsapp', target_phone: '', remind_at: '' })
    setOpen(true)
  }

  const onSubmit = async (values: ReminderForm) => {
    if (!workspaceId) return
    const remindAt = new Date(values.remind_at).toISOString()
    if (new Date(remindAt) <= new Date()) {
      form.setError('remind_at', { message: 'A data deve ser no futuro' })
      return
    }
    try {
      const { error } = await supabase.from('reminders').insert({
        workspace_id: workspaceId,
        title: values.title || null,
        message: values.message,
        channel: values.channel,
        target_phone: values.target_phone || null,
        remind_at: remindAt,
        status: 'scheduled',
      })
      if (error) throw error
      toast.success('Lembrete agendado!')
      qc.invalidateQueries({ queryKey: ['reminders', workspaceId] })
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  const cancel = async (id: string) => {
    const { error } = await supabase.from('reminders').update({ status: 'canceled' }).eq('id', id)
    if (error) toast.error('Erro ao cancelar')
    else {
      toast.success('Lembrete cancelado')
      qc.invalidateQueries({ queryKey: ['reminders', workspaceId] })
    }
  }

  const deleteReminder = async (id: string) => {
    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) toast.error('Erro ao excluir')
    else {
      toast.success('Lembrete excluído')
      qc.invalidateQueries({ queryKey: ['reminders', workspaceId] })
    }
  }

  const currentRemindAt = form.watch('remind_at')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lembretes</h1>
          <p className="text-sm text-muted-foreground mt-1">Agende notificações via WhatsApp ou Telegram</p>
        </div>
        <Button onClick={handleOpen}>
          <Plus className="w-4 h-4 mr-2" />Novo Lembrete
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0">Filtrar:</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="scheduled">Agendados</SelectItem>
            <SelectItem value="sent">Enviados</SelectItem>
            <SelectItem value="canceled">Cancelados</SelectItem>
            <SelectItem value="error">Com Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !reminders?.length ? (
        <EmptyState
          icon={Bell}
          title="Nenhum lembrete"
          description="Crie um lembrete para ser notificado no horário certo via WhatsApp ou Telegram."
          action={{ label: 'Criar Lembrete', onClick: handleOpen }}
        />
      ) : (
        <div className="space-y-3">
          {reminders.map(r => {
            const cfg = statusConfig[r.status ?? 'scheduled'] ?? statusConfig.scheduled
            return (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.title && <span className="font-medium text-sm text-foreground">{r.title}</span>}
                        <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{r.channel}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{r.message}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(r.remind_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        {r.target_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{r.target_phone}
                          </span>
                        )}
                      </div>
                      {r.error_message && (
                        <p className="text-xs text-destructive">{r.error_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === 'scheduled' && (
                        <Button variant="outline" size="sm" onClick={() => cancel(r.id)}>
                          Cancelar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteReminder(r.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={v => { if (!v) setOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />Novo Lembrete
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Título (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Reunião com cliente" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="message" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensagem <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Texto que será enviado no lembrete..." rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="channel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canal</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="telegram">Telegram</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="target_phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone destino</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+5511999990000" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Natural language date */}
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-sm font-medium">
                  <Calendar className="w-3 h-3" />Data/hora em linguagem natural
                </Label>
                <Input
                  value={naturalDate}
                  onChange={e => handleNaturalDateChange(e.target.value)}
                  placeholder='Ex: "amanhã às 10h", "sexta às 15:30"'
                />
                {currentRemindAt && naturalDate && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Interpretado: {format(new Date(currentRemindAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>

              <FormField control={form.control} name="remind_at" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ou selecione data/hora manualmente</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      onChange={e => {
                        field.onChange(e)
                        setNaturalDate('')
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Agendando...</>
                    : <><Bell className="w-4 h-4 mr-2" />Agendar</>}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RemindersPage
