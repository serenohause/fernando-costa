import { useMemo, useState } from 'react'
import { Award, Calendar, Clock, Filter, Target, TrendingUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMenuPermissions } from '@/features/auth/hooks'
import { useCollaborators } from '@/features/team/hooks'
import { useProjects } from '@/features/projects/hooks'
import { PRIORITY_LEVEL, labelOf, optionsOf, type PriorityLevel } from '@/lib/enums'
import {
  filterByPeriod,
  groupByProject,
  rankByCollaborator,
  reportMetrics,
  wasLate,
  type CollaboratorRanking,
  type ProjectProductivity,
  type ReportPeriod,
} from '../productivity'
import { useCompletedActivities } from '../hooks'
import { PRIORITY_REPORT_BADGE, PROJECT_BADGE } from './priority-styles'
import type { ActivityRow } from '../types'

/*
  Porta de projeto-original/src/pages/RelatorioProdutividade.jsx.

  O cabeçalho, o cartão de filtros com a grade de cinco colunas, os quatro
  cartões de métrica, as três abas (Ranking Colaboradores, Por Projeto,
  Detalhamento) e as colunas de cada uma são os do original, na mesma ordem.
  Esta página não tem item na barra lateral no original — chega-se a ela pela
  URL, e continua assim.

  AUTORIZAÇÃO. O original barra com `if (!isAdmin)` e a tela "Acesso restrito a
  gestores" (linhas 287-296). Aquele `isAdmin` é
  `user.role === 'admin' || collaborator.role === 'Diretor' ||
   collaborator.area === 'Coordenação' || collaborator.role === 'Coordenação'`,
  e os dois últimos termos são código morto: 'Coordenação' não existe nem entre
  as áreas nem entre as funções de `Collaborator`. No ar, entra o Diretor.

  Aqui o critério é `can_edit_menu('activities')`, que é o mesmo conjunto de
  pessoas a quem a policy da migration 0038 entrega as atividades do escritório
  inteiro — sem isso o relatório sairia com o recorte de uma pessoa só e pareceria
  simplesmente errado. Diretor entra pelo atalho da 0019, como no original, e
  Coordenador e Administrativo passam a entrar também, que é o que o original
  tentava fazer com o termo morto.

  DUAS DIFERENÇAS NO DADO, as duas registradas no relatório do módulo:

  1. Atividade EXCLUÍDA não entra. O original a inclui de propósito (linha 59) e
     a marca com um crachá "Excluída" na aba de detalhamento — por isso o crachá
     também não está aqui. A decisão de filtrar `deleted_at` em toda listagem é
     do módulo; nenhuma atividade excluída do escritório de teste é concluída,
     então o número em tela não muda hoje.
  2. "Atrasada" passa a ser conclusão depois do FIM do dia do prazo, e não depois
     da meia-noite em UTC — ver o comentário de `wasLate` em productivity.ts.
*/
export default function RelatorioProdutividade() {
  const [period, setPeriod] = useState<ReportPeriod>('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [collaboratorFilter, setCollaboratorFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'all'>('all')

  const { canEdit, isLoading: permissionsLoading } = useMenuPermissions('activities')

  const activitiesQuery = useCompletedActivities()
  const collaboratorsQuery = useCollaborators()
  const projectsQuery = useProjects()

  const filtered = useMemo(() => {
    const inPeriod = filterByPeriod(
      activitiesQuery.data ?? [],
      period,
      customStart,
      customEnd,
    )
    return inPeriod.filter((activity) => {
      if (collaboratorFilter !== 'all' && activity.collaborator_id !== collaboratorFilter) {
        return false
      }
      if (projectFilter !== 'all' && activity.project_id !== projectFilter) return false
      if (priorityFilter !== 'all' && activity.priority !== priorityFilter) return false
      return true
    })
  }, [
    activitiesQuery.data,
    period,
    customStart,
    customEnd,
    collaboratorFilter,
    projectFilter,
    priorityFilter,
  ])

  const metrics = useMemo(() => reportMetrics(filtered), [filtered])
  const ranking = useMemo(() => rankByCollaborator(filtered), [filtered])
  const byProject = useMemo(() => groupByProject(filtered), [filtered])

  const rankingColumns: Column<CollaboratorRanking>[] = [
    {
      header: 'Posição',
      cell: (row) => (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-soft font-semibold text-sm">
          {row.position}
        </div>
      ),
    },
    { header: 'Colaborador', cell: (row) => <span className="font-medium">{row.name}</span> },
    { header: 'Atividades', cell: (row) => <span className="text-soft">{row.total}</span> },
    { header: 'Tempo Total', cell: (row) => <span className="text-soft">{row.totalHours}h</span> },
    { header: 'Tempo Médio', cell: (row) => <span className="text-soft">{row.averageHours}h</span> },
    {
      header: 'Taxa Atraso',
      cell: (row) => (
        <Badge
          variant="outline"
          className={
            row.latePercent === 0
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
              : row.latePercent < 20
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                : row.latePercent < 40
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
          }
        >
          {row.latePercent}%
        </Badge>
      ),
    },
  ]

  const projectColumns: Column<ProjectProductivity>[] = [
    {
      header: 'Projeto',
      cell: (row) => (
        <Badge variant="outline" className={PROJECT_BADGE}>
          {row.name}
        </Badge>
      ),
    },
    { header: 'Total Atividades', cell: (row) => <span className="text-soft">{row.total}</span> },
    {
      header: 'Tempo Total',
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-faint" />
          <span className="text-soft">{row.totalHours}h</span>
        </div>
      ),
    },
  ]

  const detailColumns: Column<ActivityRow>[] = [
    {
      header: 'Atividade',
      cell: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.description}</p>
        </div>
      ),
    },
    {
      header: 'Responsável',
      cell: (row) => <span className="text-sm">{row.collaborator?.name ?? '-'}</span>,
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
      header: 'Prioridade',
      cell: (row) => (
        <Badge variant="outline" className={PRIORITY_REPORT_BADGE[row.priority]}>
          {labelOf(PRIORITY_LEVEL, row.priority)}
        </Badge>
      ),
    },
    {
      header: 'Tempo Execução',
      /* `total_minutes` é calculado pelo banco — a tela só divide por 60. */
      cell: (row) => (
        <div className="flex items-center gap-1 text-sm text-soft">
          <Clock className="w-3 h-3" />
          {Math.round(((row.total_minutes ?? 0) / 60) * 10) / 10}h
        </div>
      ),
    },
    {
      header: 'Conclusão',
      cell: (row) => (
        <span className="text-sm text-soft">
          {row.completed_at ? format(parseISO(row.completed_at), 'dd/MM/yyyy HH:mm') : '-'}
        </span>
      ),
    },
    {
      header: 'Status Prazo',
      cell: (row) => (
        <Badge
          variant="outline"
          className={
            wasLate(row)
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
          }
        >
          {wasLate(row) ? 'Atrasada' : 'No prazo'}
        </Badge>
      ),
    },
  ]

  /* O bloco de acesso restrito do original, com o mesmo ícone e a mesma frase. */
  if (!permissionsLoading && !canEdit) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Award className="w-12 h-12 text-faint mx-auto mb-4" />
          <p className="text-soft">Acesso restrito a gestores</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Relatório de Produtividade"
        subtitle="Análise de desempenho e métricas de execução"
        icon={TrendingUp}
      />

      <Card className="mb-6 border-0 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Esta semana</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="custom">Customizado</SelectItem>
              </SelectContent>
            </Select>

            {period === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Data início</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data fim</Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Mesma tradução dos filtros da tela de Atividades: o original usa
                `value={null}` na opção "todos", que o Select do Radix recusa. */}
            <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos colaboradores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos colaboradores</SelectItem>
                {(collaboratorsQuery.data ?? []).map((collaborator) => (
                  <SelectItem key={collaborator.id} value={collaborator.id}>
                    {collaborator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos projetos" />
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
              value={priorityFilter}
              onValueChange={(value) => setPriorityFilter(value as PriorityLevel | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas prioridades" />
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
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Total de Atividades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              <span className="text-2xl font-bold text-foreground">{metrics.totalActivities}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Tempo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-500" />
              <span className="text-2xl font-bold text-foreground">{metrics.totalHours}h</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Tempo Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-violet-500" />
              <span className="text-2xl font-bold text-foreground">{metrics.averageHours}h</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Taxa de Atraso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" />
              <span className="text-2xl font-bold text-foreground">{metrics.latePercent}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Três estados explícitos. O erro é o que o original não tem: falha de
          leitura lá deixa o relatório zerado, indistinguível de "ninguém
          concluiu nada no período". */}
      {activitiesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar o relatório"
          description="As atividades concluídas não puderam ser lidas agora."
          error={activitiesQuery.error}
          onRetry={() => {
            void activitiesQuery.refetch()
          }}
        />
      ) : (
        <Tabs defaultValue="ranking" className="space-y-4">
          <TabsList className="w-full sm:w-auto overflow-x-auto flex-nowrap">
            <TabsTrigger value="ranking" className="whitespace-nowrap">
              Ranking Colaboradores
            </TabsTrigger>
            <TabsTrigger value="projetos" className="whitespace-nowrap">
              Por Projeto
            </TabsTrigger>
            <TabsTrigger value="detalhes" className="whitespace-nowrap">
              Detalhamento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ranking">
            <Card className="border-0 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Produtividade por Colaborador</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={rankingColumns}
                  data={ranking}
                  isLoading={activitiesQuery.isLoading}
                  emptyMessage="Nenhum dado disponível"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projetos">
            <Card className="border-0 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Atividades por Projeto</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={projectColumns}
                  data={byProject}
                  isLoading={activitiesQuery.isLoading}
                  emptyMessage="Nenhum projeto com atividades"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="detalhes">
            <Card className="border-0 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Detalhamento de Atividades</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={detailColumns}
                  data={filtered}
                  isLoading={activitiesQuery.isLoading}
                  emptyMessage="Nenhuma atividade encontrada"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
