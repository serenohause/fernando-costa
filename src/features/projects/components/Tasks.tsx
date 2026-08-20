import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { useNavigation } from '@/components/shared/useNavigation'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useMenuPermissions } from '@/features/auth/hooks'
import { useCollaborators } from '@/features/team/hooks'
import { missingChecklistItems } from '../checklist-templates'
import {
  describeTaskError,
  useChangeTaskResponsible,
  useCreateTask,
  useDeleteTask,
  useMoveTaskPhase,
  useProjectProgress,
  useProjects,
  useSeedTaskChecklist,
  useSetTaskOperationalTag,
  useTasks,
  useToggleChecklistItem,
  useUpdateTask,
} from '../hooks'
import type { RecordedDiaryEvent } from '@/features/diary/hooks'
import type { OperationalTag } from '@/lib/enums'
import TaskKanban from './TaskKanban'
import TaskForm, { toFormValues, type TaskFormValues } from './TaskForm'
import type { TaskChecklistItem, TaskInput, TaskPhase, TaskRow } from '../types'

/*
  Porta de projeto-original/src/pages/Tasks.jsx.

  O cabeçalho, os dois filtros (responsável e projeto), o quadro de colunas (as
  doze do original mais "Em Obra", migration 0061), o formulário e o diálogo de
  exclusão são os do original, na mesma ordem.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0033):

  - Leitura é larga (`tasks_select_active_collaborator`): qualquer colaborador
    ativo do escritório lê.
  - Escrita é `can_edit` no menu `project_flow` OU ser Diretor. Menu DIFERENTE do
    da tela de Projetos, porque são dois itens separados na sidebar do original,
    com permissão independente — quem toca o cronograma não é necessariamente
    quem cadastra projeto.
  - Excluir continua sendo mais apertado do que editar, como no original
    (Tasks.jsx:205): lá é "Admin ou Diretor". O `admin` daquele OU é o papel de
    PLATAFORMA do base44, cujo equivalente aqui é o `service_role`, então sobra
    o Diretor. O banco permite a exclusão a qualquer editor de `project_flow`;
    quem aperta é a tela, como no original.

  O QUE MUDA EM RELAÇÃO AO ORIGINAL:

  - `updateProjectProgress` sumiu: o progresso é a view `project_progress` e não
    precisa de ninguém para se manter em dia. `updateProjectPhase` continua,
    dentro dos hooks — a FASE é coluna gravada de propósito.
  - O original decide quem pode editar pela FUNÇÃO do colaborador (Diretor ou
    Coordenador). Aqui quem decide é a permissão de menu, que é a mesma regra do
    banco — do contrário a tela prometeria um botão que a RLS recusa.
*/
/*
  O EVENTO AUTOMÁTICO QUE NÃO ENTROU, DITO EM VOZ ALTA.

  Gêmeo do `warnFailedEvent` das abas de obra (ObraTab.tsx), e existe pelo mesmo
  motivo: na versão nova a gravação do evento falha em silêncio
  (`console.error` e segue, diaryAutoEvents.js:32-35), e o resultado é um diário
  com buracos que ninguém percebe — justamente o que este módulo existe para não
  ter.

  A TAREFA JÁ MUDOU quando isto acontece: o evento é o passo seguinte ao UPDATE
  que o banco confirmou, e não dá para desfazer o que já foi gravado. Falhar aqui
  não pode derrubar o gesto de quem arrastou o cartão; o que resta é dizer o que
  ficou de fora.

  `null` NÃO É FALHA: é tarefa sem projeto, que não tem diário para escrever.
*/
function warnFailedEvent(event: RecordedDiaryEvent | null) {
  if (event?.outcome !== 'failed') return
  toast.warning('A tarefa foi salva, mas o evento não entrou na Timeline do projeto.')
}

export default function Tasks() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; task: TaskRow | null }>({
    open: false,
    task: null,
  })
  const [responsibleFilter, setResponsibleFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')

  const { saveOrigin } = useNavigation()
  const { canEdit, isDirector } = useMenuPermissions('project_flow')

  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])

  const tasksQuery = useTasks()
  const projectsQuery = useProjects()
  const progressQuery = useProjectProgress()
  const collaboratorsQuery = useCollaborators()

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const collaborators = useMemo(() => collaboratorsQuery.data ?? [], [collaboratorsQuery.data])

  const createMutation = useCreateTask()
  const updateMutation = useUpdateTask()
  const deleteMutation = useDeleteTask()
  const moveTaskPhase = useMoveTaskPhase()
  const toggleMutation = useToggleChecklistItem()
  const responsibleMutation = useChangeTaskResponsible()
  const operationalTagMutation = useSetTaskOperationalTag()
  const seedMutation = useSeedTaskChecklist()

  /*
    O checklist da etapa aparecendo sozinho — o mesmo efeito visível que o
    original produz DENTRO do render (TaskKanban.jsx:276-307), agora fora dele.

    Três guardas que o original não tem, e cada uma resolve um problema real:
    só quem pode editar dispara (a RLS recusaria de qualquer forma), cada tarefa
    é tentada uma vez por sessão (`attempted`), e a falha não vira aviso na tela
    — é efeito de fundo, não gesto de ninguém.
  */
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (!canEdit) return

    for (const task of tasks) {
      if (task.status === 'completed') continue
      if (attempted.current.has(task.id)) continue

      const items = missingChecklistItems(task.phase as TaskPhase, task.checklist)
      if (items.length === 0) continue

      attempted.current.add(task.id)
      seedMutation.mutate(
        { taskId: task.id, items },
        {
          onError: (error) =>
            console.error('[projects] falha ao criar o checklist da etapa:', error),
        },
      )
    }
    /* `seedMutation` fora das dependências de propósito: `useMutation` devolve
       objeto novo a cada render, e incluí-lo faria o efeito rodar em todo
       render. O `attempted` impediria a gravação repetida, mas o efeito não
       deve depender dele para não disparar. */
  }, [tasks, canEdit])

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (responsibleFilter !== 'all' && task.responsible_id !== responsibleFilter) return false
        if (projectFilter !== 'all' && task.project_id !== projectFilter) return false
        return true
      }),
    [tasks, responsibleFilter, projectFilter],
  )

  const formInitialData = useMemo<TaskFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (data: TaskInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input: data },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Tarefa atualizada com sucesso!')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeTaskError(error)),
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        closeForm()
        toast.success('Tarefa criada com sucesso!')
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeTaskError(error)),
    })
  }

  const handleDelete = (task: TaskRow) => {
    if (!isDirector) {
      toast.error('Apenas Diretores podem excluir tarefas')
      return
    }
    setDeleteDialog({ open: true, task })
  }

  const confirmDelete = () => {
    const target = deleteDialog.task
    if (!target) return

    deleteMutation.mutate(
      { id: target.id, projectId: target.project_id },
      {
        onSuccess: () => {
          setDeleteDialog({ open: false, task: null })
          toast.success('Tarefa excluída com sucesso!')
        },
        onError: (error) => toast.error('Erro ao excluir: ' + describeTaskError(error)),
      },
    )
  }

  /*
    O NOME DO NOVO RESPONSÁVEL SAI DAQUI, e não do hook: o menu do cartão manda o
    id, e quem tem a lista de colaboradores é esta tela. O hook precisa do nome
    para o TEXTO do evento de diário ("Responsável alterado: X → Y"); a coluna
    gravada continua sendo só `responsible_id`.
  */
  const handleChangeResponsible = (task: TaskRow, collaboratorId: string) => {
    const collaborator = collaborators.find((candidate) => candidate.id === collaboratorId)
    if (!collaborator) return

    responsibleMutation.mutate(
      { task, responsible: { id: collaborator.id, name: collaborator.name } },
      {
        onSuccess: (result) => {
          toast.success('Responsável alterado!')
          warnFailedEvent(result.event)
        },
        onError: (error) =>
          toast.error('Erro ao alterar responsável: ' + describeTaskError(error)),
      },
    )
  }

  /*
    "Status operacional" do menu do cartão. A tela NÃO confere em que fase a
    tarefa está: quem oferece a tag é o menu (`operationalTagOptions`, flow.ts) e
    quem autoriza a escrita é a RLS do Fluxo do Projeto. Repetir o recorte aqui
    seria uma terceira cópia da mesma lista.
  */
  const handleSetOperationalTag = (task: TaskRow, tag: OperationalTag | null) => {
    operationalTagMutation.mutate(
      { task, tag },
      {
        onSuccess: (result) => warnFailedEvent(result.event),
        onError: (error) =>
          toast.error('Erro ao alterar o status operacional: ' + describeTaskError(error)),
      },
    )
  }

  const handleToggleChecklistItem = (item: TaskChecklistItem) => {
    toggleMutation.mutate(
      { id: item.id, isCompleted: !item.is_completed },
      {
        onError: (error) => toast.error('Erro ao atualizar o item: ' + describeTaskError(error)),
      },
    )
  }

  const activeCollaborators = collaborators.filter(
    (collaborator) => collaborator.status === 'active',
  )

  const isLoading =
    tasksQuery.isLoading || projectsQuery.isLoading || progressQuery.isLoading
  const isError = tasksQuery.isError || projectsQuery.isError || progressQuery.isError

  return (
    <div>
      <PageHeader
        title="Fluxo do Projeto"
        subtitle="Acompanhe o andamento dos projetos"
        actionLabel={canEdit ? 'Nova Tarefa' : undefined}
        onAction={
          canEdit
            ? () => {
                setEditing(null)
                setFormOpen(true)
              }
            : undefined
        }
      />

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-6">
        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-card">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            {activeCollaborators.map((collaborator) => (
              <SelectItem key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-card">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            {/* Só projeto visível, como no original (Tasks.jsx:82 e 263, que
                filtram duas vezes a mesma coisa). O recorte agora é da consulta. */}
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        Três estados explícitos. O original só distingue dois — quadro vazio e
        quadro cheio — e falha de leitura nele deixa a tela igualzinha a "não há
        tarefa nenhuma".
      */}
      {isError ? (
        <ErrorState
          title="Não foi possível carregar o fluxo"
          description="As tarefas do escritório não puderam ser lidas agora."
          error={tasksQuery.error ?? projectsQuery.error ?? progressQuery.error}
          onRetry={() => {
            void tasksQuery.refetch()
            void projectsQuery.refetch()
            void progressQuery.refetch()
          }}
        />
      ) : isLoading ? (
        <div className="flex gap-4 overflow-hidden">
          {[...Array(4)].map((_, index) => (
            <Card key={index} className="w-[280px] shrink-0 border-0 shadow-xs">
              <div className="p-4 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Nenhuma tarefa cadastrada"
          description="Crie tarefas para organizar o trabalho da equipe."
          actionLabel={canEdit ? 'Criar Tarefa' : undefined}
          onAction={canEdit ? () => setFormOpen(true) : undefined}
        />
      ) : (
        <TaskKanban
          tasks={filteredTasks}
          projects={projects}
          progressByProject={progressQuery.data ?? new Map()}
          collaborators={collaborators}
          canEdit={canEdit}
          canDelete={canEdit && isDirector}
          onEdit={(task) => {
            setEditing(task)
            setFormOpen(true)
          }}
          onDelete={handleDelete}
          onMove={(move, projectId) =>
            moveTaskPhase(
              { move, projectId },
              {
                onSuccess: (result) => warnFailedEvent(result.event),
                onError: (error) => toast.error('Erro ao mover: ' + describeTaskError(error)),
              },
            )
          }
          onToggleChecklistItem={handleToggleChecklistItem}
          onChangeResponsible={handleChangeResponsible}
          onSetOperationalTag={handleSetOperationalTag}
        />
      )}

      <TaskForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        projects={projects}
        collaborators={collaborators}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteDialog.task?.title}"? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
