import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import * as chrono from 'chrono-node'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Bell, Plus, X, Loader2, Calendar, Phone, Clock } from 'lucide-react'
import EmptyState from '@/components/EmptyState'

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
  const [open, setOpen] = useState(false)
  const [naturalDate, setNaturalDate] = useState('')
  const [parsedDate, setParsedDate] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

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
      // Format as datetime-local value
      const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16)
      setParsedDate(local)
    } else {
      setParsedDate('')
    }
  }

  const resetForm = () => {
    setTitle('')
    setMessage('')
    setChannel('whatsapp')
    setPhone('')
    setNaturalDate('')
    setParsedDate('')
  }

  const save = async () => {
    if (!workspaceId) return
    if (!message.trim()) { toast.error('Mensagem obrigatória'); return }
    if (!parsedDate && !naturalDate) { toast.error('Data/hora obrigatória'); return }

    const remindAt = parsedDate
      ? new Date(parsedDate).toISOString()
      : new Date(naturalDate).toISOString()

    if (new Date(remindAt) <= new Date()) {
      toast.error('A data deve ser no futuro')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('reminders').insert({
        workspace_id: workspaceId,
        title: title || null,
        message,
        channel,
        target_phone: phone || null,
        remind_at: remindAt,
        status: 'scheduled',
      })
      if (error) throw error
      toast.success('Lembrete agendado!')
      qc.invalidateQueries({ queryKey: ['reminders', workspaceId] })
      setOpen(false)
      resetForm()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lembretes</h1>
          <p className="text-sm text-muted-foreground mt-1">Agende notificações via WhatsApp ou Telegram</p>
        </div>
        <Button onClick={() => setOpen(true)}>
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
          action={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />Criar Lembrete</Button>}
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
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />Novo Lembrete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título (opcional)</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Reunião com cliente" className="mt-1" />
            </div>
            <div>
              <Label>Mensagem <span className="text-destructive">*</span></Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Texto que será enviado no lembrete..." rows={3} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Canal</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Telefone destino</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511999990000" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />Data/hora em linguagem natural
              </Label>
              <Input
                value={naturalDate}
                onChange={e => handleNaturalDateChange(e.target.value)}
                placeholder='Ex: "amanhã às 10h", "sexta às 15:30"'
                className="mt-1"
              />
              {parsedDate && (
                <p className="text-xs text-primary mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Interpretado: {format(new Date(parsedDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>
            <div>
              <Label>Ou selecione data/hora manualmente</Label>
              <Input
                type="datetime-local"
                value={parsedDate}
                onChange={e => { setParsedDate(e.target.value); setNaturalDate('') }}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm() }}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RemindersPage
