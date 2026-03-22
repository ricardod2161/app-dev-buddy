import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, CheckSquare, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { stripHtml, truncate } from '@/lib/utils'

const priorityColors: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400',
}

type RecentNote = { id: string; title: string | null; content: string | null; created_at: string | null; category: string | null }
type RecentTask = { id: string; title: string; status: string; priority: string | null; due_at: string | null }

interface RecentActivityProps {
  recentNotes?: RecentNote[]
  recentTasks?: RecentTask[]
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ recentNotes, recentTasks }) => {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* Recent Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Notas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!recentNotes
            ? <Skeleton className="h-32 w-full" />
            : recentNotes.length === 0
              ? (
                <div className="flex flex-col items-center py-6 gap-3">
                  <p className="text-sm text-muted-foreground">Nenhuma nota ainda</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/notes')}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" />Criar primeira nota
                  </Button>
                </div>
              )
              : (
                <div className="space-y-3">
                  {recentNotes.map(note => (
                    <div key={note.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate('/app/notes')}>
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{note.title ?? '(sem título)'}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {truncate(stripHtml(note.content ?? ''), 60) || 'Sem conteúdo'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {note.category && <Badge variant="outline" className="text-xs hidden sm:inline-flex">{note.category}</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {note.created_at ? format(new Date(note.created_at), 'dd/MM', { locale: ptBR }) : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
          }
        </CardContent>
      </Card>

      {/* Recent Tasks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" /> Tarefas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!recentTasks
            ? <Skeleton className="h-32 w-full" />
            : recentTasks.length === 0
              ? (
                <div className="flex flex-col items-center py-6 gap-3">
                  <p className="text-sm text-muted-foreground">Nenhuma tarefa ainda</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/tasks')}>
                    <CheckSquare className="w-3.5 h-3.5 mr-1.5" />Criar primeira tarefa
                  </Button>
                </div>
              )
              : (
                <div className="space-y-3">
                  {recentTasks.map(task => {
                    const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done'
                    const priority = task.priority ?? 'low'
                    return (
                      <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate('/app/tasks')}>
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${priorityColors[priority] ?? priorityColors.low}`}>
                          <CheckSquare className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {task.title}
                          </p>
                          {task.due_at && (
                            <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                              <Clock className="w-3 h-3" />
                              {format(new Date(task.due_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {task.status === 'todo' ? 'A fazer' : task.status === 'doing' ? 'Fazendo' : 'Feito'}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )
          }
        </CardContent>
      </Card>
    </div>
  )
}
