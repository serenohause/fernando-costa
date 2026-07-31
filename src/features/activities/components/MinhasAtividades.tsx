import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { format, isToday, isWithinInterval, parseISO, subDays } from 'date-fns'
import {
  Activity as ActivityIcon,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  PlayCircle,
} from 'lucide-react'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { useProjectProgress, useProjects, useTasks } from '@/features/projects/hooks'
import type { ProjectRow, TaskRow } from '@/features/projects/types'
import {
  PRIORITY_LEVEL,
  PROJECT_PHASE,
  PROJECT_STATUS,
  WORK_STATUS,
  labelOf,
} from '@/lib/enums'
import { createPageUrl } from '@/lib/page-url'
import { formatDateBR } from '@/lib/format'
import { isOverdue, sortMyActivities } from '../list'
import { useActivities } from '../hooks'
import { PRIORITY_TEXT } from './priority-styles'
import type { ActivityRow } from '../types'

/*
  Porta de projeto-original/src/pages/MinhasAtividades.jsx.

  O cabeçalho, o aviso rosado de atraso com o emoji, os quatro cartões de
  indicador, o atalho "Ver Todas as Atividades", o cartão "Meus Projetos
  (Responsável)" com a grade de três colunas e a barra de progresso, o diálogo de
  detalhes do projeto e a tabela "Suas Atividades" com as cinco colunas são os do
  original, na mesma ordem.

  O RECORTE POR PESSOA NÃO ESTÁ MAIS AQUI, e é a mudança central do módulo. No
  original esta tela baixa TODAS as atividades e peneira no navegador
  (linha 58, `a.colaborador_id === currentCollaborator.id`); nada impede a
  chamada direta à entidade, então o recorte é cosmético. Agora ele é regra do
  banco: `activities_select_own_or_activities_editor` (migration 0038) só devolve
  a atividade a quem não tem `can_edit_menu('activities')` quando essa pessoa é o
  responsável ou o coordenador. Arquiteto e Estagiário — que no seed não recebem
  menu nenhum, e são justamente para quem esta tela existe — recebem só as suas.

  CONSEQUÊNCIA CONHECIDA, e está no relatório do módulo: para quem TEM o menu
  (Coordenador, Administrativo, Diretor), a consulta devolve o escritório
  inteiro, e esta tela passa a mostrá-lo. O que distingue as duas telas hoje é
  layout e ordenação, não filtro.

  "Meus Projetos" continua sendo filtro de tela, e não de policy: ele não é
  recorte de acesso, é a pergunta "de quais cartões do Fluxo do Projeto eu sou o
  responsável" — `tasks` tem leitura larga (migration 0033) de propósito.
*/

const CARD = 'bg-card border-0 shadow-xs'

type MyProject = ProjectRow & {
  nextDelivery: Date | null
  hasOverdueTasks: boolean
  progressPercent: number
}

export default function MinhasAtividades() {
  const [selectedProject, setSelectedProject] = useState<MyProject | null>(null)

  const collaboratorQuery = useCurrentCollaborator()
  const currentCollaborator = collaboratorQuery.data ?? null

  const activitiesQuery = useActivities()
  const tasksQuery = useTasks()
  const projectsQuery = useProjects()
  const progressQuery = useProjectProgress()

  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data])
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  /*
    "Meus Projetos" — os projetos em que sou o responsável do cartão no Fluxo do
    Projeto (linhas 64-116).

    `visivel_em_projetos` não é testado aqui: `useProjects` já consulta
    `where visible_in_list` (módulo 5), que é o mesmo recorte que o original faz
    em memória.

    `progresso_percentual` era COLUNA de `Project`, mantida pelo navegador; agora
    é a view `project_progress` (migrations 0034/0035).
  */
  const myProjects = useMemo<MyProject[]>(() => {
    if (!currentCollaborator) return []

    const mine = new Set(
      tasks
        .filter((task) => task.responsible_id === currentCollaborator.id && task.project_id)
        .map((task) => task.project_id as string),
    )

    const now = new Date()

    return (projectsQuery.data ?? [])
      .filter(
        (project) =>
          mine.has(project.id) &&
          project.status !== 'completed' &&
          project.status !== 'suspended' &&
          project.current_phase !== 'finished',
      )
      .map((project) => {
        const openTasks = tasks.filter(
          (task) => task.project_id === project.id && task.status !== 'completed',
        )

        const upcoming = openTasks
          .filter((task) => task.due_date && parseISO(task.due_date) >= now)
          .map((task) => parseISO(task.due_date as string))
          .sort((a, b) => a.getTime() - b.getTime())

        return {
          ...project,
          nextDelivery: upcoming[0] ?? null,
          hasOverdueTasks: openTasks.some(
            (task) => task.due_date && parseISO(task.due_date) < now,
          ),
          progressPercent: progressQuery.data?.get(project.id)?.progress_percent ?? 0,
        }
      })
  }, [currentCollaborator, tasks, projectsQuery.data, progressQuery.data])

  /*
    Os quatro indicadores (linhas 119-147).

    UMA CONSOLIDAÇÃO: "Em Atraso" usa a mesma definição das outras duas telas
    (`isOverdue`, prazo anterior ao INÍCIO de hoje). O original compara o prazo
    com o instante atual (linha 133), o que faz toda atividade que vence HOJE
    aparecer como atrasada aqui e como no prazo na tela de Atividades — as duas
    telas discordando sobre a mesma linha. Está no relatório do módulo.
  */
  const counters = useMemo(() => {
    const sevenDaysAgo = subDays(new Date(), 7)
    return {
      today: activities.filter((activity) => isToday(parseISO(activity.end_date))).length,
      running: activities.filter((activity) => activity.status === 'in_progress').length,
      late: activities.filter((activity) => isOverdue(activity)).length,
      completedThisWeek: activities.filter(
        (activity) =>
          activity.status === 'completed' &&
          activity.completed_at != null &&
          isWithinInterval(parseISO(activity.completed_at), {
            start: sevenDaysAgo,
            end: new Date(),
          }),
      ).length,
    }
  }, [activities])

  const orderedActivities = useMemo(() => sortMyActivities(activities), [activities])

  /* O original mostra este mesmo bloco enquanto o colaborador não chegou. */
  if (collaboratorQuery.isLoading || !currentCollaborator) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="text-center">
          <ActivityIcon className="w-12 h-12 text-faint mx-auto mb-3" />
          <p className="text-muted-foreground">Carregando suas atividades...</p>
        </div>
      </div>
    )
  }

  const projectTasksOf = (project: MyProject): TaskRow[] =>
    tasks
      .filter((task) => task.project_id === project.id)
      .sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1
        if (a.status !== 'completed' && b.status === 'completed') return -1
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime()
      })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Minhas Atividades</h1>
        <p className="text-muted-foreground mt-1">Visão geral das suas tarefas e prazos</p>
      </div>

      {counters.late > 0 && (
        <Card className="bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900">
          <div className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <p className="text-sm text-rose-800 dark:text-rose-200">
              ⚠️ Você possui {counters.late}{' '}
              {counters.late === 1 ? 'atividade' : 'atividades'} em atraso.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={CARD}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-2xl font-bold text-foreground">{counters.today}</span>
            </div>
            <p className="text-sm text-soft">Atividades de Hoje</p>
          </div>
        </Card>

        <Card className={CARD}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <PlayCircle className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <span className="text-2xl font-bold text-foreground">{counters.running}</span>
            </div>
            <p className="text-sm text-soft">Em Execução</p>
          </div>
        </Card>

        <Card className={CARD}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <span className="text-2xl font-bold text-foreground">{counters.late}</span>
            </div>
            <p className="text-sm text-soft">Em Atraso</p>
          </div>
        </Card>

        <Card className={CARD}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-2xl font-bold text-foreground">
                {counters.completedThisWeek}
              </span>
            </div>
            <p className="text-sm text-soft">Concluídas (Semana)</p>
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Link to={createPageUrl('Atividades')}>
          <Button variant="outline" className="gap-2">
            <ActivityIcon className="w-4 h-4" />
            Ver Todas as Atividades
          </Button>
        </Link>
      </div>

      <Card className={CARD}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                Meus Projetos (Responsável)
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Projetos onde você é o responsável no Fluxo do Projeto
              </p>
            </div>
            <Badge
              variant="outline"
              className="bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900 text-lg px-3 py-1"
            >
              {myProjects.length}
            </Badge>
          </div>

          {projectsQuery.isError || tasksQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar seus projetos"
              description="Os projetos do Fluxo do Projeto não puderam ser lidos agora."
              error={projectsQuery.error ?? tasksQuery.error}
              onRetry={() => {
                void projectsQuery.refetch()
                void tasksQuery.refetch()
              }}
            />
          ) : projectsQuery.isLoading || tasksQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando projetos...</div>
          ) : myProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderKanban className="w-12 h-12 text-faint mx-auto mb-3" />
              <p>Você não é responsável por nenhum projeto no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                    project.hasOverdueTasks
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 hover:border-rose-400 dark:hover:border-rose-700'
                      : 'bg-elevated border-border hover:border-violet-300 dark:hover:border-violet-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground text-sm truncate">
                        {project.name}
                      </h4>
                      {/* Nome ATUAL do cadastro, via join: `client_name` saiu do
                          schema no módulo 5. */}
                      {project.client && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {project.client.name}
                        </p>
                      )}
                    </div>
                    {project.hasOverdueTasks && (
                      <Badge
                        variant="outline"
                        className="bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900 text-xs shrink-0"
                      >
                        Atrasado
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 mt-3">
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                    >
                      📍 {labelOf(PROJECT_PHASE, project.current_phase)}
                    </Badge>

                    {project.nextDelivery && (
                      <div className="flex items-center gap-1.5 text-xs text-soft">
                        <Calendar className="w-3.5 h-3.5" />
                        Próxima entrega: {format(project.nextDelivery, 'dd/MM/yyyy')}
                      </div>
                    )}

                    <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          project.hasOverdueTasks ? 'bg-rose-500' : 'bg-violet-500'
                        }`}
                        style={{ width: `${project.progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Progresso: {project.progressPercent}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={Boolean(selectedProject)} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalhes do Projeto
              <a
                href={`${createPageUrl('Tasks')}?projeto=${selectedProject?.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <Button size="icon" variant="ghost" className="h-6 w-6">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            </DialogTitle>
          </DialogHeader>

          {selectedProject && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{selectedProject.name}</h3>
                {selectedProject.client && (
                  <p className="text-sm text-soft mt-1">Cliente: {selectedProject.client.name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Responsável</p>
                  <p className="text-sm font-medium text-foreground">{currentCollaborator.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fase Atual</p>
                  <Badge className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900">
                    {labelOf(PROJECT_PHASE, selectedProject.current_phase)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Progresso</p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedProject.progressPercent}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <StatusBadge status={labelOf(PROJECT_STATUS, selectedProject.status)} />
                </div>
              </div>

              {selectedProject.nextDelivery && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Próxima Entrega:{' '}
                    {format(selectedProject.nextDelivery, "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                </div>
              )}

              {selectedProject.hasOverdueTasks && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg">
                  <p className="text-sm font-medium text-rose-900 dark:text-rose-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Este projeto possui tarefas em atraso
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Tarefas do Projeto</h4>
                <div className="space-y-2">
                  {projectTasksOf(selectedProject).map((task) => {
                    const overdue =
                      task.status !== 'completed' &&
                      task.due_date != null &&
                      parseISO(task.due_date) < new Date()

                    return (
                      <div
                        key={task.id}
                        className={`p-3 rounded-lg border ${
                          overdue
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900'
                            : task.status === 'completed'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
                              : 'bg-elevated border-border'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{task.title}</p>
                            {task.due_date && (
                              <p
                                className={`text-xs mt-1 ${
                                  overdue
                                    ? 'text-rose-600 dark:text-rose-400 font-medium'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                Prazo: {formatDateBR(task.due_date)}
                              </p>
                            )}
                          </div>
                          <StatusBadge status={labelOf(WORK_STATUS, task.status)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className={CARD}>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Suas Atividades</h2>

          {/* Três estados explícitos. O original só distingue carregando e vazio;
              falha de leitura nele fica igualzinha a "não há atividade nenhuma". */}
          {activitiesQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar suas atividades"
              description="A lista de atividades não pôde ser lida agora."
              error={activitiesQuery.error}
              onRetry={() => {
                void activitiesQuery.refetch()
              }}
            />
          ) : activitiesQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando atividades...</div>
          ) : orderedActivities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Você não possui atividades no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-soft uppercase">
                      Atividade
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-soft uppercase">
                      Projeto
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-soft uppercase">
                      Prioridade
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-soft uppercase">
                      Prazo
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-soft uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderedActivities.map((activity: ActivityRow) => {
                    const late = isOverdue(activity)

                    return (
                      <tr
                        key={activity.id}
                        className={`border-b border-border transition-colors hover:bg-elevated ${
                          late ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{activity.description}</p>
                          {activity.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {activity.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-soft">{activity.project?.name ?? '-'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-sm font-medium ${PRIORITY_TEXT[activity.priority]}`}>
                            {labelOf(PRIORITY_LEVEL, activity.priority)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div
                            className={`flex items-center gap-1.5 text-sm ${
                              late ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-soft'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {formatDateBR(activity.end_date)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={labelOf(WORK_STATUS, activity.status)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
