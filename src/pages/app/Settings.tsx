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
import { X, Plus, Save, Loader2, Search, Bot, Sparkles } from 'lucide-react'

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

  const [categories, setCategories] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [botFormat, setBotFormat] = useState<WorkspaceSettings['bot_response_format']>('medio')
  const [botName, setBotName] = useState('Assistente IA')
  const [botPersonality, setBotPersonality] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [language, setLanguage] = useState('pt-BR')
  const [newCategory, setNewCategory] = useState('')
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [tzSearch, setTzSearch] = useState('')

  React.useEffect(() => {
    if (settings) {
      setCategories((settings.default_categories as string[]) ?? [])
      setTags((settings.default_tags as string[]) ?? [])
      setBotFormat(settings.bot_response_format)
      setBotName(settings.bot_name ?? 'Assistente IA')
      setBotPersonality(settings.bot_personality ?? '')
      setTimezone(settings.timezone ?? 'America/Sao_Paulo')
      setLanguage(settings.language ?? 'pt-BR')
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
        })
        .eq('workspace_id', workspaceId)
      if (error) throw error
      toast.success('Configurações salvas')
      qc.invalidateQueries({ queryKey: ['workspace-settings', workspaceId] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
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

  return (
    <div className="space-y-6 max-w-2xl animate-slide-up">
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

      <Button onClick={save} disabled={saving} size="lg" className="w-full sm:w-auto">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Salvar Configurações
      </Button>
    </div>
  )
}

export default SettingsPage
