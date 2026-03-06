import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, XCircle, Loader2, Send, Zap, BookOpen, Copy, ExternalLink } from 'lucide-react'

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string

interface IntegrationFormProps {
  provider: Integration['provider']
  integration?: Integration | null
  workspaceId: string
}

const IntegrationForm: React.FC<IntegrationFormProps> = ({ provider, integration, workspaceId }) => {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [simulatePayload, setSimulatePayload] = useState(
    JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '5511999990001@s.whatsapp.net', fromMe: false }, message: { conversation: 'anota: Teste de webhook simulado' } } }, null, 2)
  )

  const [apiUrl, setApiUrl] = useState(integration?.api_url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [instanceId, setInstanceId] = useState(integration?.instance_id ?? '')
  const [phoneNumber, setPhoneNumber] = useState(integration?.phone_number ?? '')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState(integration?.telegram_chat_id ?? '')
  const [isActive, setIsActive] = useState(integration?.is_active ?? false)

  const webhookWhatsappUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/webhook-whatsapp`
  const webhookTelegramUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/webhook-telegram`

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado!'))
  }

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
      if (provider === 'EVOLUTION' || provider === 'CLOUD') {
        if (!apiUrl || !instanceId) {
          toast.error('Preencha URL da API e Instance ID primeiro')
          return
        }
        const effectiveApiKey = apiKey || integration?.api_key_encrypted || ''
        const url = `${apiUrl.replace(/\/$/, '')}/instance/connectionState/${instanceId}`
        const res = await fetch(url, {
          headers: { 'apikey': effectiveApiKey },
        })
        if (res.ok) {
          const data = await res.json()
          const state = data?.instance?.state ?? data?.state ?? 'open'
          toast.success(`Conexão OK ✅ — Estado: ${state}`)
        } else {
          toast.error(`Erro ${res.status}: ${res.statusText}`)
        }
      } else if (provider === 'TELEGRAM') {
        const effectiveToken = botToken || integration?.telegram_bot_token_encrypted || ''
        if (!effectiveToken) {
          toast.error('Preencha o Bot Token primeiro')
          return
        }
        const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/getMe`)
        const data = await res.json()
        if (data.ok) {
          toast.success(`Bot OK ✅ — @${data.result.username}`)
        } else {
          toast.error(`Erro: ${data.description}`)
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? `Erro: ${e.message}` : 'Falha na conexão')
    } finally {
      setTestLoading(false)
    }
  }

  const autoConfigureWebhook = async () => {
    const effectiveToken = botToken || integration?.telegram_bot_token_encrypted || ''
    const secret = webhookSecret || integration?.webhook_secret || ''
    if (!effectiveToken) {
      toast.error('Preencha o Bot Token primeiro')
      return
    }
    setWebhookLoading(true)
    try {
      const body: Record<string, string> = { url: webhookTelegramUrl }
      if (secret) body.secret_token = secret
      const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Webhook configurado automaticamente! ✅')
      } else {
        toast.error(`Erro: ${data.description}`)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao configurar webhook')
    } finally {
      setWebhookLoading(false)
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
          ? <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Ativo</Badge>
          : <Badge variant="outline" className="text-muted-foreground"><XCircle className="w-3 h-3 mr-1" />Inativo</Badge>
        }
        <Button variant="outline" size="sm" onClick={() => setIsActive(v => !v)}>
          {isActive ? 'Desativar' : 'Ativar'}
        </Button>
      </div>

      {isEvolutionOrCloud && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>URL da API</Label>
            <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.evolution.com" className="mt-1" />
          </div>
          <div>
            <Label>API Key {integration && <span className="text-muted-foreground text-xs">(deixe em branco para manter)</span>}</Label>
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
            <Label>Webhook Secret {integration && <span className="text-muted-foreground text-xs">(deixe em branco para manter)</span>}</Label>
            <Input value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} type="password" placeholder="secret" className="mt-1" />
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">{webhookWhatsappUrl}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(webhookWhatsappUrl)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {provider === 'TELEGRAM' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Bot Token {integration && <span className="text-muted-foreground text-xs">(deixe em branco para manter)</span>}</Label>
            <Input value={botToken} onChange={e => setBotToken(e.target.value)} type="password" placeholder="123456:ABC..." className="mt-1" />
          </div>
          <div>
            <Label>Chat ID <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-100xxxxxxxxx" className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>Webhook Secret {integration && <span className="text-muted-foreground text-xs">(deixe em branco para manter)</span>}</Label>
            <Input value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} type="password" placeholder="secret" className="mt-1" />
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">{webhookTelegramUrl}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(webhookTelegramUrl)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
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
        {provider === 'TELEGRAM' && (
          <Button variant="outline" onClick={autoConfigureWebhook} disabled={webhookLoading}>
            {webhookLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
            Configurar Webhook Automaticamente
          </Button>
        )}
      </div>

      {/* Guide Accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem value="guide">
          <AccordionTrigger className="text-sm">
            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" />Como Configurar</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pt-2">
            {isEvolutionOrCloud && (
              <ol className="list-decimal list-inside space-y-2">
                <li>Tenha uma instância da <strong className="text-foreground">Evolution API</strong> rodando (self-hosted ou cloud)</li>
                <li>Preencha a <strong className="text-foreground">URL da API</strong> — ex: <code className="bg-muted px-1 rounded">https://sua-evolution.com</code></li>
                <li>Preencha a <strong className="text-foreground">API Key</strong> da sua instância</li>
                <li>Preencha o <strong className="text-foreground">Instance ID</strong> (nome da instância)</li>
                <li>Preencha o <strong className="text-foreground">Número</strong> no formato internacional: <code className="bg-muted px-1 rounded">+5511999990000</code></li>
                <li>Defina um <strong className="text-foreground">Webhook Secret</strong> (qualquer string segura)</li>
                <li>No painel da Evolution, configure o webhook com a URL acima e eventos: <code className="bg-muted px-1 rounded">messages.upsert</code></li>
                <li>Ative a integração e clique em <strong className="text-foreground">Salvar</strong></li>
              </ol>
            )}
            {provider === 'TELEGRAM' && (
              <ol className="list-decimal list-inside space-y-2">
                <li>Abra o <strong className="text-foreground">@BotFather</strong> no Telegram</li>
                <li>Envie <code className="bg-muted px-1 rounded">/newbot</code> e siga as instruções para criar o bot</li>
                <li>Copie o token gerado (ex: <code className="bg-muted px-1 rounded">123456789:ABCdef...</code>)</li>
                <li>Cole o token no campo <strong className="text-foreground">Bot Token</strong> acima</li>
                <li>Opcionalmente, defina um <strong className="text-foreground">Webhook Secret</strong> para segurança extra</li>
                <li>Clique em <strong className="text-foreground">Configurar Webhook Automaticamente</strong> — ou configure manualmente com a URL acima</li>
                <li>Ative a integração e clique em <strong className="text-foreground">Salvar</strong></li>
                <li>Envie <code className="bg-muted px-1 rounded">/start</code> para o bot para obtero Chat ID (se quiser enviar mensagens)</li>
              </ol>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Modal Simular Webhook */}
      <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Simular Webhook</DialogTitle>
            <DialogDescription>Edite o payload JSON e clique em Disparar para testar o fluxo</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Payload JSON</Label>
            <Textarea value={simulatePayload} onChange={e => setSimulatePayload(e.target.value)} rows={12} className="mt-1 font-mono text-xs" />
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
