import { useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  MoreVertical,
  Pencil,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Collaborator } from '@/features/team/types'
import ProjectDiaryDrawer from '@/features/diary/components/ProjectDiaryDrawer'
import type { DiaryProject } from '@/features/diary/types'
import {
  COLLABORATOR_ROLE,
  PROJECT_PHASE,
  TASK_PRIORITY,
  labelOf,
  type ProjectPhase,
  type TaskPriority,
} from '@/lib/enums'
import { moveTaskToPhase, tasksInColumn, type MoveOutcome } from '../flow'
import { isTaskOverdue } from '../list'
import { operationalCandidates } from './TaskForm'
import type {
  ProjectProgress,
  ProjectRow,
  TaskChecklistItem,
  TaskPhaseMove,
  TaskRow,
} from '../types'

/*
  Porta de projeto-original/src/components/tasks/TaskKanban.jsx.

  As doze colunas do original na mesma ordem — mais "Em Obra", que veio da
  migration 0061 e não existe lá (ver COLUMNS) —, a largura fixa de 280px, as
  alturas `calc(100vh - 280px)` e `calc(100vh - 300px)`, o cabeçalho colorido por
  coluna,
  o aviso de travamento em rosa, a dica "← Deslize →" no celular, o cartão com
  selo de progresso, prioridade, etapa, responsável, prazo, horas e o checklist
  retrátil são os do original.

  QUATRO TRADUÇÕES OBRIGATÓRIAS, e nenhuma é escolha de layout:

  1. O `droppableId` do original é o RÓTULO em português ("Projeto Legal"), que
     lá é também o valor gravado. Aqui o valor do banco é `legal_permit` e o
     rótulo vive em src/lib/enums.ts. O id da coluna passa a ser o valor; o
     título continua sendo exatamente o mesmo texto na tela.
  2. O PROGRESSO do selo vem da view `project_progress` (`progress_percent`), e
     não de `project.progresso_percentual`: aquela coluna não existe mais e o
     cálculo é do banco (decisão 2 do SCHEMA-PLAN).
  3. `project_name` e `responsible_name` viram embed.
  4. O checklist é `task_checklist_items`, uma linha com id próprio por item. No
     original é array dentro da tarefa e o item é marcado por ÍNDICE, com o
     índice reencontrado por `findIndex` sobre título+etapa a cada clique
     (linha 551) — o que erra o alvo quando dois itens têm o mesmo título.

  O QUE NÃO FOI PORTADO: a criação do checklist DENTRO do render
  (`getTasksByPhase` chamando `onUpdateTask` enquanto monta a coluna, linhas
  299-301). O mesmo efeito visível continua existindo, disparado pela tela do
  Fluxo — ver `useSeedTaskChecklist`. Escrita no meio da renderização, repetida a
  cada montagem do quadro e em todo mundo que abre a página, não é layout.
*/

type Column = { id: ProjectPhase; color: string }

/*
  As cores do original (linhas 21-34), com variante escura acrescentada: no
  escuro, um fundo de tom 100 vira faixa branca sob texto claro. O cinza da
  primeira coluna é o próprio degrau neutro do tema.

  A LISTA CONTINUA FIXA E ESCRITA À MÃO, e não derivada de `PROJECT_PHASE`: cada
  coluna precisa de uma cor, e cor não sai do enum. O preço é este — fase nova no
  banco não aparece aqui sozinha, e a tarefa some da tela sem erro. Foi o que
  aconteceu com `under_construction` (migration 0061) até esta linha existir.

  `post_approval` não tem coluna de propósito: `tasks_phase_no_post_approval_check`
  (0049) recusa o valor em tarefa, então a coluna seria sempre vazia.
*/
const COLUMNS: Column[] = [
  { id: 'not_started', color: 'bg-muted' },
  { id: 'briefing', color: 'bg-blue-100 dark:bg-blue-950/40' },
  { id: 'layout', color: 'bg-violet-100 dark:bg-violet-950/40' },
  { id: 'renderings', color: 'bg-purple-100 dark:bg-purple-950/40' },
  { id: 'revision', color: 'bg-amber-100 dark:bg-amber-950/40' },
  { id: 'legal_permit', color: 'bg-cyan-100 dark:bg-cyan-950/40' },
  { id: 'hoa_approval', color: 'bg-orange-100 dark:bg-orange-950/40' },
  { id: 'construction_docs', color: 'bg-indigo-100 dark:bg-indigo-950/40' },
  { id: 'engineering_docs', color: 'bg-pink-100 dark:bg-pink-950/40' },
  { id: 'building_permit', color: 'bg-lime-100 dark:bg-lime-950/40' },
  /*
    COR ESCOLHIDA AQUI, porque o original não tem esta coluna — é a única do
    quadro sem cor de lá. Teal é o único matiz da escala que ainda não estava em
    uso e que se distingue à primeira vista dos dois vizinhos (lime à esquerda,
    rose à direita); cyan e emerald, os mais próximos dele, ficam a cinco e a
    duas colunas de distância. Laranja seria o palpite óbvio — é o que
    StatusBadge.jsx:60 do original dá à palavra "Obra" — mas laranja já é
    "Aprovação Condomínio" neste mesmo quadro, e duas colunas da mesma cor tiram
    da cor a única função que ela tem aqui. Escolha reportada ao usuário.
  */
  { id: 'under_construction', color: 'bg-teal-100 dark:bg-teal-950/40' },
  { id: 'awaiting_client', color: 'bg-rose-100 dark:bg-rose-950/40' },
  { id: 'finished', color: 'bg-emerald-100 dark:bg-emerald-950/40' },
]

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  high: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  medium:
    'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  low: 'bg-elevated text-soft border-border',
}

/*
  Os estilos de barra de rolagem do original (linhas 126-170), com uma tradução:
  lá o polegar é `rgba(148, 163, 184, ...)` — slate-400 fixo, que some no tema
  escuro. Aqui é o próprio token de texto secundário com a mesma opacidade.
*/
const SCROLLBAR_STYLES = `
  .kanban-board-wrapper::-webkit-scrollbar {
    height: 8px;
  }
  .kanban-board-wrapper::-webkit-scrollbar-track {
    background: transparent;
  }
  .kanban-board-wrapper::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--color-muted-foreground) 30%, transparent);
    border-radius: 10px;
    transition: background 0.2s ease;
  }
  .kanban-board-wrapper:hover::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--color-muted-foreground) 50%, transparent);
  }
  .kanban-board-wrapper::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--color-muted-foreground) 70%, transparent);
  }
  .kanban-board-wrapper {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--color-muted-foreground) 30%, transparent) transparent;
  }

  .kanban-column-body::-webkit-scrollbar {
    width: 6px;
  }
  .kanban-column-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .kanban-column-body::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--color-muted-foreground) 20%, transparent);
    border-radius: 10px;
    transition: background 0.2s ease;
  }
  .kanban-column-body:hover::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--color-muted-foreground) 40%, transparent);
  }
  .kanban-column-body::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--color-muted-foreground) 60%, transparent);
  }
  .kanban-column-body {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--color-muted-foreground) 20%, transparent) transparent;
  }
`

type BlockAlert = { fromPhase: ProjectPhase; toPhase: ProjectPhase; pending: string[] }

/*
  O QUE A GAVETA DO DIÁRIO PRECISA SABER DO PROJETO, montado a partir do que a
  tela já tem em mãos.

  `useProjects()` só traz projeto `visible_in_list`, e uma tarefa pode apontar
  para um que ficou de fora — o mesmo caso que a versão nova trata caindo para
  `{ id, name }` (TaskKanban.jsx:513-516). Quando o projeto está na lista, o
  cabeçalho mostra cliente, responsável operacional, etapa e início; quando não
  está, mostra o nome que veio com a tarefa e nada mais.
*/
function diaryProjectOf(task: TaskRow, projects: ProjectRow[]): DiaryProject | null {
  if (!task.project_id) return null

  const project = projects.find((candidate) => candidate.id === task.project_id)
  if (!project) {
    return {
      id: task.project_id,
      name: task.project?.name ?? '',
      client: null,
      responsible: null,
      current_phase: null,
      start_date: null,
    }
  }

  return {
    id: project.id,
    name: project.name,
    client: project.client,
    responsible: project.operational_responsible,
    current_phase: project.current_phase,
    start_date: project.start_date,
  }
}

export default function TaskKanban({
  tasks,
  projects,
  progressByProject,
  collaborators,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onMove,
  onToggleChecklistItem,
  onChangeResponsible,
}: {
  tasks: TaskRow[]
  /* Só para o cabeçalho da gaveta do Diário do Projeto — ver `diaryProjectOf`. */
  projects: ProjectRow[]
  progressByProject: Map<string, ProjectProgress>
  collaborators: Collaborator[]
  /*
    Não existe no original, onde qualquer pessoa que abre a tela arrasta. Aqui a
    escrita é `can_edit_menu('project_flow')` e o banco recusa de qualquer forma
    — um cartão que se move e volta sozinho é pior do que um cartão que não se
    move.
  */
  canEdit: boolean
  canDelete: boolean
  onEdit: (task: TaskRow) => void
  onDelete: (task: TaskRow) => void
  onMove: (move: TaskPhaseMove, projectId: string | null) => void
  onToggleChecklistItem: (item: TaskChecklistItem) => void
  onChangeResponsible: (task: TaskRow, collaboratorId: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [blockAlert, setBlockAlert] = useState<BlockAlert | null>(null)
  /*
    A gaveta do Diário do Projeto, aberta pelo menu do cartão. Guarda o projeto
    montado e se a TAREFA que abriu está em Em Obra — a obra pode estar
    acontecendo numa tarefa antes de a fase do projeto acompanhar, e é isso que
    o `_isEmObra` da versão nova carrega (TaskKanban.jsx:513).
  */
  const [diary, setDiary] = useState<{
    project: DiaryProject
    underConstruction: boolean
  } | null>(null)

  const responsibles = operationalCandidates(collaborators)

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const fromPhase = result.source.droppableId as ProjectPhase
    const toPhase = result.destination.droppableId as ProjectPhase
    if (fromPhase === toPhase) return

    const task = tasks.find((candidate) => candidate.id === result.draggableId)
    if (!task) return

    const outcome: MoveOutcome = moveTaskToPhase(task, fromPhase, toPhase)

    if (outcome.kind === 'blocked') {
      setBlockAlert(outcome)
      return
    }

    setBlockAlert(null)
    onMove(outcome.move, task.project_id)
  }

  const progressOf = (projectId: string) =>
    progressByProject.get(projectId)?.progress_percent ?? 0

  /* A regra saiu daqui para `../list` no módulo 10, sem mudar de comportamento:
     o Painel Executivo conta "projeto em risco" com ela, e duas cópias da mesma
     expressão são duas chances de o crachá do cartão e o número do painel
     discordarem. */
  const isOverdue = (task: TaskRow) => isTaskOverdue(task)

  /* Os itens da etapa em que a tarefa está, na ordem gravada. `display_order` é
     anulável, e o original ordena do mesmo jeito (`(a.ordem || 0)`). */
  const currentChecklist = (task: TaskRow): TaskChecklistItem[] =>
    task.checklist
      .filter((item) => item.phase === task.phase)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  return (
    <>
      <style>{SCROLLBAR_STYLES}</style>

      {blockAlert && (
        <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/40 rounded-lg">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-rose-900 dark:text-rose-200 mb-1">
                Não é possível avançar para "{labelOf(PROJECT_PHASE, blockAlert.toPhase)}"
              </h3>
              <p className="text-sm text-rose-700 dark:text-rose-300 mb-2">
                Complete os itens obrigatórios da etapa "
                {labelOf(PROJECT_PHASE, blockAlert.fromPhase)}" antes de avançar:
              </p>
              <pre className="text-xs text-rose-600 dark:text-rose-400 whitespace-pre-wrap font-medium">
                {blockAlert.pending.map((title) => `• ${title}`).join('\n')}
              </pre>
            </div>
            <button
              onClick={() => setBlockAlert(null)}
              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded"
            >
              <X className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </button>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="relative">
          <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            {/* `bg-foreground/80` + `text-background` é exatamente o par
                slate-900/80 + branco do original no claro, e o
                slate-100/80 + slate-900 que ele mesmo declara no escuro. */}
            <div className="flex items-center gap-1 px-3 py-1 bg-foreground/80 rounded-full text-background text-xs font-medium backdrop-blur-xs">
              <span className="select-none">← Deslize →</span>
            </div>
          </div>

          <div
            className="kanban-board-wrapper overflow-x-auto overflow-y-hidden overscroll-x-none snap-x snap-mandatory"
            style={{ height: 'calc(100vh - 280px)', WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex gap-4 pb-4" style={{ width: 'max-content' }}>
              {COLUMNS.map((column) => {
                const columnTasks = tasksInColumn(tasks, column.id)

                return (
                  <div
                    key={column.id}
                    className="flex flex-col w-[280px] shrink-0 snap-center"
                    style={{ height: 'calc(100vh - 300px)' }}
                  >
                    {/* Cabeçalho fixo da coluna */}
                    <div className={`px-4 py-3 rounded-t-xl ${column.color} sticky top-0 z-10`}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-foreground">
                          {labelOf(PROJECT_PHASE, column.id)}
                        </h3>
                        <Badge variant="secondary" className="bg-card/50">
                          {columnTasks.length}
                        </Badge>
                      </div>
                    </div>

                    <Droppable droppableId={column.id} isDropDisabled={!canEdit}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`kanban-column-body flex-1 overflow-y-auto p-2 rounded-b-xl border-2 border-t-0 transition-colors ${
                            snapshot.isDraggingOver
                              ? 'border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
                              : 'border-border bg-muted/50'
                          }`}
                          style={{ minHeight: '200px' }}
                        >
                          <div className="space-y-2">
                            {columnTasks.map((task, index) => {
                              const checklist = currentChecklist(task)
                              const done = checklist.filter((item) => item.is_completed).length

                              return (
                                <Draggable
                                  key={task.id}
                                  draggableId={task.id}
                                  index={index}
                                  isDragDisabled={!canEdit}
                                >
                                  {(dragProvided, dragSnapshot) => (
                                    <Card
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      className={`p-4 bg-card border-0 shadow-xs hover:shadow-md transition-all ${
                                        canEdit ? 'cursor-grab' : ''
                                      } ${dragSnapshot.isDragging ? 'shadow-lg rotate-2' : ''} ${
                                        isOverdue(task) ? 'border-l-4 border-l-rose-500' : ''
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2 mb-3">
                                        <h4 className="font-medium text-foreground text-sm line-clamp-2 flex-1">
                                          {task.title}
                                        </h4>
                                        {/* O percentual vem da view, não de coluna. */}
                                        {task.project_id && (
                                          <div className="shrink-0 px-2 py-0.5 bg-muted rounded text-xs font-bold text-soft">
                                            {progressOf(task.project_id)}%
                                          </div>
                                        )}
                                        {/*
                                          O MENU APARECE TAMBÉM PARA QUEM SÓ LÊ, e isso
                                          mudou com o módulo 11.

                                          Antes a condição era `canEdit || canDelete`, ou
                                          seja, quem não edita o Fluxo do Projeto não via o
                                          botão. O Diário do Projeto é para LER também —
                                          qualquer colaborador ativo lê o histórico inteiro
                                          (migration 0070) — e ele se alcança por aqui. Sem
                                          esta terceira condição, o Arquiteto que não edita
                                          o fluxo não teria caminho nenhum até o diário.

                                          Ninguém ganha ação de escrita com isso: cada item
                                          continua atrás da sua própria permissão, e o único
                                          que entra sem `canEdit` é o do diário, que abre uma
                                          gaveta cujos botões de escrever obedecem a outra
                                          regra ainda (Diretor ou Coordenador).
                                        */}
                                        {(canEdit || canDelete || task.project_id) && (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 shrink-0"
                                              >
                                                <MoreVertical className="w-3 h-3" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              {canEdit && (
                                                <DropdownMenuItem onClick={() => onEdit(task)}>
                                                  <Pencil className="w-4 h-4 mr-2" />
                                                  Editar
                                                </DropdownMenuItem>
                                              )}
                                              {/* Sem separador antes, como na versão nova
                                                  (TaskKanban.jsx:510-521): o diário fica
                                                  colado em "Editar". */}
                                              {task.project_id && (
                                                <DropdownMenuItem
                                                  onClick={() => {
                                                    const diaryProject = diaryProjectOf(
                                                      task,
                                                      projects,
                                                    )
                                                    if (!diaryProject) return
                                                    setDiary({
                                                      project: diaryProject,
                                                      underConstruction:
                                                        task.phase === 'under_construction',
                                                    })
                                                  }}
                                                >
                                                  <BookOpen className="w-4 h-4 mr-2" />
                                                  Diário do Projeto
                                                </DropdownMenuItem>
                                              )}
                                              {canEdit && (
                                                <>
                                                  <DropdownMenuSeparator />
                                                  <DropdownMenuSub>
                                                    <DropdownMenuSubTrigger>
                                                      <User className="w-4 h-4 mr-2" />
                                                      Alterar Responsável
                                                    </DropdownMenuSubTrigger>
                                                    <DropdownMenuSubContent>
                                                      {responsibles.map((collaborator) => (
                                                        <DropdownMenuItem
                                                          key={collaborator.id}
                                                          onClick={() =>
                                                            onChangeResponsible(
                                                              task,
                                                              collaborator.id,
                                                            )
                                                          }
                                                          className={
                                                            task.responsible_id === collaborator.id
                                                              ? 'bg-elevated'
                                                              : ''
                                                          }
                                                        >
                                                          {collaborator.name} -{' '}
                                                          {labelOf(
                                                            COLLABORATOR_ROLE,
                                                            collaborator.role,
                                                          )}
                                                        </DropdownMenuItem>
                                                      ))}
                                                    </DropdownMenuSubContent>
                                                  </DropdownMenuSub>
                                                </>
                                              )}
                                              {canDelete && (
                                                <>
                                                  <DropdownMenuSeparator />
                                                  <DropdownMenuItem
                                                    onClick={() => onDelete(task)}
                                                    className="text-rose-600 dark:text-rose-400"
                                                  >
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Excluir
                                                  </DropdownMenuItem>
                                                </>
                                              )}
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                      </div>

                                      {task.project && (
                                        <p className="text-xs text-muted-foreground mb-2 truncate">
                                          {task.project.name}
                                        </p>
                                      )}

                                      <div className="flex flex-wrap gap-1 mb-3">
                                        <Badge
                                          variant="outline"
                                          className={
                                            PRIORITY_STYLES[task.priority as TaskPriority]
                                          }
                                        >
                                          {labelOf(TASK_PRIORITY, task.priority as TaskPriority)}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="bg-elevated text-soft border-border text-xs"
                                        >
                                          {labelOf(PROJECT_PHASE, task.phase)}
                                        </Badge>
                                      </div>

                                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        {task.responsible && (
                                          <div className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            <span className="truncate max-w-[80px]">
                                              {task.responsible.name}
                                            </span>
                                          </div>
                                        )}
                                        {task.due_date && (
                                          <div
                                            className={`flex items-center gap-1 ${
                                              isOverdue(task)
                                                ? 'text-rose-600 dark:text-rose-400 font-medium'
                                                : ''
                                            }`}
                                          >
                                            <Calendar className="w-3 h-3" />
                                            {format(parseISO(task.due_date), 'dd/MM')}
                                          </div>
                                        )}
                                      </div>

                                      {task.estimated_hours != null && (
                                        <div className="flex items-center gap-1 text-xs text-faint mt-2">
                                          <Clock className="w-3 h-3" />
                                          {task.estimated_hours}h
                                        </div>
                                      )}

                                      {checklist.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-border">
                                          <button
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setExpanded((current) => ({
                                                ...current,
                                                [task.id]: !current[task.id],
                                              }))
                                            }}
                                            className="flex items-center justify-between w-full hover:bg-elevated p-1.5 rounded -ml-1.5 transition-colors"
                                          >
                                            <div className="flex items-center gap-2">
                                              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
                                              <span className="text-xs font-medium text-soft">
                                                {done}/{checklist.length} concluídos
                                              </span>
                                            </div>
                                            {expanded[task.id] ? (
                                              <ChevronUp className="w-3.5 h-3.5 text-faint" />
                                            ) : (
                                              <ChevronDown className="w-3.5 h-3.5 text-faint" />
                                            )}
                                          </button>

                                          {expanded[task.id] && (
                                            <div className="space-y-2 mt-2 max-h-40 overflow-y-auto">
                                              {checklist.map((item) => (
                                                <div
                                                  key={item.id}
                                                  className={`flex items-start gap-2 group hover:bg-elevated p-1.5 rounded -ml-1.5 ${
                                                    canEdit ? 'cursor-pointer' : ''
                                                  }`}
                                                  onClick={(event) => {
                                                    event.stopPropagation()
                                                    if (canEdit) onToggleChecklistItem(item)
                                                  }}
                                                >
                                                  <Checkbox
                                                    checked={item.is_completed}
                                                    disabled={!canEdit}
                                                    className="mt-0.5"
                                                  />
                                                  <span
                                                    className={`text-xs flex-1 ${
                                                      item.is_completed
                                                        ? 'line-through text-faint'
                                                        : 'text-soft'
                                                    }`}
                                                  >
                                                    {item.title}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </Card>
                                  )}
                                </Draggable>
                              )
                            })}
                          </div>
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-border to-transparent pointer-events-none md:hidden" />
        </div>
      </DragDropContext>

      {/* A gaveta do Diário do Projeto, como na versão nova (TaskKanban.jsx:758). */}
      <ProjectDiaryDrawer
        open={diary !== null}
        onClose={() => setDiary(null)}
        project={diary?.project ?? null}
        underConstruction={diary?.underConstruction ?? false}
      />
    </>
  )
}
