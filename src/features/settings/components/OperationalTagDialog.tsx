import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TAG_COLORS, TAG_COLOR_VALUES, type OperationalTagRow } from '@/features/kanban/types'

export type OperationalTagFormValues = {
  label: string
  color: string
}

/*
  O CADASTRO DE UM STATUS OPERACIONAL (migration 0097).

  Nome e cor, e nada além — foi o pedido, e é o que faz sentido: o ícone do
  crachá continua no código (escolher um ícone numa lista de centenas é uma tela
  inteira), e a chave é derivada do nome, pelo mesmo motivo dos tipos de serviço
  e das etapas do quadro.

  A COR APARECE COMO ELA VAI APARECER — o botão da paleta usa as mesmas classes
  do crachá do cartão, não um quadradinho aproximado. Quem escolhe está vendo o
  resultado.
*/
export default function OperationalTagDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: OperationalTagRow | null
  onSubmit: (values: OperationalTagFormValues) => void
  isPending: boolean
}) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string>('slate')

  useEffect(() => {
    if (!open) return
    setLabel(editing?.label ?? '')
    setColor(editing?.color ?? 'slate')
  }, [open, editing])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (label.trim() === '') return
    onSubmit({ label: label.trim(), color })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar status' : 'Novo status'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'O nome e a cor valem para o crachá do cartão. As tarefas já marcadas com este status continuam marcadas.'
              : 'O status fica disponível para as etapas do quadro. Escolha em quais ele aparece na tela de Quadros.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="operational-tag-label">Nome do status</Label>
            <Input
              id="operational-tag-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={40}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Cor do crachá</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLOR_VALUES.map((value) => {
                const option = TAG_COLORS[value]
                const selected = value === color
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColor(value)}
                    aria-label={option.label}
                    aria-pressed={selected}
                    title={option.label}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition-all ${option.badge} ${
                      selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
                    }`}
                  >
                    {label.trim() === '' ? option.label : label.trim()}
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || label.trim() === ''}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
