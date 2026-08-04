import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentCollaborator } from '@/features/auth/hooks'
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
  overviewFinancial,
  progressMetrics,
  projectResponsibleMap,
  teamMetrics,
  upcomingDeliveries,
  velocityMetrics,
} from './list'
import type { DashboardActivity, ExecutiveFilters, HomeTarget, OverdueReceivable } from './types'

/*
  MÓDULO 10 — a camada de dados dos três painéis.

  ESTE MÓDULO QUASE NÃO CONSULTA NADA. Dois hooks aqui falam com o Supabase; o
  resto compõe os hooks de listagem que já estão no ar. Isso não é economia de
  código, é o que faz o número do painel e o número da tela de origem serem a
  MESMA conta: quando "Em atraso" do painel Geral e "Em atraso" da tela de
  Recebíveis saem da mesma view, pela mesma função `is_financial_overdue`, não
  existe o dia em que os dois discordam.

  O que se herda junto: o teto de 500 linhas de cada listagem. Ver o relatório do
  módulo — é o limite conhecido destes painéis.

  PERMISSÃO. Nenhum recorte de visibilidade acontece aqui: quem decide o que cada
  pessoa lê é a RLS, que já está no ar. A consequência precisa estar dita em
  algum lugar, e é este: os painéis mostram NÚMEROS DIFERENTES PARA PESSOAS
  DIFERENTES, sem nada na tela avisando. O caso concreto é `activities` — a única
  tabela do sistema com leitura estreita (migration 0038): quem não tem
  `can_edit_menu('activities')` e não é Diretor lê só as próprias atividades e as
  de quem coordena, então os cartões "Em Andamento", "Concluídas" e "Atrasadas"
  do Painel Executivo são a carga DAQUELA PESSOA, com o mesmo rótulo que a
  diretoria lê como sendo a do escritório inteiro. Está no relatório do módulo.
*/

export const dashboardKeys = {
  all: ['dashboards'] as const,
  activities: () => [...dashboardKeys.all, 'activities'] as const,
  overdueReceivables: () => [...dashboardKeys.all, 'overdue-receivables'] as const,
}

const LIST_LIMIT = 500

/* ── As duas consultas próprias deste módulo ───────────────────────────── */

/*
  As atividades como o PAINEL EXECUTIVO precisa delas — e por que `useActivities`
  não serve.

  `useActivities` filtra `deleted_at is null`, como todas as telas de atividade.
  Este painel precisa do contrário: o original carrega tudo com o comentário
  "Incluir todas atividades (excluídas ou não) para métricas"
  (DashboardExecutivo.jsx:96) e depois decide bloco a bloco. O cartão
  "Concluídas" conta a excluída; os crachás por projeto, não. Filtrar na consulta
  tornaria impossível reproduzir o primeiro.

  RECORTE ENXUTO DE COLUNAS, sem os quatro embeds de `useActivities`: nenhum
  bloco renderizado deste painel mostra nome de atividade, de responsável ou de
  projeto — só contagens, cruzadas por `project_id`. Trazer os embeds seria
  baixar quatro joins por linha, 500 linhas, para somar inteiros.

  ORDEM E TETO. `Atividade.list('-data_conclusao_real')` é como o original
  carrega. Aqui é o mesmo campo (`completed_at`), com o NULLS FIRST que o
  Postgres aplica por padrão em DESC — o que põe as atividades ABERTAS na frente.
  É deliberado: se o teto de 500 cortar alguma coisa, é melhor que corte
  atividade velha já concluída do que atividade em aberto, que é o que os
  cartões "Em Andamento" e "Atrasadas" contam.
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

  Os filtros do topo NÃO disparam consulta nova — são recorte em memória sobre o
  que já está em cache, como no original. Por isso são argumento do hook e não
  parte da chave.

  `useProjects` já traz o recorte "visível no fluxo"; `activeFlowProjects` aplica
  a segunda metade de `getActiveFlowProjects`. `useTasks` traz todas as tarefas e
  `flowTasks` as reduz às dos projetos visíveis — que é o que
  `getFlowTasks` faz no original.
*/
export function useExecutiveDashboard(filters: ExecutiveFilters) {
  const projectsQuery = useProjects()
  const tasksQuery = useTasks()
  const progressQuery = useProjectProgress()
  const collaboratorsQuery = useCollaborators()
  const activitiesQuery = useDashboardActivities()

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

  const activity = useMemo(
    () => activityMetrics(activities, filters),
    [activities, filters],
  )
  const operational = useMemo(
    () => operationalMetrics(projects, tasks, progressByProject),
    [projects, tasks, progressByProject],
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
    ]),
  }
}

/* ── Painel 3: "Dashboard Comercial" ───────────────────────────────────── */

/*
  Um hook para o painel inteiro (DashboardComercial.jsx).

  UMA CONSULTA SÓ. O original também baixa `Contract.list()` (linha 49) e não usa
  o resultado em lugar nenhum — só no `isLoading`. Não foi portada.

  `useNegotiations` é o MESMO hook da tela de Negociações: o funil que o painel
  soma é o funil que o quadro desenha, sem uma segunda leitura que possa
  divergir.

  ATENÇÃO PARA QUEM MONTAR A TELA: só os blocos 2 e 2B respeitam o seletor de
  mês/ano do cabeçalho. Funil, gráficos por etapa e velocidade somam o funil
  inteiro, de qualquer época — é o comportamento do original, e o microcopy dele
  ("Em andamento", "Pipeline total", "Dias (entrada → fechamento)") é o que
  separa um bloco do outro.
*/
export function useCommercialDashboard(period: MonthYear) {
  const negotiationsQuery = useNegotiations()

  const negotiations = useMemo(() => negotiationsQuery.data ?? [], [negotiationsQuery.data])

  const funnel = useMemo(() => funnelMetrics(negotiations), [negotiations])
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
    ...combine([negotiationsQuery]),
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
