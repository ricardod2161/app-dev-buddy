import React, { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, TrendingUp } from 'lucide-react'
import { formatBRL } from '../lib/parse-finance'

interface EditMetaDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentMeta: number
  mesLabel: string
  diasNoMes: number
  onSave: (newMeta: number) => Promise<void>
}

export const EditMetaDialog: React.FC<EditMetaDialogProps> = ({
  open, onOpenChange, currentMeta, mesLabel, diasNoMes, onSave,
}) => {
  const [value, setValue] = useState(String(currentMeta))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setValue(String(currentMeta))
  }, [open, currentMeta])

  const numValue = parseFloat(value.replace(',', '.')) || 0
  const metaMensal = numValue * diasNoMes
  const metaAnual = numValue * 365

  const handleSave = async () => {
    if (numValue <= 0) return
    setSaving(true)
    try {
      await onSave(numValue)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-primary" />
            Editar Meta Financeira
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Meta diária input */}
          <div className="space-y-1.5">
            <Label htmlFor="meta-diaria" className="text-xs font-semibold">
              Meta diária (R$)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                id="meta-diaria"
                type="number"
                min="1"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                className="pl-9 font-mono"
                placeholder="40"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
          </div>

          {/* Live previews */}
          <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Meta mensal ({mesLabel} · {diasNoMes} dias)</span>
              <span className="font-semibold font-mono text-foreground">{formatBRL(metaMensal)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-border/50 pt-2">
              <span className="text-muted-foreground text-xs">Meta anual (365 dias)</span>
              <span className="font-bold font-mono text-primary">{formatBRL(metaAnual)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || numValue <= 0}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? 'Salvando...' : 'Salvar meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
