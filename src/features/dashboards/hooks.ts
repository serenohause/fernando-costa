import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { periodRange } from '@/features/activities/productivity'
import { useCollaborators } from '@/features/team/hooks'
import { useContracts } from '@/features/contracts/hooks'
import { useNegotiations } from '@/features/pipeline/hooks'
import { useProjectProgress, useProjects, useTasks } from '@/features/projects/hooks'
import { usePayables, useReceivables } from '@/features/financial/hooks'
import type { MonthYear } from '@/features/financial/types'
import {
  activeFlowProjects,
  activityMetrics,
  closedContractsIn,
  closingMetrics,
  countProjectStages,
  flowTasks,
  funnelMetrics,
  funnelStageTotals,
  homeTargetFor,
  operationalMetrics,
  overdueUtcDateBound,
  overviewFinancial,
  progressMetrics,
  projectResponsibleMap,
  teamMetrics,
  todayLocalDate,
  upcomingDeliveries,
  velocityMetrics,
} from './list'
import type {
  ActivityCounts,
  DashboardActivity,
  ExecutiveFilters,
  FunnelCounts,
  HomeTarget,
  OverdueReceivable,
} from './types'

/*
  MÓDULO 10 — a camada de dados dos três painéis.

  ESTE MÓDULO QUASE NÃO LISTA NADA. As listas vêm dos hooks que já estão no ar; o
  que é próprio daqui são as consultas de CONTAGEM e duas leituras recortadas.
  Reaproveitar a listagem não é economia de código, é o que faz o número do painel
  e o número da tela de origem serem a MESMA conta: quando "Em atraso" do painel
  Geral e "Em atraso" da tela de Recebíveis saem da mesma view, pela mesma função
  `is_financial_overdue`, não existe o dia em que os dois discordam.

  CARTÃO DE CONTAGEM NÃO SOMA LISTA. Toda listagem deste projeto tem teto de 500
  linhas, e somar a lista para produzir um número faz o cartão mostrar MENOS do
  que existe, em silêncio, no dia em que a tabela passa do teto — três meses de
  uso, no caso de `activities`. Os cartões que eram soma de lista viraram
  `select('id', { count: 'exact', head: true })` com o critério no WHERE: a
  contagem viaja no cabeçalho e nenhuma linha desce. Cada consulta abaixo diz qual
  função pura ela reproduz, e a correspondência entre as duas foi conferida linha
  a linha contra o banco antes de entrar.

  O QUE CONTINUA COM TETO, e está no relatório do módulo: tudo que é SOMA de
  valor (pipeline do funil, ganho e perdido do mês, financeiro do painel Geral) e
  tudo que é agregação POR PROJETO (o crachá "N atividades abertas" de cada linha
  da Evolução dos Projetos). Nenhum dos dois é contagem — o PostgREST não soma nem
  agrupa sem uma view ou função nova, e inventá-la aqui é decisão do usuário.

  PERMISSÃO. Nenhum recorte de visibilidade acontece aqui: quem decide o que cada
  pessoa lê é a RLS, que já está no ar — e ela vale igual para `count` e para
  `select`, então a contagem no banco não abre nada que a lista não abrisse. A
  consequência precisa estar dita em algum lugar, e é este: os painéis mostram
  NÚMEROS DIFERENTES PARA PESSOAS DIFERENTES. O caso concreto é `activities` — a
  única tabela do sistema com leitura estreita (migrations 0038 e 0059): quem não
  tem can_view nem can_edit no menu `activities`, e não é Diretor, lê só as
  próprias atividades e as de quem coordena, então os cartões "Em Andamento",
  "Concluídas" e "Atrasadas" do Painel Executivo são a carga DAQUELA PESSOA.

  QUEM AVISA É A TELA, e não este módulo: o Painel Executivo rotula os quatro
  cartões e o crachá por projeto conforme o escopo de quem olha (ver
  ACTIVITY_LABELS em DashboardExecutivo.tsx e `useActivityReadScope`). O número
  daqui é o mesmo para todo mundo; o que muda é a frase em cima dele.
*/

export const dashboardKeys = {
  all: ['dashboards'] as const,
  activities: () => [...dashboardKeys.all, 'activities'] as const,
  overdueReceivables: () => [...dashboardKeys.all, 'overdue-receivables'] as const,
  /*
    A DATA ENTRA NA CHAVE porque ela entra no WHERE. Sem isso, a aba deixada
    aberta na virada do dia continuaria mostrando a contagem de ontem em cache,
    enquanto as telas de origem — que recalculam "hoje" a cada render — já teriam
    virado. É o limite do WHERE, na granularidade em que ele muda: dia LOCAL para
    atividade, dia UTC para tarefa e negociação (ver os dois limites em list.ts).
  */
  activityCounts: (filters: ExecutiveFilters, day: string) =>
    [...dashboardKeys.all, 'activity-counts', filters, day] as const,
  projectsAtRisk: (bound: string) => [...dashboardKeys.all, 'projects-at-risk', bound] as const,
  funnelCounts: (bound: string) => [...dashboardKeys.all, 'funnel-counts', bound] as const,
}

const LIST_LIMIT = 500

/* ── As consultas de contagem ──────────────────────────────────────────── */

/*
  Uma contagem é `count: 'exact'` com `head: true`: o Postgres conta pelo índice,
  o número volta no cabeçalho `Content-Range` e nenhuma linha desce. Mesmo
  precedente de `useHasAnyReceivables` (financial/hooks.ts) e `useHasAnySuppliers`.

  Uma função por tabela, e não uma com o nome da tabela por parâmetro: o tipo das
  colunas aceitas em cada `eq`/`lt` vem do nome literal da tabela, e um parâmetro
  em união deixaria passar coluna que não existe naquela metade da união.
*/
const activityCountQuery = () =>
  supabase.from('activities').select('id', { count: 'exact', head: true })

const negotiationCountQuery = () =>
  supabase.from('negotiations').select('id', { count: 'exact', head: true })

/* O que os cartões mostram enquanto a contagem não chegou — os mesmos zeros que
   eles mostravam com a lista ainda vazia. */
const EMPTY_ACTIVITY_COUNTS: ActivityCounts = {
  inProgress: 0,
  completed: 0,
  overdue: 0,
  forecast: 0,
}

const EMPTY_FUNNEL_COUNTS: FunnelCounts = { activeCount: 0, atRiskCount: 0 }

async function countOf(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

/*
  O RECORTE DOS FILTROS DO TOPO, agora em WHERE — era `scopedActivities`
  (dashboards/list.ts), que peneirava a lista de 500 em memória:
  período pela data de CONCLUSÃO, depois projeto, depois colaborador.

  AS DUAS PONTAS DO PERÍODO SÃO AS MESMAS do Relatório de Produtividade, e não uma
  segunda escrita delas: `periodRange` é a função que `filterByPeriod` usa por
  dentro (activities/productivity.ts). "Concluídas nesta semana" no painel e no
  relatório são literalmente o mesmo intervalo, inclusive na borda do domingo.
  `isWithinInterval` inclui as duas pontas, por isso `gte`/`lte`.

  ATIVIDADE EXCLUÍDA ENTRA AQUI, e é do original: o filtro dele só olha
  `data_conclusao_real`. Consequência visível: o cartão "Concluídas" conta
  atividade que foi excluída depois, enquanto o crachá "N atividades abertas" de
  cada projeto, mais abaixo no mesmo painel, não conta. Por isso NÃO há
  `deleted_at is null` nestas duas consultas — e há nas outras duas. Reproduzido e
  registrado.
*/
function scopedActivityCount(filters: ExecutiveFilters, now: Date) {
  let query = activityCountQuery()

  const range = periodRange(filters.period, '', '', now)
  if (range) {
    query = query
      .gte('completed_at', range.start.toISOString())
      .lte('completed_at', range.end.toISOString())
  }

  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.collaboratorId) query = query.eq('collaborator_id', filters.collaboratorId)

  return query
}

/*
  Os quatro números do bloco "Visão Geral" do Painel Executivo, contados no banco.
  Substituem as quatro somas de lista que estavam em `activityMetrics`
  (dashboards/list.ts), que hoje só faz a divisão de "Produtividade".

  CADA WHERE E A LINHA QUE ELE REPRODUZ:

  1. "Em Andamento" — `alive.filter(status === 'in_progress')`. `alive` é
     `deleted_at == null`, o mesmo filtro que todas as telas de atividade aplicam.
  2. "Atrasadas" — `alive.filter(isOverdue)`, com `isOverdue` de
     activities/list.ts: `status !== 'completed'` e prazo antes de hoje. A
     comparação de lá é entre meia-noite LOCAL do prazo e meia-noite LOCAL de
     hoje, ou seja, comparação de datas puras — aqui é `end_date < hoje`, com o
     "hoje" de `todayLocalDate`. Nenhum fuso no meio, nos dois lados.
  3. "Concluídas" — `scoped.filter(status === 'completed' && completed_at != null)`.
     As duas condições continuam escritas apesar de o check
     `activities_completed_at_matches_status_check` (migration 0037) já as amarrar
     uma na outra: o critério é o da função, não o que o schema deixa passar.
  4. O denominador de "Produtividade" — `scoped.filter(!isAfter(start_date, now))`.
     `start_date` é coluna `date` lida como meia-noite local, e meia-noite de hoje
     nunca é depois de agora, então "não começa depois de agora" é
     `start_date <= hoje`. `start_date` é NOT NULL no schema, então o
     `a.prazo_inicio &&` do original continua sendo ramo morto.

  AS QUATRO NUMA CHAMADA SÓ, em paralelo: são quatro requisições sem corpo, e
  esperá-las em série faria o bloco piscar quatro vezes.

  DIFERENÇA EM RELAÇÃO AO QUE ESTAVA AQUI: mexer nos filtros do topo agora dispara
  consulta, e antes era recorte em memória sobre o cache. São duas contagens sem
  linha nenhuma no corpo — e é o preço de o número não depender de quais 500
  linhas desceram.
*/
export function useActivityCounts(filters: ExecutiveFilters) {
  const now = new Date()
  const today = todayLocalDate(now)

  return useQuery({
    queryKey: dashboardKeys.activityCounts(filters, today),
    queryFn: async (): Promise<ActivityCounts> => {
      const [inProgress, overdue, completed, forecast] = await Promise.all([
        countOf(activityCountQuery().is('deleted_at', null).eq('status', 'in_progress')),
        countOf(
          activityCountQuery()
            .is('deleted_at', null)
            .neq('status', 'completed')
            .lt('end_date', today),
        ),
        countOf(
          scopedActivityCount(filters, now)
            .eq('status', 'completed')
            .not('completed_at', 'is', null),
        ),
        countOf(scopedActivityCount(filters, now).lte('start_date', today)),
      ])

      return { inProgress, completed, overdue, forecast }
    },
  })
}

/*
  "Em Risco" do Painel Executivo: projeto ativo do fluxo com ALGUMA tarefa
  atrasada. Substitui `isProjectAtRisk` sobre a lista de tarefas, que baixava até
  500 tarefas COM O CHECKLIST INTEIRO junto (`useTasks`) para somar um inteiro.

  O CRITÉRIO, dos dois lados do join:

  - o projeto é o recorte de `activeFlowProjects` sobre `useProjects`:
    `visible_in_list` (o WHERE que a lista de Projetos já usa) menos concluído,
    menos suspenso, menos fase Finalizado.
  - a tarefa é `isTaskOverdue` (projects/list.ts), a régua do crachá vermelho do
    kanban: não concluída, com prazo, e prazo antes de agora — onde "antes de
    agora" é a leitura UTC do original. Ver `overdueUtcDateBound`.

  `!inner` É O "ALGUMA": o embed interno derruba o projeto que não tem nenhuma
  tarefa vencida, e o PostgREST devolve UMA linha por projeto (os filhos vêm
  aninhados), então o projeto com três tarefas vencidas conta uma vez. Conferido
  contra o caminho antigo com fixture de três tarefas vencidas no mesmo projeto.

  O nome da FK é obrigatório no embed: as FK deste módulo são compostas
  (`(project_id, tenant_id)`), como no resto do sistema.
*/
export function useAtRiskProjectCount() {
  const bound = overdueUtcDateBound()

  return useQuery({
    queryKey: dashboardKeys.projectsAtRisk(bound),
    queryFn: async (): Promise<number> =>
      countOf(
        supabase
          .from('projects')
          .select('id, tasks!tasks_project_id_fkey!inner(id)', { count: 'exact', head: true })
          .eq('visible_in_list', true)
          .not('status', 'in', '(completed,suspended)')
          .neq('current_phase', 'finished')
          .neq('tasks.status', 'completed')
          .not('tasks.due_date', 'is', null)
          .lte('tasks.due_date', bound),
      ),
  })
}

/*
  Os dois cartões de CONTAGEM do bloco 1 do painel comercial — "Negociações
  Ativas" e "Negociações em Risco". Saíam de `funnelMetrics` somando a lista.

  - ativas: `status === 'active'`, sem recorte de período, como no original (o
    seletor de mês do cabeçalho não alcança este bloco).
  - em risco: as ativas com previsão de fechamento vencida, régua de
    `isExpectedCloseOverdue` (pipeline/filters.ts) — a mesma do crachá do quadro,
    com a mesma leitura UTC da coluna `date`. Ver `overdueUtcDateBound`.

  Os dois cartões de VALOR do mesmo bloco NÃO estão aqui: soma não é contagem.
  Ver a ressalva inteira em `funnelMetrics`.
*/
export function useFunnelCounts() {
  const bound = overdueUtcDateBound()

  return useQuery({
    queryKey: dashboardKeys.funnelCounts(bound),
    queryFn: async (): Promise<FunnelCounts> => {
      const [activeCount, atRiskCount] = await Promise.all([
        countOf(negotiationCountQuery().eq('status', 'active')),
        countOf(
          negotiationCountQuery()
            .eq('status', 'active')
            .not('expected_close_date', 'is', null)
            .lte('expected_close_date', bound),
        ),
      ])

      return { activeCount, atRiskCount }
    },
  })
}

/* ── As duas leituras próprias deste módulo ────────────────────────────── */

/*
  As atividades como o bloco "Evolução dos Projetos" precisa delas — e por que
  `useActivities` não serve.

  UM CONSUMIDOR SÓ, DEPOIS QUE OS CARTÕES VIRARAM CONTAGEM: `progressMetrics`, que
  cruza as atividades por `project_id` para o crachá "N atividades abertas" de
  cada linha da lista de projetos. Os quatro cartões do topo saíam daqui e hoje
  saem de `useActivityCounts`.

  RECORTE ENXUTO DE COLUNAS, sem os quatro embeds de `useActivities`: nenhum
  bloco renderizado deste painel mostra nome de atividade, de responsável ou de
  projeto — só contagens, cruzadas por `project_id`. Trazer os embeds seria
  baixar quatro joins por linha, 500 linhas, para somar inteiros.

  ORDEM E TETO. `Atividade.list('-data_conclusao_real')` é como o original
  carrega. Aqui é o mesmo campo (`completed_at`), com o NULLS FIRST que o
  Postgres aplica por padrão em DESC — o que põe as atividades ABERTAS na frente.
  É deliberado: das três contagens por projeto, duas ("abertas" e "atrasadas")
  olham atividade em aberto, então se o teto cortar alguma coisa é melhor que
  corte atividade velha já concluída.

  ESTE É O TETO QUE SOBROU no painel executivo, e ele continua de pé: passadas
  500 atividades, os crachás por projeto contam menos do que existe. Agregação por
  projeto não é `count` com WHERE — precisa de `group by`, ou seja, de uma view
  nova, e isso é decisão do usuário. Está no relatório do módulo.

  DUAS SOBRAS DA MUDANÇA, também para o relatório: `deleted_at` continua vindo, e
  a consulta continua sem `deleted_at is null`, porque era o cartão "Concluídas"
  que precisava distinguir excluída de viva dentro da mesma consulta (o
  "Incluir todas atividades (excluídas ou não) para métricas" de
  DashboardExecutivo.jsx:96). O único consumidor que restou descarta as excluídas
  (`alive`, em `progressMetrics`). Estreitar a consulta não muda número nenhum em
  tela — por isso não foi feito de surpresa junto com a correção de contagem.
*/
const DASHBOARD_ACTIVITY_COLUMNS =
  'id, status, start_date, end_date, completed_at, deleted_at, project_id, collaborator_id, priority, total_minutes'

export function useDashboardActivities() {
  return useQuery({
    queryKey: dashboardKeys.activities(),
    queryFn: async (): Promise<DashboardActivity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select(DASHBOARD_ACTIVITY_COLUMNS)
        .order('completed_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return data ?? []
    },
  })
}

/*
  O bloco "Contas em Atraso" do painel Geral (Dashboard.jsx:185-189, 325-360).

  LÊ `is_overdue` DA VIEW, e é o mesmo `true` que o botão "Em atraso" da tela de
  Recebíveis usa como filtro — a regra vive em `public.is_financial_overdue`
  (migration 0043/0046) e não é reescrita aqui. No original ela é
  `status !== 'Pago' && new Date(due_date) < new Date()`, copiada em seis lugares.

  O ORIGINAL BAIXA A CARTEIRA INTEIRA para achar cinco linhas; aqui o recorte é
  WHERE, e o índice `accounts_receivable_tenant_id_due_date_idx` já existe.

  O TETO DE 5 É DO ORIGINAL, E CARREGA UM DEFEITO QUE FICA: lá a lista é cortada
  em 5 ANTES de o crachá do cabeçalho contar (`.slice(0, 5)` na linha 188,
  `.length` na 333), então o número ao lado de "Contas em Atraso" satura em 5 —
  com 40 parcelas vencidas ele mostra "5". Reproduzido; corrigir é uma segunda
  consulta com `head: true`, e é decisão do usuário.

  ORDEM: `created_at` decrescente, a mesma de `useReceivables`, para que as cinco
  linhas escolhidas sejam as mesmas que a tela de Recebíveis lista no topo.
*/
const OVERDUE_ALERT_LIMIT = 5

export function useOverdueReceivables() {
  return useQuery({
    queryKey: dashboardKeys.overdueReceivables(),
    queryFn: async (): Promise<OverdueReceivable[]> => {
      const { data, error } = await supabase
        .from('accounts_receivable_status')
        .select('id, due_date, value, client:clients!accounts_receivable_client_id_fkey(id, name)')
        .eq('is_overdue', true)
        .order('created_at', { ascending: false })
        .limit(OVERDUE_ALERT_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as OverdueReceivable[]
    },
  })
}

/* ── Estado agregado dos hooks compostos ───────────────────────────────── */

type QueryState = { isLoading: boolean; isError: boolean; error: unknown }

function combine(queries: QueryState[]) {
  return {
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    error: queries.find((query) => query.error)?.error ?? null,
  }
}

/* ── Painel 1: "Dashboard Geral" ───────────────────────────────────────── */

/*
  Um hook para o painel inteiro (Dashboard.jsx).

  DE ONDE VEM CADA NÚMERO:
  - financeiro → `useReceivables`/`usePayables` no mês escolhido, somados por
    `summarizeFinancial` — a MESMA função dos cartões das duas telas do módulo 7.
  - contas em atraso → `useOverdueReceivables`, que lê `is_overdue` da view.
  - contratos fechados → `useContracts`, a mesma lista da tela de Contratos.
  - projetos por etapa → `useProjects`, que já é o recorte "visível no fluxo"
    (`visible_in_list`), idêntico ao `getFlowProjects` do original.
  - próximas entregas → `useTasks`, TODAS as tarefas e não só as do fluxo, como
    no original (Dashboard.jsx:89-99 chama `Task.list()` sem filtro, ao contrário
    do painel executivo).

  DOIS ESTADOS DE CARREGAMENTO, e não um. `isLoadingFinancial` é o que o original
  usa para decidir entre os quatro esqueletos e os quatro cartões
  (Dashboard.jsx:101) — os outros blocos ele desenha na hora, com zero enquanto o
  dado não chegou. `isLoading` cobre o painel inteiro. Quem monta a tela escolhe;
  os dois estão aqui para que reproduzir o original não exija inventar nada.

  A CONSULTA DE CLIENTES DO ORIGINAL NÃO FOI PORTADA: `Dashboard.jsx:65-75`
  baixa `Client.list()` e nenhuma linha do arquivo usa o resultado.
*/
export function useOverviewDashboard(period: MonthYear) {
  const receivablesQuery = useReceivables({ period, status: 'all' })
  const payablesQuery = usePayables({
    period,
    status: 'all',
    category: 'all',
    recurringOnly: false,
  })
  const overdueQuery = useOverdueReceivables()
  const contractsQuery = useContracts()
  const projectsQuery = useProjects()
  const tasksQuery = useTasks()

  const receivables = useMemo(() => receivablesQuery.data ?? [], [receivablesQuery.data])
  const payables = useMemo(() => payablesQuery.data ?? [], [payablesQuery.data])
  const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data])
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  const financial = useMemo(() => overviewFinancial(receivables, payables), [receivables, payables])
  const contractsClosed = useMemo(
    () => closedContractsIn(contracts, period),
    [contracts, period],
  )
  const projectStages = useMemo(() => countProjectStages(projects), [projects])
  const deliveries = useMemo(() => upcomingDeliveries(tasks), [tasks])

  return {
    financial,
    overdueReceivables: overdueQuery.data ?? [],
    contractsClosed,
    projectStages,
    upcomingDeliveries: deliveries,
    isLoadingFinancial: receivablesQuery.isLoading || payablesQuery.isLoading,
    ...combine([
      receivablesQuery,
      payablesQuery,
      overdueQuery,
      contractsQuery,
      projectsQuery,
      tasksQuery,
    ]),
  }
}

/* ── Painel 2: "Painel Executivo" ──────────────────────────────────────── */

/*
  Um hook para o painel inteiro (DashboardExecutivo.jsx).

  QUATRO CONSULTAS DO ORIGINAL NÃO FORAM PORTADAS, e a ausência é a decisão:
  recebíveis, pagamentos, negociações e contratos são baixados lá (linhas 57-75)
  e NENHUM dos quatro é usado em cálculo ou em tela. O único efeito que tinham
  era segurar o esqueleto de carregamento até as quatro chegarem. Portá-las
  significaria baixar quatro listas inteiras para atrasar a renderização.

  OS FILTROS DO TOPO DISPARAM AS DUAS CONTAGENS que dependem deles ("Concluídas" e
  o denominador de "Produtividade") e mais nada: o resto do painel continua sendo
  recorte em memória sobre o cache, como no original. Duas requisições sem corpo
  por mudança de filtro é o preço de o cartão não depender de quais 500 linhas
  desceram — ver `useActivityCounts`.

  `useProjects` já traz o recorte "visível no fluxo"; `activeFlowProjects` aplica
  a segunda metade de `getActiveFlowProjects`. `useTasks` traz todas as tarefas e
  `flowTasks` as reduz às dos projetos visíveis — que é o que
  `getFlowTasks` faz no original.

  `useTasks` CONTINUA SENDO CARREGADO, mesmo com "Em Risco" contado no banco: o
  mapa de responsáveis do card (`projectResponsibleMap`) sai das tarefas do fluxo,
  e três blocos do painel dependem dele. O que deixou de existir é a soma da lista
  para produzir um cartão.
*/
export function useExecutiveDashboard(filters: ExecutiveFilters) {
  const projectsQuery = useProjects()
  const tasksQuery = useTasks()
  const progressQuery = useProjectProgress()
  const collaboratorsQuery = useCollaborators()
  const activitiesQuery = useDashboardActivities()
  const activityCountsQuery = useActivityCounts(filters)
  const atRiskQuery = useAtRiskProjectCount()

  const allProjects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const collaborators = useMemo(() => collaboratorsQuery.data ?? [], [collaboratorsQuery.data])
  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data])
  const progressByProject = useMemo(
    () => progressQuery.data ?? new Map(),
    [progressQuery.data],
  )

  const projects = useMemo(() => activeFlowProjects(allProjects), [allProjects])
  /* O mapa de responsáveis sai das tarefas do FLUXO, e é usado por três blocos —
     capacidade do time, drill-down e evolução. Calculado uma vez. */
  const tasks = useMemo(() => flowTasks(allTasks, allProjects), [allTasks, allProjects])
  const responsibleByProject = useMemo(() => projectResponsibleMap(tasks), [tasks])

  /* Zerado enquanto a contagem não chega, que é o que o painel mostrava com a
     lista ainda vazia. */
  const activity = useMemo(
    () => activityMetrics(activityCountsQuery.data ?? EMPTY_ACTIVITY_COUNTS),
    [activityCountsQuery.data],
  )
  const operational = useMemo(
    () => operationalMetrics(projects, progressByProject, atRiskQuery.data ?? 0),
    [projects, progressByProject, atRiskQuery.data],
  )
  const team = useMemo(
    () => teamMetrics(collaborators, projects, responsibleByProject, filters),
    [collaborators, projects, responsibleByProject, filters],
  )
  const progress = useMemo(
    () => progressMetrics(projects, progressByProject, responsibleByProject, activities),
    [projects, progressByProject, responsibleByProject, activities],
  )

  return {
    /* Os projetos ativos e as tarefas do fluxo saem crus também: os quatro
       cartões do bloco 2 abrem drill-down com o subconjunto que cada um conta. */
    projects,
    tasks,
    progressByProject,
    responsibleByProject,
    collaborators,
    activity,
    operational,
    team,
    progress,
    ...combine([
      projectsQuery,
      tasksQuery,
      progressQuery,
      collaboratorsQuery,
      activitiesQuery,
      activityCountsQuery,
      atRiskQuery,
    ]),
  }
}

/* ── Painel 3: "Dashboard Comercial" ───────────────────────────────────── */

/*
  Um hook para o painel inteiro (DashboardComercial.jsx).

  UMA LISTA E DUAS CONTAGENS. O original também baixa `Contract.list()` (linha 49)
  e não usa o resultado em lugar nenhum — só no `isLoading`. Não foi portada.

  `useNegotiations` é o MESMO hook da tela de Negociações: o funil que o painel
  soma é o funil que o quadro desenha, sem uma segunda leitura que possa
  divergir. A lista continua sendo necessária pelos sete drill-downs e por tudo
  que é SOMA de valor; o que saiu dela foram os dois cartões de contagem do bloco
  1 — ver `useFunnelCounts` e a ressalva em `funnelMetrics`.

  ATENÇÃO PARA QUEM MONTAR A TELA: só os blocos 2 e 2B respeitam o seletor de
  mês/ano do cabeçalho. Funil, gráficos por etapa e velocidade somam o funil
  inteiro, de qualquer época — é o comportamento do original, e o microcopy dele
  ("Em andamento", "Pipeline total", "Dias (entrada → fechamento)") é o que
  separa um bloco do outro.
*/
export function useCommercialDashboard(period: MonthYear) {
  const negotiationsQuery = useNegotiations()
  const funnelCountsQuery = useFunnelCounts()

  const negotiations = useMemo(() => negotiationsQuery.data ?? [], [negotiationsQuery.data])

  const funnel = useMemo(
    () => funnelMetrics(negotiations, funnelCountsQuery.data ?? EMPTY_FUNNEL_COUNTS),
    [negotiations, funnelCountsQuery.data],
  )
  const closing = useMemo(() => closingMetrics(negotiations, period), [negotiations, period])
  const stages = useMemo(() => funnelStageTotals(negotiations), [negotiations])
  const velocity = useMemo(() => velocityMetrics(negotiations), [negotiations])

  return {
    /* Cru, porque os drill-downs recortam sobre ele — ver `commercialDrilldown`. */
    negotiations,
    funnel,
    closing,
    stages,
    velocity,
    ...combine([negotiationsQuery, funnelCountsQuery]),
  }
}

/* ── Roteamento de entrada (Home.jsx) ──────────────────────────────────── */

/*
  Para onde a rota de entrada manda quem acabou de logar.

  O ORIGINAL BAIXA A LISTA INTEIRA DE COLABORADORES para achar um por e-mail
  (`Collaborator.list()` seguido de `.find(c => c.email === user.email)`,
  Home.jsx:17-18). Aqui é `useCurrentCollaborator`, que já está em cache desde o
  AppLayout, busca por `user_id` e não por texto de e-mail — o mesmo padrão que o
  módulo 3 removeu do formulário público e o módulo 8 do botão de link.

  A regra em si está em `homeTargetFor` (list.ts), que compõe a escolha por ÁREA
  do Home com o redirecionamento por FUNÇÃO de `redirectTargetFor`, em vez de
  reescrever qualquer um dos dois.

  QUEM NÃO TEM COLABORADOR ATIVO NÃO É PROBLEMA DAQUI: o AppLayout já trata
  sessão sem cadastro, cadastro pendente e colaborador afastado. Este hook devolve
  o destino de quem tem cadastro; enquanto o cadastro não chegou, `isLoading`.
*/
export function useHomeDashboardTarget(): {
  target: HomeTarget
  isLoading: boolean
  isError: boolean
} {
  const collaboratorQuery = useCurrentCollaborator()
  const collaborator = collaboratorQuery.data ?? null

  const target = useMemo(
    () => homeTargetFor(collaborator?.role, collaborator?.area),
    [collaborator?.role, collaborator?.area],
  )

  return {
    target,
    isLoading: collaboratorQuery.isLoading,
    isError: Boolean(collaboratorQuery.error),
  }
}
