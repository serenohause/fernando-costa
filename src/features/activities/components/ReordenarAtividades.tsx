import { useEffect, useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { AlertCircle, Calendar, GripVertical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Collaborator } from '@/features/team/types'
import { formatDateBR } from '@/lib/format'
import { COLLABORATOR_ROLE, PRIORITY_LEVEL, WORK_STATUS, labelOf } from '@/lib/enums'
import { isOverdue, queueOf } from '../list'
import { PRIORITY_BADGE, PROJECT_BADGE } from './priority-styles'
import type { ActivityRow } from '../types'

/*
  Porta de projeto-original/src/components/atividades/ReordenarAtividades.jsx.

  O seletor de colaborador com a contagem entre parênteses, a lista arrastável
  com a alça, o quadrado com "#n", os crachás de prioridade, status e projeto, o
  fundo rosado da linha atrasada, a mensagem de fila vazia e os dois botões do
  rodapé são os do original, na mesma ordem.

  A FILA É POR PESSOA, e isso deixou de ser só convenção da tela: o índice único
  é `(tenant_id, collaborator_id, execution_order)` (migration 0037, item 4).
  Duas atividades de responsáveis diferentes podem ocupar a posição 1; duas do
  mesmo responsável, não. No original nada impede a segunda situação, e a lista
  passa a depender do critério de desempate.

  Quem grava é `useReorderActivities`, num upsert único — ver o comentário lá
  sobre a constraint diferível.
*/
export default function ReordenarAtividades({
  open,
  onClose,
  onSave,
  isSaving,
  activities,
  collaborators,
}: {
  open: boolean
  onClose: () => void
  onSave: (ordered: ActivityRow[]) => void
  isSaving: boolean
  activities: ActivityRow[]
  collaborators: Collaborator[]
}) {
  const [selectedId, setSelectedId] = useState('')
  const [queue, setQueue] = useState<ActivityRow[]>([])

  useEffect(() => {
    if (!selectedId) {
      setQueue([])
      return
    }
    setQueue(queueOf(activities, selectedId))
  }, [selectedId, activities])

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const items = [...queue]
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setQueue(items)
  }

  /*
    Só colaborador ativo que tenha atividade aberta (linhas 73-76). A lista que
    alimenta esta conta já vem recortada pela policy: quem não tem
    `can_edit_menu('activities')` só recebe as próprias atividades — e o botão que
    abre este diálogo também é dele.
  */
  const candidates = collaborators
    .filter((collaborator) => collaborator.status === 'active')
    .filter((collaborator) =>
      activities.some(
        (activity) =>
          activity.collaborator_id === collaborator.id && activity.status !== 'completed',
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reordenar Atividades por Responsável</DialogTitle>
          <DialogDescription>
            Selecione um colaborador e arraste as atividades para definir a ordem de execução
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label>Colaborador</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um colaborador" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((collaborator) => {
                  const count = activities.filter(
                    (activity) =>
                      activity.collaborator_id === collaborator.id &&
                      activity.status !== 'completed',
                  ).length
                  return (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name} — {labelOf(COLLABORATOR_ROLE, collaborator.role)} ({count}{' '}
                      atividades)
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedId && queue.length > 0 && (
            <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-elevated">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="activities">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2"
                    >
                      {queue.map((activity, index) => {
                        const late = isOverdue(activity)

                        return (
                          <Draggable key={activity.id} draggableId={activity.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`
                                  rounded-lg p-4 border-2 transition-all
                                  ${dragSnapshot.isDragging ? 'shadow-lg border-faint' : 'border-border'}
                                  ${late ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-card'}
                                `}
                              >
                                <div className="flex items-start gap-3">
                                  <GripVertical className="w-5 h-5 text-faint shrink-0 mt-1" />

                                  <div className="flex items-center justify-center w-8 h-8 bg-muted rounded-lg shrink-0">
                                    <span className="text-sm font-semibold text-soft">
                                      #{index + 1}
                                    </span>
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <p className="font-medium text-foreground">
                                        {activity.description}
                                      </p>
                                      {late && (
                                        <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={PRIORITY_BADGE[activity.priority]}
                                      >
                                        {labelOf(PRIORITY_LEVEL, activity.priority)}
                                      </Badge>

                                      <Badge variant="outline" className="bg-elevated text-soft">
                                        {labelOf(WORK_STATUS, activity.status)}
                                      </Badge>

                                      <div className="flex items-center gap-1 text-xs text-soft">
                                        <Calendar className="w-3 h-3" />
                                        {formatDateBR(activity.end_date)}
                                      </div>

                                      {activity.project && (
                                        <Badge
                                          variant="outline"
                                          className={`${PROJECT_BADGE} text-xs`}
                                        >
                                          {activity.project.name}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}

          {selectedId && queue.length === 0 && (
            <div className="flex-1 flex items-center justify-center border rounded-lg p-8 bg-elevated">
              <p className="text-muted-foreground">Nenhuma atividade aberta para este colaborador</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSave(queue)}
            disabled={!selectedId || queue.length === 0 || isSaving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Salvar Ordem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
