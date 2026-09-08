import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { KanbanColumnRow } from '@/features/kanban/types'

/*
  EXCLUIR ETAPA PERGUNTA PARA ONDE VAI O TRABALHO — decisão do usuário, e é ela
  que separa este diálogo de uma confirmação comum.

  Sem a pergunta, restariam duas saídas ruins: apagar as tarefas junto (perder
  trabalho real) ou deixar a etapa impossível de excluir enquanto tiver qualquer
  cartão (o escritório não teria como se livrar de uma etapa que criou errado).
  O banco recusa a exclusão enquanto houver tarefa (`tasks_phase_fkey`, restrict),
  então esta tela não é a única barreira — é a que explica.

  ETAPA VAZIA NÃO PERGUNTA NADA: não há trabalho para realocar, e obrigar a
  escolher um destino inventaria uma decisão sem consequência.
*/
export default function KanbanDeleteDialog({
  open,
  onOpenChange,
  column,
  columns,
  openTaskCount,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  column: KanbanColumnRow | null
  columns: KanbanColumnRow[]
  openTaskCount: number
  onConfirm: (moveToKey: string | null) => void
  isPending: boolean
}) {
  const [destino, setDestino] = useState('')

  useEffect(() => {
    if (open) setDestino('')
  }, [open, column])

  if (!column) return null

  /*
    "Finalizado" fica FORA dos destinos: o banco recusa tarefa nessa etapa
    (`tasks_phase_not_finished_check`) porque ela junta as concluídas de todas as
    demais. Oferecê-la seria oferecer um destino que falha na gravação.
  */
  const destinos = columns
    .filter((candidate) => candidate.id !== column.id && candidate.key !== 'finished')
    .sort((a, b) => a.display_order - b.display_order)

  const precisaDestino = openTaskCount > 0
  const podeConfirmar = !precisaDestino || destino !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Excluir “{column.label}”</DialogTitle>
          <DialogDescription>
            {precisaDestino
              ? 'A etapa tem trabalho aberto dentro. Escolha para onde as tarefas vão antes de excluí-la.'
              : 'A etapa não tem tarefa aberta nenhuma. Ela sai do quadro e não volta.'}
          </DialogDescription>
        </DialogHeader>

        {precisaDestino && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {openTaskCount === 1
                  ? '1 tarefa aberta será movida.'
                  : `${openTaskCount} tarefas abertas serão movidas.`}{' '}
                Elas mudam de etapa de verdade — não é só a tela.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kanban-delete-destino">Mover as tarefas para</Label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger id="kanban-delete-destino">
                  <SelectValue placeholder="Escolha a etapa de destino" />
                </SelectTrigger>
                <SelectContent>
                  {destinos.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.key}>
                      {candidate.label}
                      {!candidate.is_active && ' (oculta)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || !podeConfirmar}
            onClick={() => onConfirm(precisaDestino ? destino : null)}
          >
            {isPending ? 'Excluindo...' : 'Excluir etapa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
