import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

// IDs já disparados nesta sessão (evita repetição enquanto o app está aberto)
const firedSet = new Set<string>()

/** Gera um beep de despertador usando Web Audio API */
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

    const beepPattern = [0, 0.3, 0.6, 0.9, 1.2] // 5 beeps

    beepPattern.forEach((offset) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime + offset)          // Lá 5
      osc.frequency.setValueAtTime(1100, ctx.currentTime + offset + 0.08)  // subida

      gain.gain.setValueAtTime(0, ctx.currentTime + offset)
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + offset + 0.02)
      gain.gain.setValueAtTime(0.5, ctx.currentTime + offset + 0.15)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + offset + 0.25)

      osc.start(ctx.currentTime + offset)
      osc.stop(ctx.currentTime + offset + 0.28)
    })

    // Fecha o contexto após os beeps
    setTimeout(() => ctx.close(), 2000)
  } catch {
    // Browser pode bloquear AudioContext sem interação do usuário — silencia o erro
  }
}

/** Solicita permissão de notificação uma vez */
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

/** Mostra notificação nativa do sistema (funciona em segundo plano) */
function showNativeNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`⏰ ${title}`, {
      body,
      icon: '/favicon.ico',
      requireInteraction: true, // Não fecha automaticamente
    })
  }
}

export function useReminderAlarm() {
  const { workspaceId } = useAuth()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkReminders = useCallback(async () => {
    if (!workspaceId) return

    const now = new Date().toISOString()
    // Busca lembretes agendados que já venceram ou vencem nos próximos 30s
    const threshold = new Date(Date.now() + 30_000).toISOString()

    const { data, error } = await supabase
      .from('reminders')
      .select('id, title, message, remind_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'scheduled')
      .lte('remind_at', threshold)
      .gte('remind_at', new Date(Date.now() - 60_000).toISOString()) // janela de 1 min atrás

    if (error || !data || data.length === 0) return

    for (const reminder of data) {
      if (firedSet.has(reminder.id)) continue
      firedSet.add(reminder.id)

      const label = reminder.title || 'Lembrete'
      const msg = reminder.message

      // 1. Som de despertador
      playAlarm()

      // 2. Notificação nativa
      showNativeNotification(label, msg)

      // 3. Toast persistente com dismiss manual
      toast(`⏰ ${label}`, {
        description: msg,
        duration: Infinity,
        action: {
          label: 'OK',
          onClick: () => {},
        },
      })
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return

    // Solicita permissão de notificação ao montar
    requestNotificationPermission()

    // Verifica imediatamente e depois a cada 30s
    checkReminders()
    intervalRef.current = setInterval(checkReminders, 30_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [workspaceId, checkReminders])
}
