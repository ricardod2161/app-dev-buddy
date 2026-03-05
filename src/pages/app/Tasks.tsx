import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Task } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Trash2, LayoutGrid, List } from 'lucide-react'
import { DndContext, DragEndEvent, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const priorityConfig: Record<Task['priority'], { label: string; class: string }> = {
  high: { label: '🔴 Alta', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  medium: { label: '🟡 Média', class: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400' },
  low: { label: '🟢 Baixa', class: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400' },
}

const statusColumns: { key: Task['status']; label: string }[] = [
  { key: 'todo', label: '📋 A Fazer' },
  { key: 'doing', label: '🔄 Em Andamento' },
  { key: 'done', label: '✅ Concluído' },
]

// --- Task Card para Kanban ---
interface TaskCardProps { task: Task; onEdit: (t: Task) => void; onDelete: (t: Task) => void }

const SortableTaskCard: React.FC<TaskCardProps> = ({ task, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done'
  const pr = priorityConfig[task.priority]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${isDragging ? 'opacity-50' : ''} ${isOverdue ? 'border-destructive' : 'border-border'}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground flex-1">{task.title}</p>
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(task)} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(task)} className="text-muted-foreground hover:text-destructive p-0.5 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <Badge variant="outline" className={`text-xs mt-2 ${pr.class}`}>{pr.label}</Badge>
      {task.due_at && (
        <p className={`text-xs mt-1 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {isOverdue ? '⚠️ ' : '📅 '}{format(new Date(task.due_at), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      )}
      {task.project && <p className="text-xs text-muted-foreground mt-1">📁 {task.project}</p>}
    </div>
  )
}

// --- Modal de Tarefa ---
interface TaskModalProps {
  task?: Task | null; open: boolean; onClose: () => void; workspaceId: string
}

const TaskModal: React.FC<TaskModalProps> = ({ task, open, onClose, workspaceId }) => {
  const qc = useQueryClient()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState<Task['status']>(task?.status ?? 'todo')
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'medium')
  const [dueAt, setDueAt] = useState(task?.due_at ? format(new Date(task.due_at), "yyyy-MM-dd'T'HH:mm") : '')
  const [project, setProject] = useState(task?.project ?? '')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(task?.title ?? ''); setDescription(task?.description ?? '')
      setStatus(task?.status ?? 'todo'); setPriority(task?.priority ?? 'medium')
      setDueAt(task?.due_at ? format(new Date(task.due_at), "yyyy-MM-dd'T'HH:mm") : '')
      setProject(task?.project ?? '')
    }
  }, [open, task])

  const save = async () => {
    if (!title.trim()) { toast.error('Título é obrigatório'); return }
    setLoading(true)
    try {
      const payload = {
        title, description: description || null, status, priority,
        due_at: dueAt || null, project: project || null,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      }
      if (task) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task.id)
        if (error) throw error
        toast.success('Tarefa atualizada')
      } else {
        const { error } = await supabase.from('tasks').insert({ workspace_id: workspaceId, ...payload })
        if (error) throw error
        toast.success('Tarefa criada')
      }
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{task ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" placeholder="Título da tarefa" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as Task['status'])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusColumns.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prazo</Label>
              <Input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Projeto</Label>
              <Input value={project} onChange={e => setProject(e.target.value)} className="mt-1" placeholder="Projeto..." />
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

// --- Página ---
const TasksPage: React.FC = () => {
  const { workspaceId } = useAuth()
  const qc = useQueryClient()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [deleteTask, setDeleteTask] = useState<Task | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('tasks').select('*')
        .eq('workspace_id', workspaceId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as Task[]
    },
    enabled: !!workspaceId,
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Task['status'] }) => {
      const { error } = await supabase.from('tasks').update({
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tarefa excluída')
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      setDeleteTask(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return

    const draggedTask = tasks?.find(t => t.id === active.id)
    const overStatus = statusColumns.find(s => s.key === over.id)?.key
      ?? tasks?.find(t => t.id === over.id)?.status

    if (draggedTask && overStatus && draggedTask.status !== overStatus) {
      updateStatus.mutate({ id: draggedTask.id, status: overStatus })
    }
  }

  const tasksByStatus = (status: Task['status']) =>
    (tasks ?? []).filter(t => t.status === status)

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={view === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setView('kanban')}>
            <LayoutGrid className="w-4 h-4 mr-2" /> Kanban
          </Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
            <List className="w-4 h-4 mr-2" /> Lista
          </Button>
        </div>
        <Button onClick={() => { setEditTask(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Tarefa
        </Button>
      </div>

      {/* KANBAN */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}
          onDragStart={e => setActiveTask(tasks?.find(t => t.id === e.active.id) ?? null)}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {statusColumns.map(col => (
              <div key={col.key} className="bg-muted/40 rounded-xl p-3 min-h-64">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-foreground">{col.label}</h3>
                  <Badge variant="secondary" className="text-xs">{tasksByStatus(col.key).length}</Badge>
                </div>
                <SortableContext items={tasksByStatus(col.key).map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {/* Droppable area */}
                  <div
                    id={col.key}
                    data-droppable={col.key}
                    className="space-y-2 min-h-16"
                  >
                    {tasksByStatus(col.key).map(task => (
                      <SortableTaskCard
                        key={task.id}
                        task={task}
                        onEdit={t => { setEditTask(t); setModalOpen(true) }}
                        onDelete={setDeleteTask}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <div className="bg-card border border-primary rounded-lg p-3 shadow-xl rotate-2 opacity-90">
                <p className="text-sm font-medium">{activeTask.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* LISTA */}
      {view === 'list' && (
        <div className="space-y-2">
          {(tasks ?? []).length === 0
            ? <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma tarefa criada</CardContent></Card>
            : (tasks ?? []).map(task => {
              const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done'
              const pr = priorityConfig[task.priority]
              return (
                <Card key={task.id} className={isOverdue ? 'border-destructive' : ''}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {task.title}
                          </p>
                          <Badge variant="outline" className={`text-xs ${pr.class}`}>{pr.label}</Badge>
                          {isOverdue && <Badge variant="destructive" className="text-xs">Vencida</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="capitalize">{statusColumns.find(s => s.key === task.status)?.label}</span>
                          {task.due_at && <span>📅 {format(new Date(task.due_at), "dd/MM/yyyy", { locale: ptBR })}</span>}
                          {task.project && <span>📁 {task.project}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditTask(task); setModalOpen(true) }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTask(task)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          }
        </div>
      )}

      {/* Modais */}
      {workspaceId && (
        <TaskModal
          task={editTask}
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditTask(null) }}
          workspaceId={workspaceId}
        />
      )}

      <Dialog open={!!deleteTask} onOpenChange={v => !v && setDeleteTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Tarefa</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir "<strong>{deleteTask?.title}</strong>"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTask(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTask && deleteMutation.mutate(deleteTask.id)}>
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TasksPage
