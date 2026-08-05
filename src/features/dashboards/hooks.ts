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
  scopeProjects,
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
  overdueReceivablesCount: () => [...dashboardKeys.all, 'overdue-receivables-count'] as const,
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
  forecastCompleted: 0,
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
  ATIVIDADE EXCLUÍDA NÃO CONTA EM LUGAR NENHUM, e isto é correção.

  No original a mesma consulta valia com dois critérios: o filtro dos cartões só
  olha `data_conclusao_real` e deixa a excluída passar ("Incluir todas atividades
  (excluídas ou não) para métricas", DashboardExecutivo.jsx:96), enquanto o
  crachá "N atividades abertas" de cada projeto, mais abaixo NA MESMA TELA,
  descarta as excluídas. Efeito: excluir uma atividade concluída não mudava o
  cartão "Concluídas" e mudava o crachá do projeto dela — o painel discordava de
  si mesmo, e "excluída" é a única coisa que a exclusão deveria significar.

  Agora `deleted_at is null` entra em TODAS as consultas de atividade deste
  módulo, inclusive na listagem de `useDashboardActivities`.
*/
const aliveActivityCountQuery = () => activityCountQuery().is('deleted_at', null)

/*
  O RECORTE DE PROJETO E COLABORADOR da barra do topo, em WHERE — era
  `scopedActivities` (dashboards/list.ts), que peneirava a lista de 500 em
  memória.

  VALE PARA OS QUATRO CARTÕES, e no original valia para dois. "Em Andamento" e
  "Atrasadas" contavam o escritório inteiro com os três seletores logo acima
  deles; filtrar por um projeto e ver o número não se mexer é engano. O PERÍODO
  continua entrando só onde tem significado — ver `activityMetrics`.
*/
function scopedActivityCount(filters: ExecutiveFilters) {
  let query = aliveActivityCountQuery()

  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.collaboratorId) query = query.eq('collaborator_id', filters.collaboratorId)

  return query
}

/*
  O PERÍODO PELA DATA DE CONCLUSÃO — o recorte do cartão "Concluídas".

  AS DUAS PONTAS SÃO AS MESMAS do Relatório de Produtividade, e não uma segunda
  escrita delas: `periodRange` é a função que `filterByPeriod` usa por dentro
  (activities/productivity.ts). "Concluídas nesta semana" no painel e no relatório
  são literalmente o mesmo intervalo, inclusive na borda do domingo.
  `isWithinInterval` inclui as duas pontas, por isso `gte`/`lte`.
*/
function completedInPeriod(filters: ExecutiveFilters, now: Date) {
  const query = scopedActivityCount(filters)
  const range = periodRange(filters.period, '', '', now)
  if (!range) return query

  return query
    .gte('completed_at', range.start.toISOString())
    .lte('completed_at', range.end.toISOString())
}

/*
  O PERÍODO PELO PRAZO — o conjunto "previstas para o período", que é o
  denominador de "Produtividade" (ver `activityMetrics`).

  `end_date` é coluna `date`, e as duas pontas de `periodRange` são início e fim
  de dia LOCAL: comparar as datas puras é a mesma pergunta, sem fuso no meio —
  mesmo raciocínio de `todayLocalDate`.
*/
function dueInPeriod(filters: ExecutiveFilters, now: Date) {
  const query = scopedActivityCount(filters)
  const range = periodRange(filters.period, '', '', now)
  if (!range) return query

  return query
    .gte('end_date', todayLocalDate(range.start))
    .lte('end_date', todayLocalDate(range.end))
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
  4 e 5. As duas pontas de "Produtividade": as PREVISTAS do período (prazo dentro
     dele, concluída ou não) e a parte delas que foi concluída. No original o
     denominador era o recorte por data de CONCLUSÃO mais `prazo_inicio <= hoje`,
     o que o deixava praticamente igual ao numerador — ver `activityMetrics`.

  AS CINCO NUMA CHAMADA SÓ, em paralelo: são cinco requisições sem corpo, e
  esperá-las em série faria o bloco piscar cinco vezes.

  DIFERENÇA EM RELAÇÃO AO ORIGINAL: mexer nos filtros do topo dispara consulta, e
  lá era recorte em memória sobre o cache. São contagens sem linha nenhuma no
  corpo — e é o preço de o número não depender de quais 500 linhas desceram.
*/
export function useActivityCounts(filters: ExecutiveFilters) {
  const now = new Date()
  const today = todayLocalDate(now)

  return useQuery({
    queryKey: dashboardKeys.activityCounts(filters, today),
    queryFn: async (): Promise<ActivityCounts> => {
      const [inProgress, overdue, completed, forecast, forecastCompleted] = await Promise.all([
        countOf(scopedActivityCount(filters).eq('status', 'in_progress')),
        countOf(scopedActivityCount(filters).neq('status', 'completed').lt('end_date', today)),
        countOf(
          completedInPeriod(filters, now).eq('status', 'completed').not('completed_at', 'is', null),
        ),
        countOf(dueInPeriod(filters, now)),
        countOf(dueInPeriod(filters, now).eq('status', 'completed')),
      ])

      return { inProgress, completed, overdue, forecast, forecastCompleted }
    },
  })
}

/*
  "Em Risco" do Painel Executivo: projeto ativo do fluxo com ALGUMA tarefa
  atrasada. Substitui `isProjectAtRisk` sobre a lista de tarefas, que baixava até
  500 tarefas COM O CHECKLIST INTEIRO junto (`useTasks`) para somar um inteiro.

  DEVOLVE O CONJUNTO DE IDS, e não a contagem — mudou junto com o cartão passar a
  respeitar os filtros do topo. Duas razões:

  - o filtro de colaborador é o responsável no Fluxo, que é cruzamento de tela
    (`projectResponsibleMap`); o banco não tem como aplicá-lo num `count`.
  - com contagem no banco e gaveta peneirada sobre as 500 tarefas baixadas, o
    cartão e a gaveta podiam mostrar quantidades diferentes. Com o conjunto, os
    dois saem da mesma resposta.

  O corpo continua sendo só ids — uma linha por projeto em risco, sem tarefa
  nenhuma descendo além do que o `!inner` exige.

  O CRITÉRIO, dos dois lados do join:

  - o projeto é o recorte de `activeFlowProjects` sobre `useProjects`:
    `visible_in_list` (o WHERE que a lista de Projetos já usa) menos concluído,
    menos suspenso, menos fase Finalizado.
  - a tarefa é `isTaskOverdue` (projects/list.ts), a régua do crachá vermelho do
    kanban: não concluída, com prazo, e prazo antes de agora — onde "antes de
    agora" é a leitura UTC do original. Ver `overdueUtcDateBound`.

  `!inner` É O "ALGUMA": o embed interno derruba o projeto que não tem nenhuma
  tarefa vencida, e o PostgREST devolve UMA linha por projeto (os filhos vêm
  aninhados), então o projeto com três tarefas vencidas aparece uma vez.

  O nome da FK é obrigatório no embed: as FK deste módulo são compostas
  (`(project_id, tenant_id)`), como no resto do sistema.
*/
export function useAtRiskProjectIds() {
  const bound = overdueUtcDateBound()

  return useQuery({
    queryKey: dashboardKeys.projectsAtRisk(bound),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, tasks!tasks_project_id_fkey!inner(id)')
        .eq('visible_in_list', true)
        .not('status', 'in', '(completed,suspended)')
        .neq('current_phase', 'finished')
        .neq('tasks.status', 'completed')
        .not('tasks.due_date', 'is', null)
        .lte('tasks.due_date', bound)
        .limit(LIST_LIMIT)

      if (error) throw error
      return new Set((data ?? []).map((row) => row.id))
    },
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

  A EXCLUÍDA NÃO DESCE MAIS: a consulta ganhou `deleted_at is null`, o mesmo
  critério que agora vale nas contagens (ver `aliveActivityCountQuery`). Ela vinha
  porque o cartão "Concluídas" do original precisava distinguir excluída de viva
  dentro da mesma consulta ("Incluir todas atividades (excluídas ou não) para
  métricas", DashboardExecutivo.jsx:96); esse critério deixou de existir no
  módulo. O único consumidor restante já descartava as excluídas em memória
  (`alive`, em `progressMetrics`), então nenhum número muda — o que muda é a
  excluída deixar de ocupar lugar dentro do teto de 500 linhas.
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
        .is('deleted_at', null)
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

  O TETO DE 5 É DO ORIGINAL E FICA — é o tamanho do bloco de alerta, não uma
  medida. O que NÃO fica é o crachá do cabeçalho sair do tamanho dessa lista: lá
  ela é cortada em 5 (`.slice(0, 5)`, linha 188) ANTES de `.length` medir (linha
  333), então "Contas em Atraso" mostrava 5 com 40 parcelas vencidas — um alerta
  que esconde o tamanho do problema que está alertando. A contagem real vem de
  `useOverdueReceivablesCount`, logo abaixo.

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

/*
  QUANTAS PARCELAS ESTÃO VENCIDAS DE VERDADE — o número do crachá "Contas em
  Atraso", que no original é o tamanho da lista cortada em 5.

  Mesmo WHERE da consulta de cima, `is_overdue` da view, com `head: true`: a
  contagem viaja no cabeçalho e nenhuma linha desce. Mesmo padrão de
  `useActivityCounts`. A lista continua com cinco linhas (e a tela mostra três,
  como no original); o que mudou é o número ao lado dela ser o real.
*/
export function useOverdueReceivablesCount() {
  return useQuery({
    queryKey: dashboardKeys.overdueReceivablesCount(),
    queryFn: async (): Promise<number> =>
      countOf(
        supabase
          .from('accounts_receivable_status')
          .select('id', { count: 'exact', head: true })
          .eq('is_overdue', true),
      ),
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
  const overdueCountQuery = useOverdueReceivablesCount()
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
    /* O crachá do bloco de alerta conta o que existe, não o que coube na lista
       de cinco — ver `useOverdueReceivablesCount`. */
    overdueReceivablesCount: overdueCountQuery.data ?? 0,
    contractsClosed,
    projectStages,
    upcomingDeliveries: deliveries.items,
    /* Mesma separação das contas em atraso: a lista tem teto de 10, o crachá
       mostra o total — ver `upcomingDeliveries`. */
    upcomingDeliveriesCount: deliveries.total,
    isLoadingFinancial: receivablesQuery.isLoading || payablesQuery.isLoading,
    ...combine([
      receivablesQuery,
      payablesQuery,
      overdueQuery,
      overdueCountQuery,
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

  OS FILTROS DO TOPO ALCANÇAM O PAINEL INTEIRO, e no original alcançavam dois
  cartões e um bloco. As contagens de atividade que dependem deles são feitas no
  banco (ver `useActivityCounts`); o recorte de PROJETO é `scopeProjects`,
  aplicado uma vez e usado por todos os blocos de projeto — no original ele
  existia só dentro de "Capacidade do Time", e por isso "Total Ativo" e "Projetos
  Ativos" discordavam na mesma tela.

  `useProjects` já traz o recorte "visível no fluxo"; `activeFlowProjects` aplica
  a segunda metade de `getActiveFlowProjects`. `useTasks` traz todas as tarefas e
  `flowTasks` as reduz às dos projetos visíveis — que é o que
  `getFlowTasks` faz no original.

  `useTasks` CONTINUA SENDO CARREGADO, mesmo com "Em Risco" vindo do banco: o
  mapa de responsáveis do Fluxo (`projectResponsibleMap`) usa as tarefas quando o
  projeto não tem responsável operacional na coluna, e três blocos do painel
  dependem dele. O que deixou de existir é a soma da lista para produzir um
  cartão.

  `allProjects` SAI CRU para o seletor de projetos da barra de filtros: filtrar
  por um projeto não pode esvaziar a lista de opções do próprio filtro.
*/
export function useExecutiveDashboard(filters: ExecutiveFilters) {
  const projectsQuery = useProjects()
  const tasksQuery = useTasks()
  const progressQuery = useProjectProgress()
  const collaboratorsQuery = useCollaborators()
  const activitiesQuery = useDashboardActivities()
  const activityCountsQuery = useActivityCounts(filters)
  const atRiskQuery = useAtRiskProjectIds()

  const allProjects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const collaborators = useMemo(() => collaboratorsQuery.data ?? [], [collaboratorsQuery.data])
  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data])
  const progressByProject = useMemo(
    () => progressQuery.data ?? new Map(),
    [progressQuery.data],
  )
  const atRiskIds = useMemo(() => atRiskQuery.data ?? new Set<string>(), [atRiskQuery.data])

  const activeProjects = useMemo(() => activeFlowProjects(allProjects), [allProjects])
  /* O mapa de responsáveis cruza a coluna do projeto com as tarefas do FLUXO, e
     é usado por três blocos — capacidade do time, drill-down e evolução.
     Calculado uma vez. */
  const tasks = useMemo(() => flowTasks(allTasks, allProjects), [allTasks, allProjects])
  const responsibleByProject = useMemo(
    () => projectResponsibleMap(tasks, allProjects),
    [tasks, allProjects],
  )

  /* O recorte da barra de filtros, uma vez, para todos os blocos de projeto. */
  const projects = useMemo(
    () => scopeProjects(activeProjects, responsibleByProject, filters),
    [activeProjects, responsibleByProject, filters],
  )

  /* Zerado enquanto a contagem não chega, que é o que o painel mostrava com a
     lista ainda vazia. */
  const activity = useMemo(
    () => activityMetrics(activityCountsQuery.data ?? EMPTY_ACTIVITY_COUNTS),
    [activityCountsQuery.data],
  )
  const operational = useMemo(
    () => operationalMetrics(projects, progressByProject, atRiskIds),
    [projects, progressByProject, atRiskIds],
  )
  const team = useMemo(
    () => teamMetrics(collaborators, projects, responsibleByProject),
    [collaborators, projects, responsibleByProject],
  )
  const progress = useMemo(
    () => progressMetrics(projects, progressByProject, responsibleByProject, activities),
    [projects, progressByProject, responsibleByProject, activities],
  )

  return {
    /* Os projetos do recorte saem crus também: os quatro cartões do bloco 2
       abrem drill-down com o subconjunto que cada um conta. */
    projects,
    allProjects: activeProjects,
    atRiskIds,
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

  O QUE O SELETOR DE MÊS/ANO ALCANÇA, depois da correção: os blocos 2 e 2B (o que
  ganhou e o que perdeu) e o "Tempo Médio de Fechamento" do bloco 5 — tudo que é
  FECHAMENTO, que é o que tem data. O que ele não alcança são o bloco 1, os dois
  gráficos por etapa e a lista de paradas: os três olham negociação ATIVA, que é
  fotografia de agora e não tem mês. A tela diz isso onde o original deixava o
  seletor parecer global — ver DashboardComercial.tsx.
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
  const velocity = useMemo(() => velocityMetrics(negotiations, period), [negotiations, period])

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
