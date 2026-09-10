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
  tagStyleOf,
  type KanbanColumnWithTags,
  type OperationalTagRow,
} from '@/features/kanban/types'

export type KanbanColumnFormValues = {
  label: string
  color: string
  progress_percent: number | null
  /* Os IDs dos status que esta etapa oferece. Ids e não chaves porque é o que a
     tabela de ligação guarda (migration 0097). */
  tagIds: string[]
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
  tags,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: KanbanColumnWithTags | null
  tags: OperationalTagRow[]
  onSubmit: (values: KanbanColumnFormValues) => void
  isPending: boolean
}) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string>('slate')
  const [percent, setPercent] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setLabel(editing.label)
      setColor(editing.color)
      setPercent(editing.progress_percent === null ? '' : String(editing.progress_percent))
      setTagIds(tags.filter((tag) => editing.tagKeys.includes(tag.key)).map((tag) => tag.id))
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
    setTagIds([])
  }, [open, editing, tags])

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
      tagIds,
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
            OS STATUS QUE ESTA ETAPA OFERECE. A lista vem do cadastro
            (migration 0097), e não de dois checkboxes fixos: o escritório cria
            os status que quiser, com nome e cor próprios.

            É OFERTA DE MENU, e não trava: a tarefa pode ter qualquer status em
            qualquer etapa (migration 0074). Desmarcar aqui tira o submenu do
            cartão; não apaga marca nenhuma que já esteja gravada.
          */}
          <div className="space-y-3">
            <Label>Status operacional</Label>

            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum status cadastrado. Crie um em Configurações → Status operacional.
              </p>
            ) : (
              tags.map((tag) => {
                const marcado = tagIds.includes(tag.id)
                return (
                  <div key={tag.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`kanban-column-tag-${tag.id}`}
                      checked={marcado}
                      onCheckedChange={(checked) =>
                        setTagIds((atual) =>
                          checked === true
                            ? [...atual, tag.id]
                            : atual.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${tagStyleOf(tag.color).dot}`}
                      aria-hidden
                    />
                    <Label htmlFor={`kanban-column-tag-${tag.id}`} className="font-normal">
                      {tag.label}
                      {!tag.is_active && (
                        <span className="text-muted-foreground"> (desativado)</span>
                      )}
                    </Label>
                  </div>
                )
              })
            )}

            <p className="text-xs text-muted-foreground">
              O status pausa o prazo do cartão: some a data de vencimento e a borda de atraso
              enquanto ele estiver marcado. Sem nenhum, o cartão desta etapa não mostra o submenu.
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
