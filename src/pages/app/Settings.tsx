import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import type { WorkspaceSettings } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { X, Plus, Save, Loader2, Search, Bot, Sparkles, Volume2, Sunrise, BrainCircuit, RefreshCw, TrendingUp } from 'lucide-react'

const BRIEFING_TIMES = [
  '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00',
]

const TTS_VOICES = [
  { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian', gender: 'Masculina' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George', gender: 'Masculina' },
  { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie', gender: 'Masculina' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam', gender: 'Masculina' },
  { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel', gender: 'Masculina' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', gender: 'Feminina' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura', gender: 'Feminina' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice', gender: 'Feminina' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda', gender: 'Feminina' },
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica', gender: 'Feminina' },
]

const SettingsPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['workspace-settings', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null
      const { data } = await supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).single()
      return data as WorkspaceSettings | null
    },
    enabled: !!workspaceId,
  })

  const { data: userMemory, refetch: refetchMemory } = useQuery({
    queryKey: ['user-memory', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null
      const { data } = await supabase
        .from('user_memory')
        .select('id, meta_diaria, total_guardado_mes, ultima_reserva_data, ultima_reserva_valor, mes_referencia')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      return data
    },
    enabled: !!workspaceId,
  })

  const [categories, setCategories] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [botFormat, setBotFormat] = useState<WorkspaceSettings['bot_response_format']>('medio')
  const [botName, setBotName] = useState('Assistente IA')
  const [botPersonality, setBotPersonality] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [language, setLanguage] = useState('pt-BR')
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [ttsVoiceId, setTtsVoiceId] = useState('nPczCjzI2devNBz1zQrb')
  const [dailyBriefingEnabled, setDailyBriefingEnabled] = useState(false)
  const [dailyBriefingTime, setDailyBriefingTime] = useState('07:00')
  const [newCategory, setNewCategory] = useState('')
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [tzSearch, setTzSearch] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaDiariaInput, setMetaDiariaInput] = useState('40')
  const [savingMemory, setSavingMemory] = useState(false)

  const markDirty = React.useCallback(() => setIsDirty(true), [])

  // Warn on navigation away with unsaved changes
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  React.useEffect(() => {
    if (settings) {
      setCategories((settings.default_categories as string[]) ?? [])
      setTags((settings.default_tags as string[]) ?? [])
      setBotFormat(settings.bot_response_format)
      setBotName(settings.bot_name ?? 'Assistente IA')
      setBotPersonality(settings.bot_personality ?? '')
      setTimezone(settings.timezone ?? 'America/Sao_Paulo')
      setLanguage(settings.language ?? 'pt-BR')
      setTtsEnabled(settings.tts_enabled ?? false)
      setTtsVoiceId(settings.tts_voice_id ?? 'nPczCjzI2devNBz1zQrb')
      setDailyBriefingEnabled(settings.daily_briefing_enabled ?? false)
      setDailyBriefingTime(settings.daily_briefing_time ?? '07:00')
      setIsDirty(false)
    }
  }, [settings])

  const allTimezones = useMemo(() =>
    (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'),
    []
  )

  const filteredTimezones = useMemo(() =>
    tzSearch
      ? allTimezones.filter(tz => tz.toLowerCase().includes(tzSearch.toLowerCase()))
      : allTimezones,
    [allTimezones, tzSearch]
  )

  const save = async () => {
    if (!workspaceId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('workspace_settings')
        .update({
          default_categories: categories,
          default_tags: tags,
          bot_response_format: botFormat,
          bot_name: botName,
          bot_personality: botPersonality.trim() || null,
          timezone,
          language,
          tts_enabled: ttsEnabled,
          tts_voice_id: ttsVoiceId,
          daily_briefing_enabled: dailyBriefingEnabled,
          daily_briefing_time: dailyBriefingTime,
        })
        .eq('workspace_id', workspaceId)
      if (error) throw error
      toast.success('Configurações salvas')
      qc.invalidateQueries({ queryKey: ['workspace-settings', workspaceId] })
      setIsDirty(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const saveMemory = async (newMeta?: number) => {
    if (!workspaceId) return
    setSavingMemory(true)
    try {
      const payload = { meta_diaria: (newMeta ?? (Number(metaDiariaInput) || 40)) }
      if (userMemory?.id) {
        await supabase.from('user_memory').update(payload).eq('workspace_id', workspaceId)
      } else {
        await supabase.from('user_memory').insert({ workspace_id: workspaceId, ...payload })
      }
      toast.success('Meta diária salva!')
      refetchMemory()
      setEditingMeta(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingMemory(false)
    }
  }

  const resetMonthlyTotal = async () => {
    if (!workspaceId) return
    setSavingMemory(true)
    try {
      await supabase
        .from('user_memory')
        .upsert({ workspace_id: workspaceId, total_guardado_mes: 0, mes_referencia: new Date().toISOString().slice(0, 7) }, { onConflict: 'workspace_id' })
      toast.success('Total do mês resetado para R$ 0,00')
      refetchMemory()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao resetar')
    } finally {
      setSavingMemory(false)
    }
  }

  if (isLoading) return (
    <div className="space-y-4 max-w-2xl">
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )

  const addCategory = () => {
    const v = newCategory.trim()
    if (v && !categories.includes(v)) { setCategories(prev => [...prev, v]); setNewCategory('') }
  }

  const addTag = () => {
    const v = newTag.trim()
    if (v && !tags.includes(v)) { setTags(prev => [...prev, v]); setNewTag('') }
  }

  const memTotalFmt = Number(userMemory?.total_guardado_mes ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const memMetaFmt = Number(userMemory?.meta_diaria ?? 40).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const memUltimaReserva = userMemory?.ultima_reserva_data
    ? new Date(userMemory.ultima_reserva_data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : '—'

  return (
    <div className="space-y-6 max-w-2xl animate-slide-up">
      {/* Unsaved changes banner */}
      {isDirty && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30">
          <span className="text-sm font-medium text-warning-foreground">⚠️ Você tem alterações não salvas</span>
        </div>
      )}
      {/* Nome do assistente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Nome do Assistente
          </CardTitle>
          <CardDescription>Como o bot se identificará nas conversas do WhatsApp/Telegram</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={botName}
            onChange={e => setBotName(e.target.value)}
            placeholder="Ex: Assistente IA, Copiloto, Max..."
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground mt-2">Este nome é usado no prompt do assistente e aparecerá nas respostas.</p>
        </CardContent>
      </Card>

      {/* Personalidade do bot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Personalidade Personalizada
          </CardTitle>
          <CardDescription>Instruções extras que definem o comportamento e tom do assistente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={botPersonality}
            onChange={e => setBotPersonality(e.target.value)}
            placeholder={`Exemplos:\n• "Seja mais formal e use linguagem profissional"\n• "Sempre sugira formas de economizar quando registrar gastos"\n• "Me chame pelo nome João e use um tom bem descontraído"\n• "Sempre pergunte se preciso de algo mais após cada ação"`}
            className="min-h-[120px] resize-none"
            maxLength={500}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Essas instruções são adicionadas ao prompt base do assistente, personalizando seu comportamento.
            </p>
            <span className="text-xs text-muted-foreground">{botPersonality.length}/500</span>
          </div>
        </CardContent>
      </Card>

      {/* Respostas em Áudio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            Respostas em Áudio
          </CardTitle>
          <CardDescription>Quando ativado, o bot responde com áudio de voz quando você enviar uma mensagem de áudio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ativar respostas em áudio</p>
              <p className="text-xs text-muted-foreground">O bot responde com áudio quando recebe um áudio ou quando você pedir</p>
            </div>
            <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
          </div>
          {ttsEnabled && (
            <div className="space-y-2">
              <Label>Voz do assistente</Label>
              <Select value={ttsVoiceId} onValueChange={setTtsVoiceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">🎙 Femininas</div>
                  {TTS_VOICES.filter(v => v.gender === 'Feminina').map(voice => (
                    <SelectItem key={voice.id} value={voice.id}>{voice.label}</SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">🎙 Masculinas</div>
                  {TTS_VOICES.filter(v => v.gender === 'Masculina').map(voice => (
                    <SelectItem key={voice.id} value={voice.id}>{voice.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Síntese de voz de alta qualidade — processado pelo gateway de IA</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Briefing Matinal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sunrise className="w-4 h-4 text-primary" />
            Briefing Matinal
          </CardTitle>
          <CardDescription>Todo dia de manhã o assistente te manda um áudio caloroso perguntando o que você quer fazer e listando suas pendências</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ativar briefing diário</p>
              <p className="text-xs text-muted-foreground">O bot te contata proativamente toda manhã no horário escolhido</p>
            </div>
            <Switch checked={dailyBriefingEnabled} onCheckedChange={setDailyBriefingEnabled} />
          </div>
          {dailyBriefingEnabled && (
            <div className="space-y-2">
              <Label>Horário do briefing</Label>
              <Select value={dailyBriefingTime} onValueChange={setDailyBriefingTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIEFING_TIMES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ttsEnabled
                  ? 'O briefing será enviado como áudio de voz (ElevenLabs) + texto'
                  : 'Ative as "Respostas em Áudio" acima para receber o briefing também como voz'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formato do bot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formato de Resposta do Bot</CardTitle>
          <CardDescription>Define o nível de detalhe das respostas automáticas</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={botFormat} onValueChange={v => setBotFormat(v as WorkspaceSettings['bot_response_format'])} className="space-y-3">
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
              <RadioGroupItem value="curto" id="curto" />
              <div>
                <Label htmlFor="curto" className="cursor-pointer font-medium">Curto</Label>
                <p className="text-xs text-muted-foreground">Resposta mínima e direta (1-2 linhas)</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
              <RadioGroupItem value="medio" id="medio" />
              <div>
                <Label htmlFor="medio" className="cursor-pointer font-medium">Médio</Label>
                <p className="text-xs text-muted-foreground">Informações essenciais com confirmação clara</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
              <RadioGroupItem value="detalhado" id="detalhado" />
              <div>
                <Label htmlFor="detalhado" className="cursor-pointer font-medium">Detalhado</Label>
                <p className="text-xs text-muted-foreground">Resposta completa com exemplos e sugestões</p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Categorias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias Padrão</CardTitle>
          <CardDescription>Categorias disponíveis para organizar suas notas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <Badge key={cat} variant="secondary" className="gap-1 px-3 py-1 text-sm">
                {cat}
                <button onClick={() => setCategories(prev => prev.filter(c => c !== cat))} className="ml-1 hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
              placeholder="Nova categoria..."
              className="flex-1"
            />
            <Button variant="outline" onClick={addCategory}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags Padrão</CardTitle>
          <CardDescription>Tags disponíveis para classificar notas e tarefas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <Badge key={tag} variant="outline" className="gap-1 px-3 py-1 text-sm">
                #{tag}
                <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="ml-1 hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Nova tag..."
              className="flex-1"
            />
            <Button variant="outline" onClick={addTag}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Localização */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Localização</CardTitle>
          <CardDescription>Fuso horário e idioma do workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Fuso Horário</Label>
            <Select value={timezone} onValueChange={v => { setTimezone(v); setTzSearch('') }}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <div className="sticky top-0 bg-popover p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={tzSearch}
                      onChange={e => setTzSearch(e.target.value)}
                      placeholder="Buscar fuso horário..."
                      className="pl-8 h-8 text-sm"
                      onKeyDown={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-48">
                  {filteredTimezones.slice(0, 100).map(tz => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                  {filteredTimezones.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{filteredTimezones.length - 100} resultados — refine a busca
                    </p>
                  )}
                </div>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Idioma</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">🇧🇷 Português (Brasil)</SelectItem>
                <SelectItem value="en-US">🇺🇸 English (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-primary" />
            Memória Financeira
          </CardTitle>
          <CardDescription>Total guardado, meta diária e última reserva — dados persistentes usados pelo assistente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" /> Total este mês
              </p>
              <p className="text-lg font-bold text-primary">{memTotalFmt}</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Meta diária</p>
              <p className="text-lg font-bold">{memMetaFmt}</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Última reserva</p>
              <p className="text-lg font-bold">{memUltimaReserva}</p>
            </div>
          </div>

          {/* Edit meta diária */}
          <div className="space-y-2">
            <Label>Meta diária de reserva (R$)</Label>
            {editingMeta ? (
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={metaDiariaInput}
                  onChange={e => setMetaDiariaInput(e.target.value)}
                  placeholder="40"
                  className="w-32"
                  min={1}
                />
                <Button size="sm" onClick={() => saveMemory()} disabled={savingMemory}>
                  {savingMemory ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingMeta(false)}>Cancelar</Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Atual: <strong>{memMetaFmt}</strong></span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setMetaDiariaInput(String(userMemory?.meta_diaria ?? 40)); setEditingMeta(true) }}
                >
                  Editar
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">O assistente usa essa meta ao registrar reservas e responder sobre "E os 40?"</p>
          </div>

          {/* Reset month */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="text-sm font-medium">Resetar total do mês</p>
              <p className="text-xs text-muted-foreground">Zera o total guardado — use no início de cada mês se necessário</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={resetMonthlyTotal}
              disabled={savingMemory}
              className="shrink-0"
            >
              {savingMemory ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Resetar mês
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} size="lg" className="w-full sm:w-auto">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Salvar Configurações
      </Button>
    </div>
  )
}

export default SettingsPage
