import React from 'react'

interface MarkdownRendererProps {
  content: string
}

function applyInline(text: string, key: string | number): React.ReactNode {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:hsl(var(--muted));padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.85em">$1</code>')
  return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <div key={`code-${i}`} className="my-2 rounded-lg overflow-hidden border border-border">
          {lang && (
            <div className="flex items-center gap-2 px-3 py-1 bg-muted/80 border-b border-border">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{lang}</span>
            </div>
          )}
          <pre className="bg-muted/50 p-3 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre text-foreground">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      i++
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h3 key={`h3-${i}`} className="text-sm font-semibold mt-3 mb-1 text-foreground">{applyInline(line.slice(4), `h3i-${i}`)}</h3>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={`h2-${i}`} className="text-base font-bold mt-3 mb-1 text-foreground">{applyInline(line.slice(3), `h2i-${i}`)}</h2>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={`h1-${i}`} className="text-lg font-bold mt-3 mb-2 text-foreground">{applyInline(line.slice(2), `h1i-${i}`)}</h1>)
      i++; continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={`hr-${i}`} className="my-3 border-border" />)
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
          {quoteLines.map((ql, qi) => <p key={qi}>{applyInline(ql, qi)}</p>)}
        </blockquote>
      )
      continue
    }

    // Unordered list
    if (line.match(/^[-*•] /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*•] /)) {
        items.push(lines[i].replace(/^[-*•] /, ''))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside my-1 space-y-0.5 pl-2">
          {items.map((item, idx) => <li key={idx} className="text-sm">{applyInline(item, idx)}</li>)}
        </ul>
      )
      continue
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside my-1 space-y-0.5 pl-2">
          {items.map((item, idx) => <li key={idx} className="text-sm">{applyInline(item, idx)}</li>)}
        </ol>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-1" />)
      i++; continue
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed">{applyInline(line, `pi-${i}`)}</p>
    )
    i++
  }

  return <>{elements}</>
}
