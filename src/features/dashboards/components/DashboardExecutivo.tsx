import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckSquare, Clock, FolderKanban, Target, Users, Zap } from 'lucide-react'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { COLLABORATOR_ROLE, PROJECT_PHASE, labelOf, type ProjectPhase } from '@/lib/enums'
import { useActivityReadScope } from '@/features/activities/hooks'
import {
  atRiskProjects,
  awaitingClientProjects,
  blockedProjects,
  projectsAbove,
  projectsBelow,
  projectsInPhase,
} from '../executive-projects'
import { useExecutiveDashboard } from '../hooks'
import { OPERATIONAL_ROLES } from '../list'
import type { CollaboratorLoad, ExecutiveFilters, ExecutivePeriod } from '../types'
import CollaboratorProjectsDialog from './CollaboratorProjectsDialog'
import ExecutiveDrilldownDialog, { type ExecutiveDrilldown } from './ExecutiveDrilldownDialog'
import PhaseDistributionChart from './PhaseDistributionChart'

/*
  Porta de projeto-original/src/pages/DashboardExecutivo.jsx — o "Painel
  Executivo".

  Os quatro blocos, na ordem do original: "Visão Geral" (os quatro cartões de
  atividade), "Visão Geral de Projetos Ativos" (quatro cartões clicáveis mais o
  gráfico de fases), "Capacidade do Time" e "Evolução dos Projetos". Cabeçalho,
  barra de três filtros logo abaixo dele, `space-y-8` entre blocos, grades
  1 / md:4 e 1 / lg:3, microcopy idêntico.

  NENHUMA CONTA MORA AQUI. Tudo vem de `useExecutiveDashboard`; os subconjuntos
  que as gavetas abrem vêm de features/dashboards/executive-projects.ts. Cada
  número está documentado ao lado da linha do original que ele reproduz.

  SEIS AGREGAÇÕES DO ORIGINAL NÃO FORAM PORTADAS PORQUE NUNCA APARECERAM EM
  TELA: `deadlineMetrics` (próximas entregas e tarefas atrasadas),
  `statusData`, `produtividadeColaborador`, `volumeProjetos`, `criticas` e
  `tempoMedioHoras` são calculados em DashboardExecutivo.jsx e não são
  renderizados em lugar nenhum — junto com a paleta `COLORS` e metade dos
  ícones importados. Se algum bloco parecer faltar em relação ao arquivo
  original, é isto.

  ESTE PAINEL NÃO ESCREVE NADA: não há formulário, botão de ação ou menu de
  edição para esconder. Quem decide se o item "Painel Executivo"
  (`dashboard_executive`, migration 0004) aparece na barra lateral é
  `useAppNavigation`, e quem decide o que cada linha devolve é a RLS — ver o
  aviso grande no bloco "Visão Geral", que é o ponto mais importante da tela.
*/

/* O valor que o Radix exige no lugar do `null` que o original usa como "todos"
   (Select do Radix não aceita item de valor vazio). Mesmo sentinel de Tasks.tsx. */
const ALL = 'all'

/*
  ═══ O RÓTULO DIZ DE QUEM É O NÚMERO ═══

  Os quatro cartões de "Visão Geral" e o crachá "N atividades abertas" de cada
  projeto saem de `activities`, a única tabela do sistema com leitura estreita.
  O predicado é o da migration 0059 (que substituiu o da 0038): quem tem can_view
  OU can_edit no menu `activities` — Diretor incluído pelo atalho da 0019, que
  `useMenuPermissions` embute igual do lado do cliente — lê o escritório inteiro;
  quem não tem nenhum dos dois lê SÓ as próprias e as de quem coordena.

  A 0059 encolheu o problema e não o fechou: no seed, o Financeiro não tem
  can_view nem can_edit em `activities`, e o Painel Executivo é o único painel
  que a permissão dele abre. Com rótulo fixo ele lia "Atrasadas: 0" — a carga
  dele — na posição em que a diretoria lê o escritório, e "0" é indistinguível
  de "escritório em dia". Nenhum aviso na tela dizia qual dos dois era.

  O ORIGINAL NÃO RESPONDE A ISTO: lá não há RLS, todo mundo lia tudo e o rótulo
  nunca mentia. A saída é decisão do usuário e é ROTULAR POR ESCOPO — o número é
  o mesmo, muda a frase. Quem lê o escritório inteiro vê os rótulos do original,
  palavra por palavra; quem lê só a própria carga vê o rótulo dizendo isso.
  Nenhum cartão é escondido e nada é travado: quem autoriza é a RLS, não a tela.

  QUEM FOR SIMPLIFICAR ISTO DEPOIS: o rótulo fixo só volta a ser verdade no dia
  em que a leitura de `activities` for larga como a das outras tabelas. Enquanto
  a policy da 0059 estiver de pé, tirar o condicional é reintroduzir o número de
  uma pessoa com o nome do escritório.
*/
const ACTIVITY_LABELS = {
  office: {
    inProgress: 'Em Andamento',
    completed: 'Concluídas',
    overdue: 'Atrasadas',
    productivity: 'Produtividade',
    openBadge: 'atividades abertas',
  },
  personal: {
    inProgress: 'Minhas atividades em andamento',
    completed: 'Minhas atividades concluídas',
    overdue: 'Minhas atividades atrasadas',
    productivity: 'Minha produtividade',
    openBadge: 'atividades minhas abertas',
  },
} as const

/*
  As TRÊS APARÊNCIAS de uma linha de "Projetos por Colaborador": as três primeiras
  posições em violeta, o balde "sem responsável" em âmbar, o resto neutro.

  POR QUE UMA ESCADA EXCLUSIVA E NÃO AS CLASSES EMPILHADAS DO ORIGINAL: lá as
  duas condições são escritas uma depois da outra no mesmo `className`
  (DashboardExecutivo.jsx:747-749, 754-756, 777-779 e 784-786), então quando a
  linha é as duas coisas ao mesmo tempo — e é, sempre que o balde cai nas três
  primeiras posições — quem decide a cor não é o código, é a ORDEM DA FOLHA DE
  ESTILO. No Tailwind essa ordem é a da paleta (slate < amber < violet), e o
  resultado no original é sempre: violeta ganha de âmbar, âmbar ganha de slate.

  Copiar as classes empilhadas mudaria a tela, porque o cinza deste projeto não é
  mais `slate-50` e sim o token `elevated`, que a folha gera DEPOIS de `amber-50`
  — o balde âmbar viraria cinza. A escada abaixo é a precedência do original
  escrita à mão, e ela dá o mesmo pixel independentemente de ordem de regra.
*/
const ROW_TONE = {
  top: {
    row: 'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900',
    name: 'text-violet-900 dark:text-violet-200',
    bar: 'bg-violet-500',
    count: 'text-violet-600 dark:text-violet-400',
  },
  unassigned: {
    row: 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900',
    name: 'text-amber-900 dark:text-amber-200',
    bar: 'bg-amber-500',
    count: 'text-amber-600 dark:text-amber-400',
  },
  plain: {
    row: 'bg-elevated border border-border',
    name: 'text-foreground',
    bar: 'bg-faint',
    count: 'text-soft',
  },
} as const

export default function DashboardExecutivo() {
  const queryClient = useQueryClient()

  const [period, setPeriod] = useState<ExecutivePeriod>('mes')
  const [projectFilter, setProjectFilter] = useState<string>(ALL)
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>(ALL)
  const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorLoad | null>(null)
  const [drilldown, setDrilldown] = useState<ExecutiveDrilldown | null>(null)

  /* De quem são os números de atividade desta tela — ver ACTIVITY_LABELS. */
  const { readsAllActivities } = useActivityReadScope()
  const activityLabels = ACTIVITY_LABELS[readsAllActivities ? 'office' : 'personal']

  /*
    OS TRÊS FILTROS DISPARAM CONSULTA, e não são mais um recorte em memória: as
    duas contagens que dependem deles ("Concluídas" e o denominador de
    "Produtividade") são contadas no banco, com o critério no WHERE — ver
    `useActivityCounts`. São dois `count` sem corpo por mudança de filtro, e os
    três filtros são seletores: mudam por clique, nunca por tecla, então não há
    o que segurar ou atrasar aqui.

    O objeto é memoizado porque `teamMetrics` recorta a lista de projetos a
    partir dele — um objeto novo a cada render refaria a conta a cada render. A
    chave do React Query é comparada por valor e não sofreria com isso.
  */
  const filters = useMemo<ExecutiveFilters>(
    () => ({
      period,
      projectId: projectFilter === ALL ? null : projectFilter,
      collaboratorId: collaboratorFilter === ALL ? null : collaboratorFilter,
    }),
    [period, projectFilter, collaboratorFilter],
  )

  const {
    projects,
    tasks,
    progressByProject,
    responsibleByProject,
    collaborators,
    activity,
    operational,
    team,
    progress,
    isLoading,
    isError,
    error,
  } = useExecutiveDashboard(filters)

  /* Os colaboradores do terceiro filtro: ativos nas três funções que executam
     projeto, como no original (linha 510). O conjunto é `OPERATIONAL_ROLES`, o
     mesmo que "Capacidade do Time" usa. */
  const operationalCollaborators = collaborators.filter(
    (collaborator) =>
      collaborator.status === 'active' && OPERATIONAL_ROLES.includes(collaborator.role),
  )

  /* A escala das barrinhas de "Projetos por Colaborador": o maior número da
     lista vale 100%, como no original (linha 780). */
  const maxCollaboratorProjects = Math.max(
    ...team.byCollaborator.map((load) => load.projectCount),
    0,
  )

  /*
    DOIS CARREGAMENTOS, e o segundo não existe no original.

    Lá o `isLoading` é só a primeira leitura das oito listas: mexer nos filtros
    depois disso não pedia nada ao servidor, era recorte em memória. Aqui os
    filtros ALIMENTAM UM WHERE — "Concluídas" e o denominador de "Produtividade"
    são contados no banco (ver `useActivityCounts`) —, então cada mudança de
    filtro é uma chave nova de consulta e volta a marcar `isLoading`.

    Se o esqueleto de tela cheia respondesse a esse segundo caso, o painel
    inteiro sumiria — cabeçalho e a própria barra de filtros junto — a cada
    clique num seletor. Então:

    - PRIMEIRA CARGA (nada em cache ainda): o esqueleto do original, tela cheia.
    - RECONTAGEM POR FILTRO: a tela fica de pé e só os quatro cartões que
      dependem da contagem viram esqueleto. É o mesmo recorte que o Painel Geral
      faz com `isLoadingFinancial`, que por sua vez é o do original.

    O que NÃO foi feito: deixar os quatro cartões mostrarem zero enquanto a
    contagem viaja. Zero é uma resposta, e "nenhuma atividade concluída neste
    período" não pode ser indistinguível de "ainda estou contando".
  */
  const isFirstLoad = isLoading && projects.length === 0 && collaborators.length === 0
  const isRecounting = isLoading && !isFirstLoad

  if (isFirstLoad) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(8)].map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Painel Executivo</h1>
        <p className="text-muted-foreground mt-1">
          Consolidação em tempo real de projetos, fluxo e atividades
        </p>
      </div>

      {/* Filtros Globais */}
      <Card className="border-0 shadow-sm bg-elevated">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4">
            <Select value={period} onValueChange={(value) => setPeriod(value as ExecutivePeriod)}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Esta semana</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos projetos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos projetos</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos colaboradores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos colaboradores</SelectItem>
                {operationalCollaborators.map((collaborator) => (
                  <SelectItem key={collaborator.id} value={collaborator.id}>
                    {collaborator.name} ({labelOf(COLLABORATOR_ROLE, collaborator.role)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/*
        O TERCEIRO ESTADO, que o original não tem: lá, falha de leitura vai para
        o console e a tela desenha o painel inteiro zerado — "0 atrasadas" e
        "nenhum projeto ativo" ficam indistinguíveis de "não deu para carregar".
        Cabeçalho e filtros continuam de pé; só o corpo é substituído, como no
        Painel Geral. `invalidateQueries()` sem chave porque o painel cruza sete
        consultas de quatro módulos.
      */}
      {isError ? (
        <ErrorState
          title="Não foi possível carregar o painel"
          description="Os números do painel não puderam ser lidos agora."
          error={error}
          onRetry={() => {
            void queryClient.invalidateQueries()
          }}
        />
      ) : (
        <>
          {/* 🔹 BLOCO 1 – VISÃO GERAL */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Visão Geral
            </h2>
            {/*
              ESTES QUATRO NÚMEROS NÃO SÃO OS MESMOS PARA TODO MUNDO, e por isso
              o rótulo deles é condicional — o porquê inteiro está em
              ACTIVITY_LABELS, no topo do arquivo. Resumo: a leitura de
              `activities` é estreita (migrations 0038 e 0059) e estes quatro
              cartões, mais os crachás "N atividades abertas" lá embaixo, saem
              dela. Quem lê o escritório vê os rótulos do original; quem lê só a
              própria carga vê o rótulo dizer isso.

              DOIS DELES AINDA IGNORAM A BARRA DE FILTROS logo acima, e isso é do
              original (ver `activityMetrics`): "Em Andamento" e "Atrasadas"
              contam tudo, sem período, sem projeto e sem colaborador. Só
              "Concluídas" e "Produtividade" respeitam o que a barra diz.
            */}
            {isRecounting ? (
              /* A recontagem por filtro, na mesma grade e na mesma altura dos
                 quatro cartões — ver a nota dos dois carregamentos, acima. */
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-32" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      {activityLabels.inProgress}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {activity.inProgress}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                      <CheckSquare className="w-4 h-4" />
                      {activityLabels.completed}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                      {activity.completed}
                    </div>
                    {/* O rótulo do período NÃO COBRE "Todas": o ternário do
                        original (linha 553) cai em "Hoje" quando o filtro é
                        "Todas", e o cartão passa a dizer "Hoje" mostrando a
                        contagem de todos os tempos. Reproduzido. */}
                    <p className="text-xs text-muted-foreground mt-1">
                      {period === 'mes' ? 'Este mês' : period === 'semana' ? 'Esta semana' : 'Hoje'}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {activityLabels.overdue}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                      {activity.overdue}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      {activityLabels.productivity}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/*
                      MÉTRICA QUEBRADA, REPRODUZIDA COMO TAL (ver `activityMetrics`):
                      é `concluídas ÷ previstas`, e "previstas" sai do mesmo recorte
                      já filtrado por DATA DE CONCLUSÃO — ou seja, de atividades que
                      necessariamente já foram concluídas. Denominador quase igual
                      ao numerador, cartão em ~100% sempre. E o rótulo diz "Meta vs
                      concluído" sem que exista meta em lugar nenhum do sistema.
                      Consertar exige decidir o que é a meta, e isso é do usuário.
                    */}
                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                      {activity.productivity}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Meta vs concluído</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* 🔹 BLOCO 2 – PROJETOS ATIVOS (LISTA PRINCIPAL) + BLOCO 3 – DISTRIBUIÇÃO POR FASE */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Visão Geral de Projetos Ativos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() => setDrilldown({ title: 'Projetos Ativos', projects })}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" />
                    Total Ativo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {operational.totalProjects}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() =>
                  setDrilldown({
                    title: 'Projetos Aguardando Cliente',
                    projects: awaitingClientProjects(projects),
                  })
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Aguardando Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {operational.awaitingClient}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
                </CardContent>
              </Card>

              {/* O NÚMERO VEM DO BANCO E A GAVETA VEM DA LISTA — os dois podem
                  discordar passadas 500 tarefas. Ver `atRiskProjects`. */}
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() =>
                  setDrilldown({
                    title: 'Projetos Em Risco',
                    projects: atRiskProjects(projects, tasks),
                  })
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Em Risco
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                    {operational.atRisk}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() =>
                  setDrilldown({
                    title: 'Projetos Bloqueados',
                    projects: blockedProjects(projects, progressByProject),
                  })
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" />
                    Bloqueados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-violet-600 dark:text-violet-400">
                    {operational.blocked}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Distribuição por Fase</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique nas barras para ver detalhes
                </p>
              </CardHeader>
              <CardContent>
                <PhaseDistributionChart
                  data={operational.byPhase}
                  onSelectPhase={(phase: ProjectPhase) =>
                    setDrilldown({
                      title: `Projetos na fase: ${labelOf(PROJECT_PHASE, phase)}`,
                      projects: projectsInPhase(projects, phase),
                    })
                  }
                />
              </CardContent>
            </Card>
          </div>

          {/* 🔹 BLOCO 4 – CAPACIDADE DO TIME */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Capacidade do Time
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Projetos por Colaborador</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Arquitetos, Estagiários e Coordenadores • Clique para ver detalhes
                  </p>
                </CardHeader>
                <CardContent>
                  {/* O vazio deste bloco é o do original, e ele tem altura fixa
                      para o cartão não encolher ao lado do de baixo. */}
                  {team.byCollaborator.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <p className="text-sm text-muted-foreground text-center">
                        Nenhum projeto com responsável operacional definido
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      {team.byCollaborator.map((load, index) => {
                        const isTop = index < 3
                        /* O balde "Sem responsável no Fluxo do Projeto", que vai
                           para o fim da lista — ver `teamMetrics`. */
                        const isUnassigned = load.needsAction
                        const tone = ROW_TONE[isTop ? 'top' : isUnassigned ? 'unassigned' : 'plain']

                        return (
                          <div
                            key={load.id}
                            onClick={() => setSelectedCollaborator(load)}
                            className={`p-3 rounded-lg transition-all cursor-pointer hover:shadow-md ${tone.row}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-medium ${tone.name}`}>
                                    {load.name}
                                  </span>
                                  {load.role && (
                                    <Badge
                                      variant="outline"
                                      className="bg-muted text-soft border-border text-xs"
                                    >
                                      {labelOf(COLLABORATOR_ROLE, load.role)}
                                    </Badge>
                                  )}
                                  {isTop && !isUnassigned && (
                                    <Badge
                                      variant="outline"
                                      className="bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-900 text-xs"
                                    >
                                      Top {index + 1}
                                    </Badge>
                                  )}
                                  {isUnassigned && (
                                    <Badge
                                      variant="outline"
                                      className="bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900 text-xs"
                                    >
                                      ⚠️ Definir no Fluxo do Projeto
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1 w-full bg-muted rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all ${tone.bar}`}
                                    style={{
                                      width: `${(load.projectCount / maxCollaboratorProjects) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <span className={`ml-4 text-2xl font-bold ${tone.count}`}>
                                {load.projectCount}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" />
                    Projetos Ativos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Este cartão RESPEITA os filtros de projeto e colaborador, ao
                      contrário do "Total Ativo" do bloco de cima, que conta
                      todos — os dois ficam a uma rolagem um do outro. É do
                      original (ver `teamMetrics`). */}
                  <div className="text-3xl font-bold text-violet-600 dark:text-violet-400">
                    {team.activeProjects}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Total ativo</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 📊 BLOCO EVOLUÇÃO DOS PROJETOS */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Evolução dos Projetos
            </h2>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Progresso Médio</CardTitle>
                </CardHeader>
                <CardContent>
                  {/*
                    O PROGRESSO É O DA VIEW `project_progress`, e ele DIVERGE do
                    original por decisão do usuário registrada na migration 0035:
                    lá uma única tarefa concluída levava o projeto a 100%. Os três
                    cartões deste bloco e a lista abaixo mudam de valor em relação
                    ao base44 — e mudam para melhor. É a mesma porcentagem que a
                    lista de Projetos e o kanban já mostram.
                  */}
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {progress.averageProgress}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Projetos ativos</p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() =>
                  setDrilldown({
                    title: 'Projetos < 30% (Exigem Atenção)',
                    projects: projectsBelow(progress.sorted, 30),
                  })
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Projetos &lt; 30%</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                    {progress.below30}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() =>
                  setDrilldown({
                    title: 'Projetos > 80% (Finalização)',
                    projects: projectsAbove(progress.sorted, 80),
                  })
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Projetos &gt; 80%</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {progress.above80}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
                </CardContent>
              </Card>
            </div>

            {/* Lista de Projetos com Progresso */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Projetos Ativos - Ordenados por Progresso
                </CardTitle>
              </CardHeader>
              <CardContent>
                {progress.sorted.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum projeto ativo
                  </p>
                ) : (
                  <div className="space-y-3">
                    {progress.sorted.map((row) => {
                      const percent = row.progressPercent
                      const progressColor =
                        percent < 30 ? 'bg-rose-500' : percent > 80 ? 'bg-green-500' : 'bg-blue-500'

                      return (
                        <div key={row.project.id} className="p-4 bg-elevated rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-foreground text-sm">
                                  {row.project.name}
                                </h4>
                                {row.project.client && (
                                  <Badge variant="outline" className="text-xs bg-card">
                                    {row.project.client.name}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  📍 {labelOf(PROJECT_PHASE, row.project.current_phase)}
                                </span>
                                {/* O responsável é o da ÚLTIMA TAREFA que a
                                    consulta devolveu, sem critério de desempate —
                                    é o `map.set` do original. Criar uma tarefa
                                    nova pode trocar este nome e mexer em
                                    "Projetos por Colaborador" logo acima. Ver
                                    `projectResponsibleMap`. */}
                                <span className="text-xs text-muted-foreground">
                                  👤{' '}
                                  {row.responsible?.name ??
                                    'Sem responsável definido no Fluxo do Projeto'}
                                </span>
                                {/*
                                  ESTE CRACHÁ TAMBÉM É LEITURA ESTREITA — mesma
                                  ressalva dos quatro cartões do topo, e por isso
                                  o mesmo rótulo condicional (ver
                                  ACTIVITY_LABELS): ele conta as atividades que
                                  QUEM ESTÁ OLHANDO pode ler, não as do projeto.

                                  E ele conta uma coisa diferente do cartão
                                  "Concluídas": aqui a atividade excluída fica de
                                  fora, lá ela entra (o original filtra
                                  `atividade_excluida` neste bloco e não filtra no
                                  cartão). Reproduzido nos dois lugares.
                                */}
                                {row.openActivities > 0 && (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      row.overdueActivities > 0
                                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900'
                                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900'
                                    }`}
                                  >
                                    {row.openActivities} {activityLabels.openBadge}
                                    {row.overdueActivities > 0 &&
                                      ` (${row.overdueActivities} atrasadas)`}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <span className="text-lg font-bold text-foreground ml-3">
                              {percent}%
                            </span>
                          </div>

                          <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`absolute top-0 left-0 h-full ${progressColor} transition-all duration-300`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          {row.requiredItemsTotal > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              ✓ {row.requiredItemsCompleted} de {row.requiredItemsTotal} itens
                              obrigatórios do fluxo
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/*
        AS DUAS GAVETAS. No original elas ficam dentro do bloco "Capacidade do
        Time" (linhas 815 e 970), o que não muda nada em tela — as duas são
        portais do Radix e a de drill-down é aberta por seis cartões e pelo
        gráfico, espalhados por três blocos. Aqui elas ficam no fim do arquivo,
        onde se lê que são da tela inteira.
      */}
      <CollaboratorProjectsDialog
        load={selectedCollaborator}
        progressByProject={progressByProject}
        responsibleByProject={responsibleByProject}
        onClose={() => setSelectedCollaborator(null)}
      />

      <ExecutiveDrilldownDialog
        data={drilldown}
        progressByProject={progressByProject}
        responsibleByProject={responsibleByProject}
        onClose={() => setDrilldown(null)}
      />
    </div>
  )
}
