import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { FileText, CheckSquare, Bell, MessageSquare } from 'lucide-react'
import { format, subDays, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const DashboardPage: React.FC = () => {
  const { workspaceId } = useAuth()

  const today = startOfDay(new Date()).toISOString()
  const tomorrow = startOfDay(subDays(new Date(), -1)).toISOString()
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = subDays(new Date(), 6).toISOString()

  const { data: notesCount, isLoading: loadingNotes } = useQuery({
    queryKey: ['dashboard-notes-today', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .gte('created_at', today)
        .lt('created_at', tomorrow)
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: tasksCount, isLoading: loadingTasks } = useQuery({
    queryKey: ['dashboard-tasks-pending', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('status', ['todo', 'doing'])
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: remindersCount, isLoading: loadingReminders } = useQuery({
    queryKey: ['dashboard-reminders-24h', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('reminders')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'scheduled')
        .lte('remind_at', next24h)
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: messagesCount, isLoading: loadingMessages } = useQuery({
    queryKey: ['dashboard-messages-today', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('direction', 'IN')
        .gte('created_at', today)
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: notesChart, isLoading: loadingNotesChart } = useQuery({
    queryKey: ['dashboard-notes-chart', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase
        .from('notes')
        .select('created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', sevenDaysAgo)
      const grouped: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        const day = format(subDays(new Date(), 6 - i), 'dd/MM', { locale: ptBR })
        grouped[day] = 0
      }
      data?.forEach(n => {
        const day = format(new Date(n.created_at), 'dd/MM', { locale: ptBR })
        if (grouped[day] !== undefined) grouped[day]++
      })
      return Object.entries(grouped).map(([dia, notas]) => ({ dia, notas }))
    },
    enabled: !!workspaceId,
  })

  const { data: tasksChart, isLoading: loadingTasksChart } = useQuery({
    queryKey: ['dashboard-tasks-chart', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await supabase
        .from('tasks')
        .select('status')
        .eq('workspace_id', workspaceId)
      const count = { todo: 0, doing: 0, done: 0 }
      data?.forEach(t => { count[t.status]++ })
      return [
        { status: 'A Fazer', total: count.todo },
        { status: 'Em Andamento', total: count.doing },
        { status: 'Concluído', total: count.done },
      ]
    },
    enabled: !!workspaceId,
  })

  const metrics = [
    { label: 'Notas Criadas Hoje', value: notesCount, icon: FileText, loading: loadingNotes, color: 'text-blue-500' },
    { label: 'Tarefas Pendentes', value: tasksCount, icon: CheckSquare, loading: loadingTasks, color: 'text-yellow-500' },
    { label: 'Lembretes (24h)', value: remindersCount, icon: Bell, loading: loadingReminders, color: 'text-purple-500' },
    { label: 'Mensagens Hoje', value: messagesCount, icon: MessageSquare, loading: loadingMessages, color: 'text-green-500' },
  ]

  return (
    <div className="space-y-6">
      {/* Cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map(({ label, value, icon: Icon, loading, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`w-5 h-5 ${color}`} />
            </CardHeader>
            <CardContent>
              {loading
                ? <Skeleton className="h-8 w-16" />
                : <p className="text-3xl font-bold text-foreground">{value ?? 0}</p>
              }
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LineChart: Notas por dia */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas — Últimos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingNotesChart
              ? <Skeleton className="h-48 w-full" />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={notesChart ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="dia" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="notas" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        {/* BarChart: Tarefas por status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tarefas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTasksChart
              ? <Skeleton className="h-48 w-full" />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tasksChart ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" name="Tarefas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
