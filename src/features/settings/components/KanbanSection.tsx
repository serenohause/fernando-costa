import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Columns3, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  describeDatabaseError,
  useCreateKanbanColumn,
  useDeleteKanbanColumn,
  useKanbanBoard,
  useOpenTaskCountByPhase,
  useRenameKanbanBoard,
  useReorderKanbanColumns,
  useUpdateKanbanColumn,
} from '@/features/kanban/hooks'
import { columnSwatchClass, type KanbanColumnRow } from '@/features/kanban/types'
import KanbanColumnDialog, { type KanbanColumnFormValues } from './KanbanColumnDialog'
import KanbanDeleteDialog from './KanbanDeleteDialog'

const BOARD_KEY = 'project_flow'

/*
  O QUADRO DO FLUXO DO PROJETO, configurável — escopo desta fatia, decidido pelo
  usuário ("apenas no Fluxo de Projeto").

  O QUE ESTA TELA NÃO OFERECE, E POR QUÊ:
  não há "Nova etapa" nem exclusão. Enquanto `tasks.phase` for o enum
  `project_phase`, uma etapa criada aqui não poderia receber tarefa nenhuma — o
  escritório criaria uma coluna que não funciona e não teria como saber por quê.
  E excluir tiraria a etapa da escala de progresso em silêncio. As duas coisas
  chegam com a troca de `tasks.phase` por chave estrangeira; o banco também não
  as aceita hoje (a migration 0093 não criou policy de INSERT nem de DELETE).

  OCULTAR É O GESTO QUE EXISTE NO LUGAR DE EXCLUIR, e é reversível — as cinco
  etapas que hoje não aparecem no quadro (Revisão, Alvará de Construção,
  Aguardando Cliente, Estudo preliminar e Anteprojeto) estão aqui, ocultas, e
  podem voltar.
*/
export default function KanbanSection({ canEdit }: { canEdit: boolean }) {
  const boardQuery = useKanbanBoard(BOARD_KEY)
  const countsQuery = useOpenTaskCountByPhase()
  const updateColumn = useUpdateKanbanColumn(BOARD_KEY)
  const renameBoard = useRenameKanbanBoard(BOARD_KEY)
  const reorder = useReorderKanbanColumns(BOARD_KEY)
  const createColumn = useCreateKanbanColumn()
  const deleteColumn = useDeleteKanbanColumn()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<KanbanColumnRow | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [boardName, setBoardName] = useState('')
  const [deleting, setDeleting] = useState<KanbanColumnRow | null>(null)

  const board = boardQuery.data ?? null
  const columns = board?.columns ?? []
  const counts = countsQuery.data ?? {}

  const handleSubmit = (values: KanbanColumnFormValues) => {
    if (!editing) {
      if (!board) return
      createColumn.mutate(
        {
          boardId: board.id,
          tenantId: board.tenant_id,
          label: values.label,
          color: values.color,
          progressPercent: values.progress_percent,
          allowsInReview: values.allows_in_review,
          allowsAwaitingClient: values.allows_awaiting_client,
          lastOrder: columns.reduce((maior, column) => Math.max(maior, column.display_order), 0),
        },
        {
          onSuccess: () => {
            setDialogOpen(false)
            toast.success('Etapa criada')
          },
          onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    updateColumn.mutate(
      { id: editing.id, ...values },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setEditing(null)
          toast.success('Etapa atualizada')
        },
        onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
      },
    )
  }

  /*
    OCULTAR ETAPA COM TAREFA ABERTA DENTRO É O GESTO PERIGOSO DESTA TELA: as
    tarefas não somem do banco, mas somem do quadro, e quem for procurá-las não
    vai achar. Avisar com o número na mão é o que transforma isso numa decisão
    em vez de uma surpresa.
  */
  const handleToggleActive = (column: KanbanColumnRow) => {
    const abertas = counts[column.key] ?? 0

    if (column.is_active && abertas > 0) {
      const confirmado = window.confirm(
        `“${column.label}” tem ${abertas} ${abertas === 1 ? 'tarefa aberta' : 'tarefas abertas'}. ` +
          'Ocultando a etapa, essas tarefas deixam de aparecer no quadro — elas não são apagadas, ' +
          'e voltam a aparecer se a etapa for reexibida.\n\nOcultar mesmo assim?',
      )
      if (!confirmado) return
    }

    updateColumn.mutate(
      { id: column.id, is_active: !column.is_active },
      { onError: (error) => toast.error('Erro ao alterar: ' + describeDatabaseError(error)) },
    )
  }

  /* A lista chega na ordem desejada e o hook renumera de 1 a n. */
  const handleMove = (index: number, direction: -1 | 1) => {
    const destino = index + direction
    if (destino < 0 || destino >= columns.length) return

    const reordenadas = [...columns]
    const [movida] = reordenadas.splice(index, 1)
    reordenadas.splice(destino, 0, movida)

    reorder.mutate(reordenadas, {
      onError: (error) => toast.error('Erro ao reordenar: ' + describeDatabaseError(error)),
    })
  }

  const handleDelete = (moveToKey: string | null) => {
    if (!deleting) return
    deleteColumn.mutate(
      { column: deleting, moveToKey, openTaskCount: counts[deleting.key] ?? 0 },
      {
        onSuccess: () => {
          setDeleting(null)
          toast.success('Etapa excluída')
        },
        onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
      },
    )
  }

  const handleRenameBoard = () => {
    if (!board) return
    const nome = boardName.trim()
    if (nome === '' || nome === board.name) {
      setEditingName(false)
      return
    }
    renameBoard.mutate(
      { id: board.id, name: nome },
      {
        onSuccess: () => {
          setEditingName(false)
          toast.success('Quadro renomeado')
        },
        onError: (error) => toast.error('Erro ao renomear: ' + describeDatabaseError(error)),
      },
    )
  }

  if (boardQuery.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o quadro"
        description="A configuração do Fluxo do Projeto não pôde ser lida agora."
        error={boardQuery.error}
        onRetry={() => {
          void boardQuery.refetch()
        }}
      />
    )
  }

  if (boardQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className="h-14 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!board) {
    return (
      <div className="text-center py-16 bg-card rounded-xl border border-border">
        <Columns3 className="w-12 h-12 text-faint mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Quadro não encontrado</p>
        <p className="text-faint text-sm mt-1">
          O Fluxo do Projeto deste escritório não tem configuração gravada.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Quadros</h2>
          <p className="text-sm text-muted-foreground mt-1">
            As etapas do Fluxo do Projeto: nome, cor, ordem e quanto cada uma representa do
            progresso.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Etapa
          </Button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Nome do quadro
        </p>
        {editingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              maxLength={60}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleRenameBoard()
                if (event.key === 'Escape') setEditingName(false)
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Salvar nome do quadro"
              onClick={handleRenameBoard}
              disabled={renameBoard.isPending}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cancelar"
              onClick={() => setEditingName(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{board.name}</p>
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Renomear quadro"
                onClick={() => {
                  setBoardName(board.name)
                  setEditingName(true)
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {columns.map((column, index) => {
          const abertas = counts[column.key] ?? 0
          return (
            <div key={column.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`w-3 h-3 rounded-full shrink-0 ${columnSwatchClass(column.color)}`}
                aria-hidden
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={
                      column.is_active
                        ? 'font-medium text-foreground'
                        : 'font-medium text-muted-foreground'
                    }
                  >
                    {column.label}
                  </p>
                  {!column.is_active && (
                    <Badge variant="outline" className="text-muted-foreground border-border">
                      Oculta
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-muted-foreground border-border">
                    {column.progress_percent === null
                      ? 'Fora do progresso'
                      : `${column.progress_percent}%`}
                  </Badge>
                  {/* Só aparece quando a etapa oferece alguma: dez das quinze
                      padrão não oferecem nenhuma, e um crachá "sem status" em
                      todas elas seria ruído. */}
                  {(column.allows_in_review || column.allows_awaiting_client) && (
                    <Badge variant="outline" className="text-muted-foreground border-border">
                      {[
                        column.allows_in_review ? 'Em Revisão' : null,
                        column.allows_awaiting_client ? 'Aguardando Cliente' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-faint mt-0.5">
                  {abertas === 0
                    ? 'Nenhuma tarefa aberta'
                    : `${abertas} ${abertas === 1 ? 'tarefa aberta' : 'tarefas abertas'}`}
                </p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir ${column.label}`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => handleMove(index, -1)}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer ${column.label}`}
                    disabled={index === columns.length - 1 || reorder.isPending}
                    onClick={() => handleMove(index, 1)}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${column.label}`}
                    onClick={() => {
                      setEditing(column)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {/*
                    "Não iniciado" e "Finalizado" não têm botão de excluir: são as
                    duas etapas que o sistema grava sozinho em `current_phase`
                    (projeto sem tarefas, projeto concluído), e um gatilho do
                    banco recusa apagá-las. Ocultar as duas continua permitido.
                  */}
                  {column.key !== 'not_started' && column.key !== 'finished' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${column.label}`}
                      onClick={() => setDeleting(column)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pl-2">
                <Switch
                  checked={column.is_active}
                  disabled={!canEdit || updateColumn.isPending}
                  aria-label={`${column.is_active ? 'Ocultar' : 'Mostrar'} ${column.label}`}
                  onCheckedChange={() => handleToggleActive(column)}
                />
                <span className="text-xs text-muted-foreground w-20">
                  {column.is_active ? 'No quadro' : 'Oculta'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-faint mt-3">
        Ocultar tira a etapa do quadro sem perder nada e pode ser desfeito. Excluir é definitivo, e
        o sistema pergunta para onde vão as tarefas antes.
      </p>

      <KanbanColumnDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        onSubmit={handleSubmit}
        isPending={updateColumn.isPending || createColumn.isPending}
      />

      <KanbanDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        column={deleting}
        columns={columns}
        openTaskCount={deleting ? (counts[deleting.key] ?? 0) : 0}
        onConfirm={handleDelete}
        isPending={deleteColumn.isPending}
      />
    </div>
  )
}
