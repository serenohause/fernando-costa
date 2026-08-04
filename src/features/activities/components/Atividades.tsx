import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowUpDown, Calendar, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useNavigation } from '@/components/shared/useNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useCurrentCollaborator, useMenuPermissions } from '@/features/auth/hooks'
import { useClients } from '@/features/crm/hooks'
import { useCollaborators } from '@/features/team/hooks'
import { useProjects } from '@/features/projects/hooks'
import { PRIORITY_LEVEL, WORK_STATUS, labelOf, optionsOf } from '@/lib/enums'
import {
  countActivities,
  filterActivities,
  formatDayMonth,
  isOverdue,
  sortActivities,
  type ActivityFilters,
  type QuickFilter,
} from '../list'
import {
  describeDatabaseError,
  useActivities,
  useActivityReadScope,
  useCompleteActivity,
  useCreateActivity,
  useReorderActivities,
  useSoftDeleteActivity,
  useStartActivity,
  useUpdateActivity,
} from '../hooks'
import AtividadeForm, { toFormValues, type ActivityFormValues } from './AtividadeForm'
import BotoesExecucao from './BotoesExecucao'
import ReordenarAtividades from './ReordenarAtividades'
import { PRIORITY_BADGE, PROJECT_BADGE } from './priority-styles'
import type { ActivityInput, ActivityRow } from '../types'

/*
  Porta de projeto-original/src/pages/Atividades.jsx.

  O cabeçalho, o aviso rosado de atrasadas, as quatro abas de filtro rápido com
  os crachás de contagem, a grade de quatro selects com o botão Reordenar ao
  lado, as sete colunas da tabela, o formulário, o diálogo de reordenação e o de
  exclusão são os do original, na mesma ordem.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete:

  - Leitura NÃO é larga, e este é o único módulo assim
    (`activities_select_own_or_activities_viewer`, migration 0059, que
    substituiu o predicado da 0038): quem tem can_view OU can_edit no menu
    `activities` — Diretor incluído pelo atalho da 0019 — lê todas as atividades
    do escritório; quem não tem nenhum dos dois lê só as que são dele ou de quem
    ele coordena. LER O ESCRITÓRIO NÃO É EDITAR O ESCRITÓRIO: o Administrativo,
    que no seed tem can_view e não can_edit, recebe a lista inteira e continua
    sem o botão de criar.
  - Editar alcança também o responsável e o coordenador da linha (migration
    0039). É o que faz os botões Começar e Concluir funcionarem para Arquiteto e
    Estagiário, que no seed não recebem menu nenhum.
  - Criar e excluir continuam exigindo o menu: criar é atribuir trabalho, e
    excluir remove da auditoria de quem fez o quê.

  O QUE NÃO FOI PORTADO, E POR QUÊ:

  1. O interruptor "Visão Gerencial (ver atividades de todos)" (linhas 466-477) e
     os dois blocos que dependiam dele (linhas 216-231 e 304-318). Ele existia
     para emular no navegador o recorte que agora é do BANCO: a lista que chega
     aqui JÁ é "todas as atividades" ou "só as minhas", conforme a permissão de
     menu de quem consulta. Com a policy no lugar, o interruptor não teria o que
     ligar e desligar — e o ramo desligado dele, para Coordenador, filtrava pela
     FUNÇÃO do responsável (Arquiteto/Estagiário/Coordenador), aproximação do
     "quem eu coordeno" que a coluna `coordinator_id` responde de verdade.

     O SUBTÍTULO DO CABEÇALHO SEGUE O MESMO CRITÉRIO, e é por isso que ele não
     se decide por `canEdit`: no original (linha 456) o texto sai do estado do
     interruptor, ou seja, do ESCOPO do que está na tela, não de quem pode
     escrever. O que lá era o interruptor, aqui é `useActivityReadScope()`.

     Consequência conhecida: o select "Responsável", que no original só filtrava
     com o interruptor ligado (linha 265), passa a filtrar sempre. Ele está
     desenhado na tela do original nos dois estados.

  2. `AlertasAtividades` (linha 452), que dispara e-mail de atraso pela
     integração do base44 e carimba `ultimo_alerta_em`. Não há canal de e-mail
     equivalente no projeto — mesma pendência já registrada no botão "Excluir
     Conta" do AppLayout. O componente renderiza `null`, então nada sai da tela;
     a coluna `last_alert_on` existe e fica esperando o canal. Está no relatório
     do módulo.
*/
export default function Atividades() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ActivityRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; activity: ActivityRow | null }>({
    open: false,
    activity: null,
  })
  const [reorderOpen, setReorderOpen] = useState(false)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todas')
  const [filters, setFilters] = useState<Omit<ActivityFilters, 'quick'>>({
    priority: 'all',
    collaboratorId: 'all',
    projectId: 'all',
    status: 'all',
  })

  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('activities')
  const { readsAllActivities } = useActivityReadScope()
  const { data: currentCollaborator } = useCurrentCollaborator()

  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])

  const activitiesQuery = useActivities()
  const collaboratorsQuery = useCollaborators()
  const projectsQuery = useProjects()
  const clientsQuery = useClients('')

  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data])
  const counters = useMemo(() => countActivities(activities), [activities])
  const visibleActivities = useMemo(
    () => sortActivities(filterActivities(activities, { ...filters, quick: quickFilter })),
    [activities, filters, quickFilter],
  )

  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity()
  const deleteMutation = useSoftDeleteActivity()
  const startMutation = useStartActivity()
  const completeMutation = useCompleteActivity()
  const reorderMutation = useReorderActivities()

  /* Referência estável de propósito: o formulário reinicia quando `initialData`
     muda, como no original. Recriar o objeto a cada render apagaria o que está
     sendo digitado assim que qualquer query se atualizasse. */
  const formInitialData = useMemo<ActivityFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  /* O mesmo predicado da policy de UPDATE (migration 0039), que é o que o
     original escreve na linha 603 com os papéis do base44. */
  const canEditRow = (activity: ActivityRow) =>
    canEdit ||
    activity.collaborator_id === currentCollaborator?.id ||
    activity.coordinator_id === currentCollaborator?.id

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (data: ActivityInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input: data, current: editing },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Atividade atualizada com sucesso')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        closeForm()
        toast.success('Atividade criada com sucesso')
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
    })
  }

  const confirmDelete = () => {
    const target = deleteDialog.activity
    if (!target) return

    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, activity: null })
        toast.success('Atividade excluída com sucesso')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  const handleStart = (activity: ActivityRow) =>
    startMutation.mutate(activity, {
      onError: (error) => toast.error('Erro ao iniciar: ' + describeDatabaseError(error)),
    })

  const handleComplete = (activity: ActivityRow) =>
    completeMutation.mutate(activity, {
      onError: (error) => toast.error('Erro ao concluir: ' + describeDatabaseError(error)),
    })

  const activeCollaborators = (collaboratorsQuery.data ?? []).filter(
    (collaborator) => collaborator.status === 'active',
  )

  const columns: Column<ActivityRow>[] = [
    {
      header: 'Atividade',
      cell: (row) => (
        <div className="flex items-start gap-2">
          {isOverdue(row) && (
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-1" />
          )}
          {row.execution_order && (
            <div className="flex items-center justify-center w-6 h-6 bg-muted rounded text-xs font-semibold text-soft shrink-0">
              {row.execution_order}
            </div>
          )}
          <div className="flex-1">
            <p
              className={`font-medium ${
                row.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'
              }`}
            >
              {row.description}
            </p>
            {row.notes && <p className="text-xs text-muted-foreground mt-1">{row.notes}</p>}
          </div>
        </div>
      ),
    },
    {
      header: 'Prioridade',
      cell: (row) => (
        <Badge variant="outline" className={PRIORITY_BADGE[row.priority]}>
          {labelOf(PRIORITY_LEVEL, row.priority)}
        </Badge>
      ),
    },
    {
      header: 'Responsável',
      /* Nome ATUAL do cadastro, via join: no original ele congela no momento em
         que a atividade nasceu. */
      cell: (row) => <span className="text-sm text-soft">{row.collaborator?.name ?? '-'}</span>,
    },
    {
      header: 'Projeto',
      cell: (row) =>
        row.project ? (
          <Badge variant="outline" className={`${PROJECT_BADGE} text-xs`}>
            {row.project.name}
          </Badge>
        ) : (
          <span className="text-faint text-xs">-</span>
        ),
    },
    {
      header: 'Data Finalização',
      cell: (row) => (
        <div
          className={`flex items-center gap-1 text-sm ${
            isOverdue(row) ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-soft'
          }`}
        >
          <Calendar className="w-3 h-3" />
          {formatDayMonth(row.end_date)}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={labelOf(WORK_STATUS, row.status)} />,
    },
    {
      header: 'Ações',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <BotoesExecucao
            activity={row}
            canExecute={canEditRow(row)}
            onStart={handleStart}
            onComplete={handleComplete}
          />
          {/* Excluir é mais apertado do que editar, como no original
              (linhas 415-419): lá é Admin, Diretor ou Coordenador; aqui é a
              permissão de menu, que é a mesma regra que o banco aplica ao
              INSERT e ao DELETE desta tabela. */}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                setDeleteDialog({ open: true, activity: row })
              }}
              className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      {/*
        OS TRÊS SUBTÍTULOS SÃO OS TRÊS DO ORIGINAL (Atividades.jsx:456), e o
        critério é o de lá: o ESCOPO do que está na tela.

        Lá o escopo é o interruptor "Visão Gerencial"; aqui é a policy de SELECT
        (migration 0059, que substituiu a da 0038). Decidir por `canEdit` — como
        estava — passou a mentir no dia em que can_view virou leitura ampla: o
        Administrativo tem can_view e não can_edit, recebe as atividades do
        escritório inteiro e lia "Suas atividades operacionais" em cima delas.

        O ramo do Coordenador é o do meio no original. Ele só aparece para quem
        NÃO tem o menu — com o menu, o escopo é o escritório e o primeiro texto
        vale. É a leitura que a policy dá a ele: as próprias mais as de quem
        coordena, que é o que o original aproxima filtrando pela FUNÇÃO do
        responsável.

        "Nova Atividade" continua em `canEdit`, e isso é outra pergunta: ver o
        escritório não é atribuir trabalho — a policy de INSERT (0059) diz o
        mesmo.
      */}
      <PageHeader
        title="Atividades"
        subtitle={
          readsAllActivities
            ? 'Visão geral de todas as atividades'
            : currentCollaborator?.role === 'coordinator'
              ? 'Visão geral de atividades da equipe'
              : 'Suas atividades operacionais'
        }
        actionLabel={canEdit ? 'Nova Atividade' : undefined}
        onAction={
          canEdit
            ? () => {
                setEditing(null)
                setFormOpen(true)
              }
            : undefined
        }
      />

      {counters.atrasadas > 0 && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-rose-900 dark:text-rose-200">
              {counters.atrasadas}{' '}
              {counters.atrasadas === 1 ? 'atividade atrasada' : 'atividades atrasadas'}
            </p>
            <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
              {canEdit ? 'Revise e reatribua se necessário' : 'Atualize o status ou ajuste os prazos'}
            </p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Tabs value={quickFilter} onValueChange={(value) => setQuickFilter(value as QuickFilter)}>
          <TabsList className="bg-card border w-full sm:w-auto overflow-x-auto flex-nowrap">
            <TabsTrigger value="todas" className="whitespace-nowrap">
              Todas
            </TabsTrigger>
            <TabsTrigger value="hoje" className="gap-2 whitespace-nowrap">
              Hoje
              {counters.hoje > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-xs"
                >
                  {counters.hoje}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="semana" className="gap-2 whitespace-nowrap">
              Semana
              {counters.semana > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 text-xs"
                >
                  {counters.semana}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="atrasadas" className="gap-2 whitespace-nowrap">
              Atrasadas
              {counters.atrasadas > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs"
                >
                  {counters.atrasadas}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          {/*
            O original usa `<SelectItem value={null}>` para a opção "todas"
            (linhas 537, 550, 564 e 578). O Select do Radix recusa valor vazio ou
            nulo — o item não seleciona e o filtro fica preso. O valor passa a ser
            "all"; o rótulo é o do original, palavra por palavra. A ORDEM da
            prioridade aqui é a do filtro do original (Urgente para Baixa), ao
            contrário da do formulário.
          */}
          <Select
            value={filters.priority}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                priority: value as ActivityFilters['priority'],
              }))
            }
          >
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              {[...optionsOf(PRIORITY_LEVEL)].reverse().map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.collaboratorId}
            onValueChange={(value) =>
              setFilters((current) => ({ ...current, collaboratorId: value }))
            }
          >
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos responsáveis</SelectItem>
              {activeCollaborators.map((collaborator) => (
                <SelectItem key={collaborator.id} value={collaborator.id}>
                  {collaborator.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.projectId}
            onValueChange={(value) => setFilters((current) => ({ ...current, projectId: value }))}
          >
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos projetos</SelectItem>
              {(projectsQuery.data ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.status}
            onValueChange={(value) =>
              setFilters((current) => ({ ...current, status: value as ActivityFilters['status'] }))
            }
          >
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {optionsOf(WORK_STATUS).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canEdit && (
          <Button variant="outline" onClick={() => setReorderOpen(true)}>
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Reordenar
          </Button>
        )}
      </div>

      {/*
        Três estados explícitos. O `DataTable` cobre carregando (esqueleto) e
        vazio (a mensagem do original); o erro é o que o original não tem — lá,
        falha de leitura deixa a tela igualzinha a "não há atividade nenhuma".
      */}
      {activitiesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar as atividades"
          description="A lista de atividades não pôde ser lida agora."
          error={activitiesQuery.error}
          onRetry={() => {
            void activitiesQuery.refetch()
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={visibleActivities}
          isLoading={activitiesQuery.isLoading}
          onRowClick={(row) => {
            if (!canEditRow(row)) return
            setEditing(row)
            setFormOpen(true)
          }}
          emptyMessage="Nenhuma atividade encontrada"
        />
      )}

      <AtividadeForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        canAssign={canEdit}
        collaborators={collaboratorsQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        clients={clientsQuery.data ?? []}
      />

      <ReordenarAtividades
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        isSaving={reorderMutation.isPending}
        activities={activities}
        collaborators={collaboratorsQuery.data ?? []}
        onSave={(ordered) =>
          reorderMutation.mutate(ordered, {
            onSuccess: () => {
              setReorderOpen(false)
              toast.success('Ordem de execução atualizada com sucesso')
            },
            onError: (error) =>
              toast.error('Erro ao atualizar ordem de execução: ' + describeDatabaseError(error)),
          })
        }
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            {/* O texto é o do original, palavra por palavra — inclusive o fato de
                ele falar em atividade concluída e em ação irreversível para
                QUALQUER atividade. Está no relatório do módulo. */}
            <AlertDialogTitle>Excluir atividade concluída?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta atividade já foi concluída. Deseja realmente excluí-la?
              <br />
              <strong>Essa ação não poderá ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                rose-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
