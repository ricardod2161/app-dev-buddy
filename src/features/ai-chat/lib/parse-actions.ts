export interface ParsedAction {
  type: 'create_task' | 'create_note' | 'create_reminder'
  params: Record<string, string>
}

/**
 * Parses [ACTION:type|key=value|key=value] blocks from AI text.
 * Returns { cleanText, actions }
 */
export function parseActionsFromText(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = []
  const actionRegex = /\[ACTION:(create_task|create_note|create_reminder)\|([^\]]*)\]/gi

  const cleanText = text.replace(actionRegex, (_, type, paramsStr) => {
    const params: Record<string, string> = {}
    paramsStr.split('|').forEach((pair: string) => {
      const eqIdx = pair.indexOf('=')
      if (eqIdx > -1) {
        params[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim()
      }
    })
    actions.push({ type: type as ParsedAction['type'], params })
    return ''
  }).trim()

  return { cleanText, actions }
}
