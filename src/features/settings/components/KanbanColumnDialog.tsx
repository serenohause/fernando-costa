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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  COLUMN_COLORS,
  COLUMN_COLOR_VALUES,
  type KanbanColumnRow,
} from '@/features/kanban/types'

export type KanbanColumnFormValues = {
  label: string
  color: string
  progress_percent: number | null
  allows_in_review: boolean
  allows_awaiting_client: boolean
}

/*
  O PERCENTUAL É O CAMPO QUE MERECE EXPLICAÇÃO NA TELA, e não só no banco.

  Vazio não é zero: a etapa sem percentual sai da conta e o projeto passa a valer
  a etapa mais avançada entre as DEMAIS tarefas. É o que "Aguardando Cliente"
  sempre fez — esperar o cliente não empurra nem segura o progresso. Zero é outra
  coisa: é uma etapa que existe e vale nada, como "Não iniciado".

  Quem edita isto não leu a migration 0075. Por isso a distinção está escrita
  abaixo do campo, e não só num comentário de código.
*/
export default function KanbanColumnDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: KanbanColumnRow | null
  onSubmit: (values: KanbanColumnFormValues) => void
  isPending: boolean
}) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string>('slate')
  const [percent, setPercent] = useState('')
  const [allowsInReview, setAllowsInReview] = useState(false)
  const [allowsAwaitingClient, setAllowsAwaitingClient] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setLabel(editing.label)
      setColor(editing.color)
      setPercent(editing.progress_percent === null ? '' : String(editing.progress_percent))
      setAllowsInReview(editing.allows_in_review)
      setAllowsAwaitingClient(editing.allows_awaiting_client)
      return
    }
    /* Etapa nova entra em branco e sem percentual — vazio é "fora da conta", que
       é o padrão honesto para quem ainda não decidiu quanto ela vale. */
    setLabel('')
    setColor('slate')
    setPercent('')
    /* Etapa nova nasce SEM status operacional, que é o que dez das quinze etapas
       padrão fazem. Ligar por padrão poria um submenu no cartão que ninguém
       pediu. */
    setAllowsInReview(false)
    setAllowsAwaitingClient(false)
  }, [open, editing])

  const percentTrimmed = percent.trim()
  const percentNumber = percentTrimmed === '' ? null : Number(percentTrimmed)
  const percentInvalid =
    percentNumber !== null &&
    (!Number.isInteger(percentNumber) || percentNumber < 0 || percentNumber > 100)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (percentInvalid || label.trim() === '') return
    onSubmit({
      label: label.trim(),
      color,
      progress_percent: percentNumber,
      allows_in_review: allowsInReview,
      allows_awaiting_client: allowsAwaitingClient,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar etapa' : 'Nova etapa'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'O nome e a cor valem para o quadro do Fluxo do Projeto. As tarefas já gravadas nesta etapa continuam nela.'
              : 'A etapa entra no fim do quadro e já pode receber tarefas. A ordem se ajusta depois, com as setas.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="kanban-column-label">Nome da etapa</Label>
            <Input
              id="kanban-column-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={40}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Cor do cabeçalho</Label>
            <div className="flex flex-wrap gap-2">
              {COLUMN_COLOR_VALUES.map((value) => {
                const option = COLUMN_COLORS[value]
                const selected = value === color
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColor(value)}
                    aria-label={option.label}
                    aria-pressed={selected}
                    title={option.label}
                    className={`w-8 h-8 rounded-lg border-2 transition-colors ${option.header} ${
                      selected ? 'border-primary' : 'border-border hover:border-muted-foreground'
                    }`}
                  />
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kanban-column-percent">Percentual de progresso</Label>
            <Input
              id="kanban-column-percent"
              inputMode="numeric"
              value={percent}
              onChange={(event) => setPercent(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Deixe vazio para não contar"
              maxLength={3}
              aria-invalid={percentInvalid}
            />
            <p className="text-xs text-muted-foreground">
              Quanto o projeto vale quando chega nesta etapa.{' '}
              <strong className="font-medium text-foreground">Vazio não é zero:</strong> a etapa
              fica fora do cálculo e o projeto vale a etapa mais avançada entre as outras tarefas.
            </p>
            {percentInvalid && (
              <p className="text-xs text-destructive">Informe um número entre 0 e 100.</p>
            )}
          </div>

          {/*
            O STATUS OPERACIONAL É POR ETAPA, e as duas tags são marcas
            separadas porque o recorte que existe hoje tem quatro estados — um
            deles é "só Em Revisão", em Projeto Legal e Projeto Executivo. Um
            interruptor único não saberia representá-lo.

            É OFERTA DE MENU, e não trava: a tarefa pode ter qualquer tag em
            qualquer etapa (migration 0074). Desmarcar aqui tira o submenu do
            cartão; não apaga tag nenhuma que já esteja gravada.
          */}
          <div className="space-y-3">
            <Label>Status operacional</Label>
            <div className="flex items-start gap-3">
              <Checkbox
                id="kanban-column-in-review"
                checked={allowsInReview}
                onCheckedChange={(checked) => setAllowsInReview(checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor="kanban-column-in-review" className="font-normal">
                Oferecer “Em Revisão”
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="kanban-column-awaiting-client"
                checked={allowsAwaitingClient}
                onCheckedChange={(checked) => setAllowsAwaitingClient(checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor="kanban-column-awaiting-client" className="font-normal">
                Oferecer “Aguardando Cliente”
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              A tag pausa o prazo do cartão: some a data de vencimento e a borda de atraso enquanto
              ela estiver marcada. Sem nenhuma das duas, o cartão desta etapa não mostra o submenu.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || percentInvalid || label.trim() === ''}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
