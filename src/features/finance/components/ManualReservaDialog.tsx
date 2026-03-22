import React, { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBRL } from '../lib/parse-finance'
import { CalendarDays, Plus } from 'lucide-react'

interface ManualReservaDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  metaDiaria: number
  onSave: (dates: string[], valor: number) => Promise<void>
}

export const ManualReservaDialog: React.FC<ManualReservaDialogProps> = ({
  open, onOpenChange, metaDiaria, onSave,
}) => {
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [dateInput, setDateInput] = useState('')
  const [valorCustom, setValorCustom] = useState<string>(String(metaDiaria))
  const [saving, setSaving] = useState(false)

  const valor = parseFloat(valorCustom.replace(',', '.')) || metaDiaria

  const addDate = () => {
    const trimmed = dateInput.trim()
    if (!trimmed) return
    // Accept DD/MM or YYYY-MM-DD
    let iso = trimmed
    const ddmm = trimmed.match(/^(\d{2})\/(\d{2})$/)
    if (ddmm) {
      const year = new Date().getFullYear()
      iso = `${year}-${ddmm[2]}-${ddmm[1]}`
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return
    if (!selectedDates.includes(iso)) {
      setSelectedDates(prev => [...prev, iso].sort())
    }
    setDateInput('')
  }

  const removeDate = (d: string) => setSelectedDates(prev => prev.filter(x => x !== d))

  const handleSave = async () => {
    if (!selectedDates.length) return
    setSaving(true)
    try {
      await onSave(selectedDates, valor)
      setSelectedDates([])
      setDateInput('')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const formatDisplayDate = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            Registrar Reservas Retroativas
          </DialogTitle>
          <DialogDescription className="sr-only">
            Registre reservas de dias anteriores que não foram capturadas pelo bot
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Adicione os dias que você guardou mas o bot não registrou. Cada dia gera uma nota de reserva de{' '}
            <strong>{formatBRL(metaDiaria)}</strong>.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Valor por dia</Label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground px-2">R$</span>
              <Input
                className="h-8 text-sm"
                value={valorCustom}
                onChange={e => setValorCustom(e.target.value)}
                placeholder={String(metaDiaria)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Adicionar data (DD/MM ou YYYY-MM-DD)</Label>
            <div className="flex gap-2">
              <Input
                className="h-8 text-sm"
                placeholder="ex: 17/03"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDate() } }}
              />
              <Button size="sm" className="h-8 px-3 shrink-0" onClick={addDate} type="button">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {selectedDates.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1">
              <p className="text-[11px] text-muted-foreground font-medium">
                {selectedDates.length} dia(s) selecionado(s) — Total: {formatBRL(valor * selectedDates.length)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedDates.map(d => (
                  <button
                    key={d}
                    onClick={() => removeDate(d)}
                    className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Clique para remover"
                  >
                    {formatDisplayDate(d)} ×
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || selectedDates.length === 0}
          >
            {saving ? 'Salvando...' : `Registrar ${selectedDates.length > 1 ? `${selectedDates.length} dias` : 'dia'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
