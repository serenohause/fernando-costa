import { toast } from 'sonner'
import {
  describeDatabaseError,
  useCreateKanbanColumn,
  useKanbanBoard,
  useOperationalTags,
  useReplaceColumnObjectives,
  useReplaceColumnReviewMarks,
  useSetColumnOperationalTags,
  useUpdateKanbanColumn,
} from '@/features/kanban/hooks'
import { sameObjectiveGroups, type ObjectiveTemplateGroup } from '@/features/kanban/objectives'
import { sameReviewMarks, type ReviewMarkTemplate } from '@/features/kanban/review-marks'
import type { KanbanColumnWithTags } from '@/features/kanban/types'
import KanbanColumnDialog, { type KanbanColumnFormValues } from './KanbanColumnDialog'

/*
  CRIAR OU EDITAR UMA ETAPA — o diálogo e as escritas dele, num lugar só.

  Existe porque a etapa passou a ter DOIS caminhos de edição: Configurações →
  Quadros e o lápis no cabeçalho da coluna do Fluxo do Projeto. As escritas são
  três (a etapa, os status que ela oferece e o modelo de objetivos) e têm ordem;
  duas cópias disso seriam duas chances de uma tela salvar os objetivos e a
  outra esquecer.

  QUEM PODE: quem chama decide mostrar o botão (`useMenuPermissions('settings')`),
  e quem autoriza de fato é a RLS das tabelas do quadro, que exige
  `can_edit_menu('settings')` venha a escrita de qual tela vier.
*/
export default function KanbanColumnEditDialog({
  boardKey,
  open,
  onOpenChange,
  editing,
}: {
  boardKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /* Nulo é "Nova etapa". */
  editing: KanbanColumnWithTags | null
}) {
  const boardQuery = useKanbanBoard(boardKey)
  const tagsQuery = useOperationalTags()
  const createColumn = useCreateKanbanColumn()
  const updateColumn = useUpdateKanbanColumn(boardKey)
  const setColumnTags = useSetColumnOperationalTags(boardKey)
  const replaceObjectives = useReplaceColumnObjectives(boardKey)
  const replaceReviewMarks = useReplaceColumnReviewMarks(boardKey)

  const board = boardQuery.data ?? null
  const columns = board?.columns ?? []

  /*
    O MODELO DE OBJETIVOS é a terceira escrita, depois da etapa e dos status: a
    etapa nova só tem id depois do INSERT. Só vai ao banco se mudou — quem abriu
    a etapa para trocar a cor não regrava o modelo.
  */
  const salvarObjetivos = (
    columnId: string,
    groups: ObjectiveTemplateGroup[],
    anterior: ObjectiveTemplateGroup[],
  ) => {
    if (sameObjectiveGroups(groups, anterior)) return
    replaceObjectives.mutate(
      { columnId, groups },
      {
        onError: (error) =>
          toast.error('A etapa foi salva, mas os objetivos padrão não: ' + describeDatabaseError(error)),
      },
    )
  }

  /*
    OS BOTÕES DE REVISÃO (0131) são a quarta escrita, e seguem a mesma regra dos
    objetivos: só vão ao banco se mudaram. Quem abriu a etapa para trocar a cor
    não reescreve a lista de botões — e reescrever não quebraria nada, porque a
    marca já feita é cópia, mas seriam duas idas ao banco por nada.
  */
  const salvarBotoes = (
    columnId: string,
    marks: ReviewMarkTemplate[],
    anterior: ReviewMarkTemplate[],
  ) => {
    if (sameReviewMarks(marks, anterior)) return
    replaceReviewMarks.mutate(
      { columnId, marks },
      {
        onError: (error) =>
          toast.error(
            'A etapa foi salva, mas os botões de revisão não: ' + describeDatabaseError(error),
          ),
      },
    )
  }

  const handleSubmit = (values: KanbanColumnFormValues) => {
    if (!board) return

    if (!editing) {
      createColumn.mutate(
        {
          boardId: board.id,
          tenantId: board.tenant_id,
          label: values.label,
          color: values.color,
          progressPercent: values.progress_percent,
          showsProjectRooms: values.shows_project_rooms,
          lastOrder: columns.reduce((maior, column) => Math.max(maior, column.display_order), 0),
        },
        {
          onSuccess: (novaEtapaId) => {
            /* A ligação de status precisa do id que só existe depois do INSERT. */
            if (values.tagIds.length > 0) {
              setColumnTags.mutate({
                columnId: novaEtapaId,
                tenantId: board.tenant_id,
                tagIds: values.tagIds,
              })
            }
            salvarObjetivos(novaEtapaId, values.objectiveGroups, [])
            salvarBotoes(novaEtapaId, values.reviewMarks, [])
            onOpenChange(false)
            toast.success('Etapa criada')
          },
          onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    /* `reviewMarks` sai daqui de propósito: ele não é coluna de
       `kanban_columns`, e cair no spread mandaria um campo inexistente para o
       UPDATE. */
    const { tagIds, objectiveGroups, reviewMarks, ...colunas } = values
    updateColumn.mutate(
      { id: editing.id, ...colunas },
      {
        onSuccess: () => {
          setColumnTags.mutate({ columnId: editing.id, tenantId: board.tenant_id, tagIds })
          salvarObjetivos(editing.id, objectiveGroups, editing.objectiveGroups)
          salvarBotoes(editing.id, reviewMarks, editing.reviewMarks)
          onOpenChange(false)
          toast.success('Etapa atualizada')
        },
        onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
      },
    )
  }

  return (
    <KanbanColumnDialog
      open={open}
      onOpenChange={onOpenChange}
      editing={editing}
      tags={tagsQuery.data ?? []}
      onSubmit={handleSubmit}
      isPending={
        updateColumn.isPending ||
        createColumn.isPending ||
        setColumnTags.isPending ||
        replaceObjectives.isPending ||
        replaceReviewMarks.isPending
      }
    />
  )
}
