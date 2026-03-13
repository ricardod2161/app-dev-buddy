import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Note, Task } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, ArrowRight, Search, X, FileText, Check, ChevronDown, ChevronUp, Bold, Italic, List, Code2 } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { EmptyState } from '@/components/EmptyState'
import { stripHtml, truncate } from '@/lib/utils'

// --- TipTap Editor ---
const RichEditor: React.FC<{ content: string; onChange: (v: string) => void }> = ({ content, onChange }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Digite o conteúdo da nota...' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  return (
    <div className="border rounded-md bg-background">
      <div className="flex gap-1 p-1.5 border-b bg-muted/40">
        {[
          { icon: <Bold className="w-3.5 h-3.5" />, title: 'Negrito', action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
          { icon: <Italic className="w-3.5 h-3.5" />, title: 'Itálico', action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
          { icon: <List className="w-3.5 h-3.5" />, title: 'Lista', action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive('bulletList') },
          { icon: <Code2 className="w-3.5 h-3.5" />, title: 'Código', action: () => editor?.chain().focus().toggleCode().run(), active: editor?.isActive('code') },
        ].map(({ icon, title, action, active }) => (
          <button
            key={title}
            type="button"
            title={title}
            onClick={action}
            className={`px-2 py-1 rounded transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
          >
            {icon}
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="p-3 min-h-[100px] prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  )
}

// --- Inline Editable Note Card ---
interface NoteCardProps {
  note: Note
  categories: string[]
  workspaceId: string
  onDelete: (note: Note) => void
  onConvertToTask: (note: Note) => void
}

const NoteCard: React.FC<NoteCardProps> = ({ note, categories, workspaceId, onDelete, onConvertToTask }) => {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(note.title ?? '')
  const [content, setContent] = useState(note.content ?? '')
  const [category, setCategory] = useState(note.category ?? 'none')
  const [project, setProject] = useState(note.project ?? '')
  const [tags, setTags] = useState<string[]>((note.tags as string[]) ?? [])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markDirty = useCallback(() => {
    setDirty(true)
    setAutoSaveStatus('pending')
    // Debounce auto-save: 1.5s after last change
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      // trigger save via a ref-based approach
      setAutoSaveStatus('saving')
    }, 1500)
  }, [])

  // Execute save when status transitions to 'saving'
  useEffect(() => {
    if (autoSaveStatus !== 'saving') return
    const catValue = category === 'none' ? null : category
    supabase
      .from('notes')
      .update({ title, content, category: catValue, project, tags })
      .eq('id', note.id)
      .then(({ error }) => {
        if (error) {
          setAutoSaveStatus('error')
        } else {
          setAutoSaveStatus('saved')
          setDirty(false)
          qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
          qc.invalidateQueries({ queryKey: ['dashboard-notes-today', workspaceId] })
          qc.invalidateQueries({ queryKey: ['dashboard-recent-notes', workspaceId] })
          setTimeout(() => setAutoSaveStatus('idle'), 2500)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveStatus])

  // Cleanup timer on unmount
  useEffect(() => () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }, [])

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); markDirty() }
    setTagInput('')
  }

  const save = async () => {
    if (!title.trim()) { toast.error('Título é obrigatório'); return }
    setSaving(true)
    const catValue = category === 'none' ? null : category
    try {
      const { error } = await supabase
        .from('notes')
        .update({ title, content, category: catValue, project, tags })
        .eq('id', note.id)
      if (error) throw error
      toast.success('Nota salva')
      qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
      qc.invalidateQueries({ queryKey: ['dashboard-notes-today', workspaceId] })
      qc.invalidateQueries({ queryKey: ['dashboard-recent-notes', workspaceId] })
      setDirty(false)
      setExpanded(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setTitle(note.title ?? '')
    setContent(note.content ?? '')
    setCategory(note.category ?? 'none')
    setProject(note.project ?? '')
    setTags((note.tags as string[]) ?? [])
    setTagInput('')
    setDirty(false)
    setExpanded(false)
  }

  const preview = truncate(stripHtml(note.content ?? ''), 120)

  return (
    <Card className={`transition-all duration-200 ${expanded ? 'shadow-md ring-1 ring-primary/20' : 'hover:shadow-md hover:-translate-y-0.5'}`}>
      <CardContent className="py-4 px-5">
        {!expanded ? (
          /* --- Collapsed view (click to expand) --- */
          <div
            className="cursor-pointer"
            onClick={() => setExpanded(true)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setExpanded(true)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{title || '(sem título)'}</h3>
                {preview && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {note.category && <Badge variant="outline" className="text-xs">{note.category}</Badge>}
                  {note.project && <span className="text-xs text-muted-foreground">📁 {note.project}</span>}
                  {(note.tags as string[]).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(note.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Transformar em tarefa"
                  onClick={() => onConvertToTask(note)}>
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir"
                  onClick={() => onDelete(note)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Expandir">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* --- Expanded inline editor --- */
          <div className="space-y-3">
            {/* Title */}
            <div className="flex items-center gap-2">
              <Input
                value={title}
                onChange={e => { setTitle(e.target.value); markDirty() }}
                placeholder="Título da nota"
                className="text-base font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary bg-transparent"
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={cancel} title="Fechar">
                <ChevronUp className="w-4 h-4" />
              </Button>
            </div>

            {/* Rich content */}
            <RichEditor content={content} onChange={v => { setContent(v); markDirty() }} />

            {/* Category + Project */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Categoria</Label>
                <Select value={category} onValueChange={v => { setCategory(v); markDirty() }}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Projeto</Label>
                <Input
                  value={project}
                  onChange={e => { setProject(e.target.value); markDirty() }}
                  placeholder="Nome do projeto"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs text-muted-foreground">Tags</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Adicionar tag..."
                  className="h-8 text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag} className="h-8">+</Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                      {tag}
                      <button onClick={() => { setTags(prev => prev.filter(t => t !== tag)); markDirty() }}>
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => onDelete(note)}>
                  <Trash2 className="w-3 h-3 mr-1" /> Excluir
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                  onClick={() => onConvertToTask(note)}>
                  <ArrowRight className="w-3 h-3 mr-1" /> Transformar em Tarefa
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancel}>Cancelar</Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={save} disabled={saving || !dirty}>
                  <Check className="w-3 h-3" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Modal Nova Nota ---
interface NewNoteModalProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  categories: string[]
}

const NewNoteModal: React.FC<NewNoteModalProps> = ({ open, onClose, workspaceId, categories }) => {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('none')
  const [project, setProject] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (open) { setTitle(''); setContent(''); setCategory('none'); setProject(''); setTags([]); setTagInput('') }
  }, [open])

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const save = async () => {
    if (!title.trim()) { toast.error('Título é obrigatório'); return }
    setLoading(true)
    const catValue = category === 'none' ? null : category
    try {
      const { error } = await supabase.from('notes').insert({ workspace_id: workspaceId, title, content, category: catValue, project, tags })
      if (error) throw error
      toast.success('Nota criada')
      qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
      qc.invalidateQueries({ queryKey: ['dashboard-notes-today', workspaceId] })
      qc.invalidateQueries({ queryKey: ['dashboard-recent-notes', workspaceId] })
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar nota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Nota</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da nota" className="mt-1" autoFocus />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <div className="mt-1"><RichEditor content={content} onChange={setContent} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Projeto</Label>
              <Input value={project} onChange={e => setProject(e.target.value)} placeholder="Nome do projeto" className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mt-1">
              <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Adicionar tag..." />
              <Button type="button" variant="outline" onClick={addTag}>Adicionar</Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => setTags(prev => prev.filter(t => t !== tag))}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={loading}>{loading ? 'Salvando...' : 'Criar Nota'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Modal Transformar em Tarefa ---
interface TaskFromNoteModalProps {
  note: Note
  open: boolean
  onClose: () => void
  workspaceId: string
}

const TaskFromNoteModal: React.FC<TaskFromNoteModalProps> = ({ note, open, onClose, workspaceId }) => {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note.title ?? '')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => { if (open) setTitle(note.title ?? '') }, [open, note])

  const create = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.from('tasks').insert({ workspace_id: workspaceId, title, priority, status: 'todo' })
      if (error) throw error
      toast.success('Tarefa criada a partir da nota!')
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar tarefa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transformar em Tarefa</DialogTitle>
          <DialogDescription>Crie uma tarefa baseada nesta nota</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título da Tarefa *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={v => setPriority(v as Task['priority'])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">🟢 Baixa</SelectItem>
                <SelectItem value="medium">🟡 Média</SelectItem>
                <SelectItem value="high">🔴 Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={create} disabled={loading}>{loading ? 'Criando...' : 'Criar Tarefa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Página principal ---
const NotesPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [newNoteOpen, setNewNoteOpen] = useState(false)
  const [deleteNote, setDeleteNote] = useState<Note | null>(null)
  const [taskNote, setTaskNote] = useState<Note | null>(null)

  // Keyboard shortcut: N → new note
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return
        e.preventDefault()
        setNewNoteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null
      const { data } = await supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).single()
      return data
    },
    enabled: !!workspaceId,
  })

  const categories: string[] = (settings?.default_categories as string[]) ?? ['Trabalho', 'Pessoal', 'Ideia', 'Reunião']

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('notes').select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Note[]
    },
    enabled: !!workspaceId,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Nota excluída')
      qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
      setDeleteNote(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const filtered = (notes ?? []).filter(n => {
    const q = search.toLowerCase()
    const matchSearch = !q || (n.title ?? '').toLowerCase().includes(q) || (n.content ?? '').toLowerCase().includes(q)
    const matchCat = filterCategory === 'all' || n.category === filterCategory
    const matchProj = filterProject === 'all' || (n.project ?? '').toLowerCase().includes(filterProject.toLowerCase())
    return matchSearch && matchCat && matchProj
  })

  const projects = [...new Set((notes ?? []).map(n => n.project).filter(Boolean))]

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar notas..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36 sm:w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {projects.length > 0 && (
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-36 sm:w-40"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {projects.map(p => <SelectItem key={p!} value={p!}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button onClick={() => setNewNoteOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Nova Nota
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="Nenhuma nota encontrada"
            description={search || filterCategory !== 'all' ? 'Tente ajustar os filtros de busca.' : 'Crie sua primeira nota clicando em "Nova Nota".'}
            action={!search && filterCategory === 'all' ? { label: 'Nova Nota', onClick: () => setNewNoteOpen(true) } : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {workspaceId && filtered.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              categories={categories}
              workspaceId={workspaceId}
              onDelete={setDeleteNote}
              onConvertToTask={setTaskNote}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      {workspaceId && (
        <>
          <NewNoteModal
            open={newNoteOpen}
            onClose={() => setNewNoteOpen(false)}
            workspaceId={workspaceId}
            categories={categories}
          />
          {taskNote && (
            <TaskFromNoteModal
              note={taskNote}
              open={!!taskNote}
              onClose={() => setTaskNote(null)}
              workspaceId={workspaceId}
            />
          )}
        </>
      )}

      <Dialog open={!!deleteNote} onOpenChange={v => !v && setDeleteNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Nota</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir "<strong>{deleteNote?.title}</strong>"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNote(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteNote && deleteMutation.mutate(deleteNote.id)}>
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default NotesPage
