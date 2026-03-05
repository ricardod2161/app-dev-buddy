import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import type { WorkspaceSettings } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Save, Loader2 } from 'lucide-react'

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
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [language, setLanguage] = useState('pt-BR')
  const [newCategory, setNewCategory] = useState('')
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    if (settings) {
      setCategories((settings.default_categories as string[]) ?? [])
      setTags((settings.default_tags as string[]) ?? [])
      setBotFormat(settings.bot_response_format)
      setTimezone(settings.timezone)
      setLanguage(settings.language)
    }
  }, [settings])

  const timezones = Intl.supportedValuesOf('timeZone')

  const save = async () => {
    if (!workspaceId) return
    setSaving(true)
    try {
      const payload = {
        default_categories: categories,
        default_tags: tags,
        bot_response_format: botFormat,
        timezone,
        language,
      }
      const { error } = await supabase
        .from('workspace_settings')
        .update(payload)
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

  if (isLoading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}</div>

  return (
    <div className="space-y-6 max-w-2xl">
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
                <button onClick={() => setCategories(prev => prev.filter(c => c !== cat))} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newCategory.trim() && !categories.includes(newCategory.trim())) { setCategories(prev => [...prev, newCategory.trim()]); setNewCategory('') } } }}
              placeholder="Nova categoria..."
              className="flex-1"
            />
            <Button variant="outline" onClick={() => {
              if (newCategory.trim() && !categories.includes(newCategory.trim())) {
                setCategories(prev => [...prev, newCategory.trim()])
                setNewCategory('')
              }
            }}>
              <Plus className="w-4 h-4" />
            </Button>
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
                <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newTag.trim() && !tags.includes(newTag.trim())) { setTags(prev => [...prev, newTag.trim()]); setNewTag('') } } }}
              placeholder="Nova tag..."
              className="flex-1"
            />
            <Button variant="outline" onClick={() => {
              if (newTag.trim() && !tags.includes(newTag.trim())) {
                setTags(prev => [...prev, newTag.trim()])
                setNewTag('')
              }
            }}>
              <Plus className="w-4 h-4" />
            </Button>
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
          <RadioGroup value={botFormat} onValueChange={v => setBotFormat(v as WorkspaceSettings['bot_response_format'])}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="curto" id="curto" />
              <Label htmlFor="curto">Curto — Resposta mínima e direta</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="medio" id="medio" />
              <Label htmlFor="medio">Médio — Informações essenciais com confirmação</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="detalhado" id="detalhado" />
              <Label htmlFor="detalhado">Detalhado — Resposta completa com todos os dados</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Fuso horário e idioma */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Localização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Fuso Horário</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {timezones.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
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

      <Button onClick={save} disabled={saving} size="lg">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Salvar Configurações
      </Button>
    </div>
  )
}

export default SettingsPage
