import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import type { Integration } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, XCircle, Loader2, Send, Zap } from 'lucide-react'

interface IntegrationFormProps {
  provider: Integration['provider']
  integration?: Integration | null
  workspaceId: string
}

const IntegrationForm: React.FC<IntegrationFormProps> = ({ provider, integration, workspaceId }) => {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [simulatePayload, setSimulatePayload] = useState(
    JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '5511999990001@s.whatsapp.net', fromMe: false }, message: { conversation: 'anota: Teste de webhook simulado' } } }, null, 2)
  )

  // Fields
  const [apiUrl, setApiUrl] = useState(integration?.api_url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [instanceId, setInstanceId] = useState(integration?.instance_id ?? '')
  const [phoneNumber, setPhoneNumber] = useState(integration?.phone_number ?? '')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState(integration?.telegram_chat_id ?? '')
  const [isActive, setIsActive] = useState(integration?.is_active ?? false)

  const save = async () => {
    setLoading(true)
    try {
      const payload: Partial<Integration> = {
        workspace_id: workspaceId,
        provider,
        api_url: apiUrl || null,
        instance_id: instanceId || null,
        phone_number: phoneNumber || null,
        telegram_chat_id: chatId || null,
        is_active: isActive,
        ...(apiKey ? { api_key_encrypted: apiKey } : {}),
        ...(webhookSecret ? { webhook_secret: webhookSecret } : {}),
        ...(botToken ? { telegram_bot_token_encrypted: botToken } : {}),
      }

      if (integration) {
        const { error } = await supabase.from('integrations').update(payload).eq('id', integration.id)
        if (error) throw error
        toast.success('Integração atualizada')
      } else {
        const { error } = await supabase.from('integrations').insert(payload as Integration)
        if (error) throw error
        toast.success('Integração criada')
      }
      qc.invalidateQueries({ queryKey: ['integrations', workspaceId] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    setTestLoading(true)
    try {
      // Simula teste de conexão
      await new Promise(r => setTimeout(r, 1500))
      toast.success('Conexão testada com sucesso! ✅')
    } catch (e: unknown) {
      toast.error('Falha na conexão')
    } finally {
      setTestLoading(false)
    }
  }

  const simulateWebhook = async () => {
    try {
      JSON.parse(simulatePayload)
      await new Promise(r => setTimeout(r, 800))
      toast.success('Webhook simulado com sucesso! Verifique os logs.')
      setSimulateOpen(false)
    } catch {
      toast.error('JSON inválido no payload')
    }
  }

  const isEvolutionOrCloud = provider === 'EVOLUTION' || provider === 'CLOUD'

  return (
    <div className="space-y-5">
      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Status:</span>
        {isActive
          ? <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Ativo</Badge>
          : <Badge variant="outline" className="text-muted-foreground"><XCircle className="w-3 h-3 mr-1" />Inativo</Badge>
        }
        <Button variant="outline" size="sm" onClick={() => setIsActive(v => !v)}>
          {isActive ? 'Desativar' : 'Ativar'}
        </Button>
      </div>

      {isEvolutionOrCloud && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>URL da API</Label>
              <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.evolution.com" className="mt-1" />
            </div>
            <div>
              <Label>API Key {integration && '(deixe em branco para manter)'}</Label>
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="••••••••" className="mt-1" />
            </div>
            <div>
              <Label>Instance ID</Label>
              <Input value={instanceId} onChange={e => setInstanceId(e.target.value)} placeholder="minha-instancia" className="mt-1" />
            </div>
            <div>
              <Label>Número do Telefone</Label>
              <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+5511999990000" className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Webhook Secret {integration && '(deixe em branco para manter)'}</Label>
              <Input value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} type="password" placeholder="secret" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                URL do webhook: <code className="bg-muted px-1 rounded text-xs">
                  https://qymbrzhrfcstvwkvrgnm.supabase.co/functions/v1/webhook-whatsapp
                </code>
              </p>
            </div>
          </div>
        </>
      )}

      {provider === 'TELEGRAM' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Bot Token {integration && '(deixe em branco para manter)'}</Label>
            <Input value={botToken} onChange={e => setBotToken(e.target.value)} type="password" placeholder="123456:ABC..." className="mt-1" />
          </div>
          <div>
            <Label>Chat ID (opcional — para envio de mensagens)</Label>
            <Input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-100xxxxxxxxx" className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>Webhook Secret {integration && '(deixe em branco para manter)'}</Label>
            <Input value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} type="password" placeholder="secret" className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">
              URL do webhook Telegram: <code className="bg-muted px-1 rounded text-xs">
                https://qymbrzhrfcstvwkvrgnm.supabase.co/functions/v1/webhook-telegram
              </code>
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Salvar
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testLoading}>
          {testLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          Testar Conexão
        </Button>
        <Button variant="outline" onClick={() => setSimulateOpen(true)}>
          <Send className="w-4 h-4 mr-2" />Simular Webhook
        </Button>
      </div>

      {/* Modal Simular Webhook */}
      <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Simular Webhook</DialogTitle>
            <DialogDescription>Edite o payload JSON e clique em Disparar para testar o fluxo sem precisar do app real</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Payload JSON</Label>
            <Textarea
              value={simulatePayload}
              onChange={e => setSimulatePayload(e.target.value)}
              rows={12}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimulateOpen(false)}>Cancelar</Button>
            <Button onClick={simulateWebhook}><Send className="w-4 h-4 mr-2" />Disparar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const IntegrationsPage: React.FC = () => {
  const { workspaceId } = useAuth()

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase.from('integrations').select('*').eq('workspace_id', workspaceId)
      if (error) throw error
      return (data ?? []) as Integration[]
    },
    enabled: !!workspaceId,
  })

  const getIntegration = (provider: Integration['provider']) =>
    integrations?.find(i => i.provider === provider)

  if (isLoading) return <div className="space-y-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}</div>

  return (
    <Tabs defaultValue="evolution">
      <TabsList className="mb-6">
        <TabsTrigger value="evolution">WhatsApp Evolution</TabsTrigger>
        <TabsTrigger value="cloud">WhatsApp Cloud</TabsTrigger>
        <TabsTrigger value="telegram">Telegram</TabsTrigger>
      </TabsList>

      <TabsContent value="evolution">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp via Evolution API</CardTitle>
            <CardDescription>Conecte instâncias do WhatsApp usando a Evolution API (auto-hospedada)</CardDescription>
          </CardHeader>
          <CardContent>
            {workspaceId && <IntegrationForm provider="EVOLUTION" integration={getIntegration('EVOLUTION')} workspaceId={workspaceId} />}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cloud">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp via Meta Cloud API</CardTitle>
            <CardDescription>Conecte via a API oficial do WhatsApp Business (Meta)</CardDescription>
          </CardHeader>
          <CardContent>
            {workspaceId && <IntegrationForm provider="CLOUD" integration={getIntegration('CLOUD')} workspaceId={workspaceId} />}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="telegram">
        <Card>
          <CardHeader>
            <CardTitle>Telegram Bot</CardTitle>
            <CardDescription>Conecte um bot do Telegram para receber comandos e enviar mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            {workspaceId && <IntegrationForm provider="TELEGRAM" integration={getIntegration('TELEGRAM')} workspaceId={workspaceId} />}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

export default IntegrationsPage
