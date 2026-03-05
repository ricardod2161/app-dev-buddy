import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { Plus, Pencil, Trash2, ArrowRight, Search, X, FileText } from 'lucide-react'
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
    <div className="border rounded-md">
      <div className="flex gap-1 p-2 border-b bg-muted/50">
        {[
          { label: 'N', title: 'Negrito', action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
          { label: 'I', title: 'Itálico', action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
          { label: '•', title: 'Lista', action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive('bulletList') },
          { label: '<>', title: 'Código', action: () => editor?.chain().focus().toggleCode().run(), active: editor?.isActive('code') },
        ].map(({ label, title, action, active }) => (
          <button
            key={title}
            type="button"
            title={title}
            onClick={action}
            className={`px-2 py-1 text-sm rounded font-mono transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="p-3 min-h-[120px] prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  )
}

// --- Modal de Nota ---
interface NoteModalProps {
  note?: Note | null
  open: boolean
  onClose: () => void
  workspaceId: string
  categories: string[]
}

const NoteModal: React.FC<NoteModalProps> = ({ note, open, onClose, workspaceId, categories }) => {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [category, setCategory] = useState(note?.category ?? 'none')
  const [project, setProject] = useState(note?.project ?? '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(note?.title ?? '')
      setContent(note?.content ?? '')
      setCategory(note?.category ?? 'none')
      setProject(note?.project ?? '')
      setTags(note?.tags ?? [])
      setTagInput('')
    }
  }, [open, note])

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
      if (note) {
        const { error } = await supabase.from('notes').update({ title, content, category: catValue, project, tags }).eq('id', note.id)
        if (error) throw error
        toast.success('Nota atualizada')
      } else {
        const { error } = await supabase.from('notes').insert({ workspace_id: workspaceId, title, content, category: catValue, project, tags })
        if (error) throw error
        toast.success('Nota criada')
      }
      qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
      qc.invalidateQueries({ queryKey: ['dashboard-notes-today', workspaceId] })
      qc.invalidateQueries({ queryKey: ['dashboard-recent-notes', workspaceId] })
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar nota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{note ? 'Editar Nota' : 'Nova Nota'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da nota" className="mt-1" />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <div className="mt-1">
              <RichEditor content={content} onChange={setContent} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
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
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Adicionar tag..."
              />
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
          <Button onClick={save} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
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
  const [modalOpen, setModalOpen] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [deleteNote, setDeleteNote] = useState<Note | null>(null)
  const [taskNote, setTaskNote] = useState<Note | null>(null)

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
        <Button onClick={() => { setEditNote(null); setModalOpen(true) }} className="shrink-0">
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
            action={!search && filterCategory === 'all' ? { label: 'Nova Nota', onClick: () => { setEditNote(null); setModalOpen(true) } } : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(note => {
            const preview = truncate(stripHtml(note.content ?? ''), 100)
            return (
              <Card key={note.id} className="hover:shadow-md transition-all hover:-translate-y-0.5 duration-150">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{note.title ?? '(sem título)'}</h3>
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
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Transformar em tarefa"
                        onClick={() => setTaskNote(note)}>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar"
                        onClick={() => { setEditNote(note); setModalOpen(true) }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir"
                        onClick={() => setDeleteNote(note)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modais */}
      {workspaceId && (
        <>
          <NoteModal
            note={editNote}
            open={modalOpen}
            onClose={() => { setModalOpen(false); setEditNote(null) }}
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
