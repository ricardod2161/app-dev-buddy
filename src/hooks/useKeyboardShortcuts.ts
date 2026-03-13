import { useEffect, useCallback } from 'react'

interface ShortcutHandlers {
  onNewNote?: () => void
  onNewTask?: () => void
  onNewReminder?: () => void
}

/**
 * Global keyboard shortcuts hook.
 * 
 * Shortcuts (only fire when NOT in a text input/textarea/contenteditable):
 *   N → new note (if onNewNote provided)
 *   T → new task (if onNewTask provided)
 *   R → new reminder (if onNewReminder provided)
 */
export function useKeyboardShortcuts({ onNewNote, onNewTask, onNewReminder }: ShortcutHandlers) {
  const isInputFocused = useCallback((): boolean => {
    const el = document.activeElement
    if (!el) return false
    const tag = el.tagName.toLowerCase()
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      (el as HTMLElement).isContentEditable
    )
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (isInputFocused()) return
      // Skip if modifier keys are held (don't interfere with Cmd+K, Ctrl+Z, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'n':
          if (onNewNote) {
            e.preventDefault()
            onNewNote()
          }
          break
        case 't':
          if (onNewTask) {
            e.preventDefault()
            onNewTask()
          }
          break
        case 'r':
          if (onNewReminder) {
            e.preventDefault()
            onNewReminder()
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isInputFocused, onNewNote, onNewTask, onNewReminder])
}
