import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, CheckSquare, Bell, MessageSquare, TrendingDown, Bot, Sparkles, ArrowRight } from 'lucide-react'
import type { DashboardMetrics } from '../hooks/useDashboardMetrics'

interface MetricsGridProps {
  metrics: DashboardMetrics
  loadingNotes: boolean
  loadingTasks: boolean
  loadingReminders: boolean
  loadingMessages: boolean
  loadingSpend: boolean
  loadingAiMetrics: boolean
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({
  metrics,
  loadingNotes, loadingTasks, loadingReminders, loadingMessages, loadingSpend, loadingAiMetrics,
}) => {
  const navigate = useNavigate()
  const { notesCount, tasksCount, remindersCount, messagesCount, todaySpend, aiMetrics } = metrics

  const spendDisplay = todaySpend > 0
    ? todaySpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ 0,00'

  const cards = [
    { label: 'Notas Hoje', value: notesCount, icon: FileText, loading: loadingNotes, color: 'text-primary', bg: 'bg-primary/10', isText: false },
    { label: 'Tarefas Pendentes', value: tasksCount, icon: CheckSquare, loading: loadingTasks, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/20', isText: false },
    { label: 'Lembretes (24h)', value: remindersCount, icon: Bell, loading: loadingReminders, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/20', isText: false },
    { label: 'Mensagens Hoje', value: messagesCount, icon: MessageSquare, loading: loadingMessages, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/20', isText: false },
    { label: 'Gastos Hoje', value: spendDisplay, icon: TrendingDown, loading: loadingSpend, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/20', isText: true },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 sm:gap-4">
      {cards.map(({ label, value, icon: Icon, loading, color, bg, isText }) => (
        <Card key={label} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">{label}</p>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            {loading
              ? <Skeleton className="h-8 w-16" />
              : isText
                ? <p className="text-lg sm:text-xl font-bold text-foreground">{value}</p>
                : <p className="text-2xl sm:text-3xl font-bold text-foreground">{value ?? 0}</p>
            }
          </CardContent>
        </Card>
      ))}

      {/* AI Metrics Card */}
      <Card className="hover:shadow-md transition-shadow col-span-1 sm:col-span-2 xl:col-span-1">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">IA Hoje</p>
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
          </div>
          {loadingAiMetrics
            ? <Skeleton className="h-8 w-20" />
            : aiMetrics
              ? (
                <div className="space-y-1">
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{aiMetrics.total}</p>
                  <p className="text-xs text-muted-foreground">
                    ~{aiMetrics.avgMs < 1000 ? `${aiMetrics.avgMs}ms` : `${(aiMetrics.avgMs / 1000).toFixed(1)}s`} · {aiMetrics.topModel}
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-xs text-primary gap-1 -ml-1 mt-1" onClick={() => navigate('/app/ai-chat')}>
                    <Sparkles className="w-3 h-3" />Abrir Chat IA
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              )
              : (
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-foreground">—</p>
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-xs text-primary gap-1 -ml-1" onClick={() => navigate('/app/ai-chat')}>
                    <Sparkles className="w-3 h-3" />Abrir Chat IA
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              )
          }
        </CardContent>
      </Card>
    </div>
  )
}
