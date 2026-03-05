import React from 'react'
import { Prism as SH } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Props { code: string }

export const SyntaxHighlighter: React.FC<Props> = ({ code }) => (
  <SH language="json" style={oneDark} customStyle={{ borderRadius: '0.5rem', fontSize: '0.75rem', margin: 0 }}>
    {code}
  </SH>
)
