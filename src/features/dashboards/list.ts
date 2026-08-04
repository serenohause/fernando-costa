import { differenceInDays, format, parseISO } from 'date-fns'
import {
  FUNNEL_STAGE,
  PROJECT_PHASE,
  type CollaboratorArea,
  type CollaboratorRole,
  type FunnelStage,
  type ProjectPhase,
} from '@/lib/enums'
import { redirectTargetFor } from '@/features/auth/access'
import { isOverdue as isActivityOverdue } from '@/features/activities/list'
import { monthRange, summarizeFinancial } from '@/features/financial/hooks'
import type { MonthYear, PayableRow, ReceivableRow } from '@/features/financial/types'
import { isExpectedCloseOverdue } from '@/features/pipeline/filters'
import type { NegotiationRow } from '@/features/pipeline/types'
import type { ProjectProgress, ProjectRow, TaskRow } from '@/features/projects/types'
import type { Collaborator } from '@/features/team/types'
import type { ContractRow } from '@/features/contracts/types'
import type {
  ActivityCounts,
  ActivityMetrics,
  ClosedContracts,
  ClosingMetrics,
  CollaboratorLoad,
  CommercialDrilldown,
  DashboardActivity,
  ExecutiveFilters,
  FunnelCounts,
  FunnelMetrics,
  FunnelStageTotals,
  HomeTarget,
  OperationalMetrics,
  OverviewFinancial,
  ProgressMetrics,
  ProjectProgressRow,
  ProjectResponsible,
  ProjectStageCount,
  StalledNegotiation,
  TeamMetrics,
  UpcomingDelivery,
  VelocityMetrics,
} from './types'

/*
  As contas dos três painéis, fora do componente e fora do hook: elas não tocam
  no Supabase, e é isso que permite testá-las e reusá-las entre painéis (o mesmo
  `projectResponsibleMap` alimenta três blocos do Painel Executivo).

  Mesmo precedente de suppliers/list.ts, activities/list.ts e projects/list.ts.
*/

/* ═══ Os dois limites de data que viram WHERE ════════════════════════════ */

/*
  Cartão de contagem é `count` no banco (ver hooks.ts), e toda regra de "atrasado"
  compara com hoje. Traduzir "hoje" para um WHERE exige escrever qual das DUAS
  definições de hoje o sistema está usando naquela regra — e este projeto tem as
  duas, de propósito.

  Elas ficam aqui, e não soltas na consulta, porque cada uma corresponde a uma
  função pura que continua existindo e continua sendo a régua da tela de origem.
  Se algum dia as duas virarem uma só, é aqui e nas funções puras que a mudança
  acontece junto — não em seis `WHERE` espalhados.
*/

/*
  A data de hoje NO FUSO DO NAVEGADOR.

  É a régua de `isOverdue` (activities/list.ts), a versão CORRIGIDA:
  `isBefore(parseISO(end_date), startOfDay(now))` compara meia-noite local do
  prazo com meia-noite local de hoje, ou seja, comparação de datas puras, sem
  fuso no meio. `end_date < todayLocalDate(now)` é literalmente a mesma pergunta.
*/
export function todayLocalDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

/*
  A data de hoje COMO O ORIGINAL A LÊ, e ela vale um dia a menos por três horas
  todo dia em Goiânia.

  É a régua de `isTaskOverdue` (projects/list.ts) e de `isExpectedCloseOverdue`
  (pipeline/filters.ts): `new Date(coluna_date) < now` lê "2026-08-04" como
  meia-noite EM UTC, então a partir das 21h locais do dia anterior o prazo de
  hoje já conta como vencido. As duas telas do pipeline e o kanban de tarefas
  estão NO AR com esse comportamento; corrigi-lo aqui faria o painel discordar
  deles, e não é decisão deste módulo.

  `meia-noite_utc(d) < now` equivale a `d <= dia UTC de (now - 1ms)`, inclusive
  no instante exato da meia-noite UTC — que é o único ponto em que o `<=` ingênuo
  sobre o dia UTC de `now` erraria por uma linha.
*/
export function overdueUtcDateBound(now: Date = new Date()): string {
  return new Date(now.getTime() - 1).toISOString().slice(0, 10)
}

/* ═══ Roteamento de entrada (Home.jsx) ═══════════════════════════════════ */

/*
  QUAL PAINEL CADA PESSOA VÊ — e por que isto é UMA função e não duas.

  O original decide isso em DOIS lugares, com DOIS critérios diferentes, e eles
  não se conhecem:

  1. `Home.jsx` (a rota de entrada) escolhe por ÁREA do colaborador:
     Comercial → Comercial; Projetos/Operacional/Administrativo → Geral;
     Financeiro → Executivo; e qualquer outra coisa → Geral. Antes disso, Diretor
     (ou `admin` da plataforma) vai direto para o Executivo.
  2. `Layout.jsx` (montado em toda página) redireciona por FUNÇÃO, e é o que
     `redirectTargetFor` já porta desde o módulo 1: Arquiteto e Estagiário saem
     de qualquer um dos três painéis para MinhasAtividades; Coordenador sai do
     Geral para o Executivo.

  O SEGUNDO SEMPRE VENCE, porque roda depois e em toda navegação. Na prática, no
  original, quem é Arquiteto e trabalha no Comercial entra, vê o painel comercial
  aparecer e é jogado para MinhasAtividades no quadro seguinte. O destino final é
  determinístico; o que existe no meio é um salto visível.

  Aqui os dois critérios são compostos: a regra de área escolhe o painel, e
  `redirectTargetFor` — a MESMA função do Layout, não uma cópia — tem a última
  palavra. O destino final é idêntico ao do original em todas as 36 combinações
  de função × área; o que deixa de existir é o salto intermediário.

  UM SUJEITO DO ORIGINAL NÃO TEM EQUIVALENTE: `user.role === 'admin'`, a função
  de PLATAFORMA do base44, que não existe neste schema. O que sobra dela é
  `collaborator.role === 'Diretor'`, que a mesma linha do original já testa — e
  que aqui é `role === 'director'`.

  UMA APLICAÇÃO DE `redirectTargetFor` BASTA: as saídas dela (MinhasAtividades e
  DashboardExecutivo) não são, elas próprias, origem de novo redirecionamento
  para as funções que as recebem.
*/
export function homeTargetFor(
  role: CollaboratorRole | null | undefined,
  area: CollaboratorArea | null | undefined,
): HomeTarget {
  const page = dashboardForArea(role, area)
  const redirect = redirectTargetFor(role, page)
  return (redirect as HomeTarget | null) ?? page
}

function dashboardForArea(
  role: CollaboratorRole | null | undefined,
  area: CollaboratorArea | null | undefined,
): HomeTarget {
  if (role === 'director') return 'DashboardExecutivo'

  if (area === 'commercial') return 'DashboardComercial'
  if (area === 'projects' || area === 'operations') return 'Dashboard'
  if (area === 'finance') return 'DashboardExecutivo'
  if (area === 'administrative') return 'Dashboard'

  /* Sem área cadastrada — o `else` do original. */
  return 'Dashboard'
}

/* ═══ Painel 1: "Dashboard Geral" ════════════════════════════════════════ */

/*
  Os cartões do topo (Dashboard.jsx:103-131), SOBRE `summarizeFinancial`.

  Não há soma nova aqui: `total` e `paid` das duas listas são exatamente
  "previsto" e "realizado" do painel, e é a mesma função que desenha os quatro
  cartões das telas de Recebíveis e Pagamentos. Repetir os `reduce` do original
  seria uma quinta definição de "recebido no mês".

  O RECORTE DE MÊS NÃO ESTÁ AQUI: quem o faz é o WHERE de `useReceivables` /
  `usePayables`, pela data de VENCIMENTO, que é o mesmo critério do original
  (Dashboard.jsx:108-116) e o mesmo das duas telas do financeiro.
*/
export function overviewFinancial(
  receivables: ReceivableRow[],
  payables: PayableRow[],
): OverviewFinancial {
  const revenue = summarizeFinancial(receivables)
  const expense = summarizeFinancial(payables)

  return {
    forecastRevenue: revenue.total,
    receivedRevenue: revenue.paid,
    forecastExpense: expense.total,
    paidExpense: expense.paid,
    result: revenue.paid - expense.paid,
    forecastResult: revenue.total - expense.total,
  }
}

/*
  "Contratos Fechados (Mês)" (Dashboard.jsx:191-207): contrato APROVADO com data
  de assinatura dentro do mês escolhido.

  DIVERGÊNCIA CONSCIENTE, e é de um dia inteiro. O original compara
  `new Date(c.signature_date) >= startOfMonth(...)`, e `signature_date` é coluna
  `date`: `new Date("2026-08-01")` é meia-noite EM UTC, ou seja, 31/07 às 21h em
  Goiânia — ANTES do início do mês local. Efeito no sistema em produção: contrato
  assinado no DIA 1 não conta no mês dele, e contrato assinado no dia 1 do mês
  SEGUINTE conta neste. Aqui a comparação é entre textos `YYYY-MM-DD`, usando o
  mesmo `monthRange` que recorta as telas do financeiro, e não há fuso no meio.

  Está no relatório do módulo. Voltar ao comportamento do original é trocar as
  duas linhas abaixo.
*/
export function closedContractsIn(
  contracts: ContractRow[],
  period: MonthYear,
): ClosedContracts {
  const { from, to } = monthRange(period)

  const closed = contracts.filter(
    (contract) =>
      contract.status === 'approved' &&
      contract.signature_date != null &&
      contract.signature_date >= from &&
      contract.signature_date <= to,
  )

  return {
    count: closed.length,
    value: closed.reduce((total, contract) => total + (contract.total_value ?? 0), 0),
  }
}

/*
  "Projetos por Etapa" (Dashboard.jsx:235-240).

  OS TRÊS RECORTES SÃO DO ORIGINAL, INCLUSIVE O QUE ELES TÊM DE ERRADO, e isso
  precisa estar visível para quem for desenhar a tela:

  - Eles NÃO cobrem todo mundo. Projeto com status "Em contrato" e fase
    "Briefing" não aparece em nenhum dos três, então a soma dos três números é
    menor que o total de projetos do fluxo.
  - Eles se SOBREPÕEM. Projeto "Concluído" cuja fase ainda é "Não iniciado"
    é contado em "Não iniciado" e em "Finalizado" ao mesmo tempo.

  Reproduzido como está: são três números visíveis na tela do cliente hoje.
*/
export function countProjectStages(projects: ProjectRow[]): ProjectStageCount {
  return {
    notStarted: projects.filter(
      (project) => project.status === 'prospecting' || project.current_phase === 'not_started',
    ).length,
    inProgress: projects.filter(
      (project) => project.status === 'in_development' || project.status === 'in_approval',
    ).length,
    completed: projects.filter(
      (project) => project.status === 'completed' || project.current_phase === 'finished',
    ).length,
  }
}

/*
  "Próximas Entregas - 15 dias" (Dashboard.jsx:220-233): tarefa não concluída com
  prazo entre AGORA e daqui a 15 dias, da mais próxima para a mais distante.

  DUAS COISAS QUE VÊM DO ORIGINAL E FICAM:

  1. O piso da janela é o INSTANTE atual, não o começo do dia — então tarefa que
     vence HOJE nunca aparece neste bloco. Ela some da lista de "próximas
     entregas" no mesmo momento em que passa a valer como atrasada no kanban.
  2. A lista é cortada em 10 e o crachá do cabeçalho mostra o tamanho dela, então
     o contador satura em "10" por mais entregas que existam.

  `daysRemaining` é o cálculo que o original faz dentro do JSX
  (Dashboard.jsx:431) e que aqui sai pronto — conta não mora no render.
*/
const UPCOMING_DAYS = 15
const UPCOMING_LIMIT = 10

export function upcomingDeliveries(tasks: TaskRow[], now: Date = new Date()): UpcomingDelivery[] {
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000)

  return tasks
    .filter((task) => {
      if (task.status === 'completed' || !task.due_date) return false
      const due = parseISO(task.due_date)
      return due >= now && due <= horizon
    })
    .sort((a, b) => parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime())
    .slice(0, UPCOMING_LIMIT)
    .map((task) => ({
      task,
      daysRemaining: Math.ceil(
        (parseISO(task.due_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ),
    }))
}

/* ═══ Recortes do Fluxo do Projeto ═══════════════════════════════════════ */

/*
  `getActiveFlowProjects` de components/utils/flowProjectsQuery.jsx — o arquivo
  que o original declara como "FONTE ÚNICA DE VERDADE" do Fluxo de Projetos.

  A primeira metade daquela função (projeto visível no fluxo) já é o WHERE de
  `useProjects` (`visible_in_list = true`, migration 0032), então o que sobra
  para cá é o recorte de ATIVO: fora concluído, suspenso e fase Finalizado.

  Consequência que o painel herda: "Total Ativo" nunca conta projeto concluído,
  enquanto "Projetos por Etapa" do painel Geral conta — os dois painéis mostram
  totais diferentes de propósito, porque olham conjuntos diferentes.
*/
export function activeFlowProjects(projects: ProjectRow[]): ProjectRow[] {
  return projects.filter(
    (project) =>
      project.status !== 'completed' &&
      project.status !== 'suspended' &&
      project.current_phase !== 'finished',
  )
}

/* `getFlowTasks`: as tarefas dos projetos visíveis no fluxo. */
export function flowTasks(tasks: TaskRow[], flowProjects: ProjectRow[]): TaskRow[] {
  const ids = new Set(flowProjects.map((project) => project.id))
  return tasks.filter((task) => task.project_id != null && ids.has(task.project_id))
}

/*
  `getProjectResponsibleMap`: quem responde pelo CARD do projeto no Fluxo — que
  no original não é `projects.operational_responsible_id`, e sim o responsável da
  TAREFA. É por isso que o painel fala em "Sem responsável no Fluxo do Projeto"
  e manda a pessoa resolver lá, e não no cadastro do projeto.

  A ÚLTIMA TAREFA VENCE, e é o original (o `map.set` sobrescreve sem critério).
  Projeto com duas tarefas de responsáveis diferentes tem responsável decidido
  pela ordem em que as tarefas chegaram da consulta — que é `created_at`
  decrescente em `useTasks`, e no base44 era a ordem padrão da entidade. Quer
  dizer: o número de "Projetos por Colaborador" muda se alguém criar uma tarefa.
  Reproduzido como está e registrado no relatório.
*/
export function projectResponsibleMap(tasks: TaskRow[]): Map<string, ProjectResponsible> {
  const map = new Map<string, ProjectResponsible>()

  for (const task of tasks) {
    if (task.project_id && task.responsible_id) {
      map.set(task.project_id, {
        id: task.responsible_id,
        /* Nome ATUAL do cadastro, via embed — no original é a cópia congelada
           `responsible_name`. */
        name: task.responsible?.name ?? '—',
      })
    }
  }

  return map
}

/*
  `isProjectBlocked`: checklist obrigatório incompleto.

  LÊ DA VIEW, e é o ponto do módulo. No original os dois números vêm de
  `tarefas_total_obrigatorias` / `tarefas_concluidas_obrigatorias`, colunas de
  `Project` que o navegador gravava de volta a cada mudança de tarefa. Elas não
  existem no schema (migration 0034/0035): quem conta item obrigatório é
  `project_progress`. Assim o "Bloqueados" do painel e o contador
  "X de Y itens obrigatórios" do kanban são a mesma conta, feita uma vez.

  Projeto sem linha na view não existe — ela devolve uma por projeto, inclusive
  sem tarefa nenhuma. O `undefined` aqui é o projeto que não veio na página de
  500 linhas, e nesse caso não bloqueia, como não bloqueia projeto sem item.
*/
export function isProjectBlocked(progress: ProjectProgress | undefined): boolean {
  const total = progress?.required_items_total ?? 0
  const done = progress?.required_items_completed ?? 0
  return total > 0 && done < total
}

/* ═══ Painel 2: "Painel Executivo" ═══════════════════════════════════════ */

/*
  Os quatro cartões do bloco "Visão Geral" (DashboardExecutivo.jsx:151-261).

  AS QUATRO CONTAGENS VÊM DO BANCO, uma a uma, com o critério no WHERE — ver
  `useActivityCounts` em hooks.ts, onde cada consulta está escrita ao lado da
  regra que reproduz. Elas somavam a lista em memória, e a lista tem teto de 500
  linhas: 8 pessoas × 5 atividades por semana estouram esse teto em cerca de três
  meses, e o cartão passaria a mostrar um número menor que o real sem nada avisar.
  O que sobra para esta função é a única conta que não é contagem — a divisão.

  DOIS DELES IGNORAM OS FILTROS DO TOPO, e é do original: "Em Andamento" e
  "Atrasadas" contam tudo, sem período, sem projeto e sem colaborador. Só
  "Concluídas" e "Produtividade" respeitam a barra de filtros. Quem desenhar a
  tela precisa saber disso — a barra fica logo acima dos quatro.

  "PRODUTIVIDADE" É UMA MÉTRICA QUEBRADA, e está reproduzida como tal. A conta é
  `concluídas / previstas`, mas "previstas" sai do MESMO recorte já filtrado por
  data de conclusão — ou seja, de atividades que necessariamente já foram
  concluídas. O denominador é praticamente igual ao numerador, e o cartão marca
  100% quase sempre. O rótulo na tela é "Meta vs concluído"; não há meta em lugar
  nenhum do sistema. Corrigir exige decidir o que é a meta, e isso é do usuário.
*/
export function activityMetrics(counts: ActivityCounts): ActivityMetrics {
  return {
    inProgress: counts.inProgress,
    completed: counts.completed,
    overdue: counts.overdue,
    productivity:
      counts.forecast > 0 ? Math.round((counts.completed / counts.forecast) * 100) : 0,
  }
}

/*
  As ONZE fases do gráfico "Distribuição por Fase"
  (DashboardExecutivo.jsx:268-272), na ordem em que o original as lista — que é a
  ordem de declaração de `PROJECT_PHASE`, ou seja, a ordem das colunas do kanban.

  DERIVADA do enum em vez de escrita à mão: `finished` fica de fora porque
  projeto finalizado não é projeto ativo, e `post_approval` porque só existe para
  o checklist de orçamento (migration 0048) e nenhum projeto pode estar nela.
  Escrever a lista à mão faria uma fase nova no enum não aparecer no gráfico sem
  nada acusar.
*/
export const EXECUTIVE_PHASES: ProjectPhase[] = (
  Object.keys(PROJECT_PHASE) as ProjectPhase[]
).filter((phase) => phase !== 'finished' && phase !== 'post_approval')

/*
  "EM RISCO" VEM DE FORA, contado no banco (`useAtRiskProjectCount`): é a única
  das cinco medidas deste bloco que dependia da lista de TAREFAS, e a lista de
  tarefas é a que cresce (~100 projetos × 10 a 30 tarefas), além de vir com o
  checklist inteiro pendurado no embed. Contar projeto vencido não precisa de
  nada disso.

  As outras quatro continuam sobre a lista de PROJETOS, que a tela toda já usa —
  contá-las no banco criaria um segundo caminho para o mesmo número, com risco de
  o cartão discordar do gráfico logo abaixo dele. Elas herdam o teto de 500
  projetos, que hoje é ~100 e é o menor dos limites do sistema.
*/
export function operationalMetrics(
  activeProjects: ProjectRow[],
  progressByProject: Map<string, ProjectProgress>,
  atRiskCount: number,
): OperationalMetrics {
  return {
    totalProjects: activeProjects.length,
    byPhase: EXECUTIVE_PHASES.map((phase) => ({
      phase,
      label: PROJECT_PHASE[phase],
      count: activeProjects.filter((project) => project.current_phase === phase).length,
    })),
    awaitingClient: activeProjects.filter((project) => project.current_phase === 'awaiting_client')
      .length,
    atRisk: atRiskCount,
    blocked: activeProjects.filter((project) => isProjectBlocked(progressByProject.get(project.id)))
      .length,
  }
}

/*
  "Capacidade do Time" (DashboardExecutivo.jsx:330-394).

  QUEM ENTRA NA LISTA: colaborador ATIVO cuja função é Arquiteto, Estagiário ou
  Coordenador — as três funções que executam projeto. É o mesmo conjunto que
  `MENU_META.my_activities.onlyForRoles` (auth/navigation.ts) libera para
  "Minhas Atividades", e não por acaso: são as pessoas que tocam card.

  Declarado aqui, e não importado de lá, porque são perguntas diferentes que hoje
  têm a mesma resposta — amarrar as duas faria mudar quem vê um item de menu
  mudar quem aparece num gráfico.

  O balde "Sem responsável no Fluxo do Projeto" é do original e é a razão de ser
  do bloco: ele existe para a diretoria ver quantos projetos ninguém está
  tocando. Vai para o FIM da lista, depois da ordenação, como lá.
*/
export const OPERATIONAL_ROLES: readonly CollaboratorRole[] = ['architect', 'intern', 'coordinator']

export const UNASSIGNED_BUCKET_ID = 'sem-responsavel'

export function teamMetrics(
  collaborators: Collaborator[],
  activeProjects: ProjectRow[],
  responsibleByProject: Map<string, ProjectResponsible>,
  filters: ExecutiveFilters,
): TeamMetrics {
  let scoped = activeProjects

  if (filters.projectId) {
    scoped = scoped.filter((project) => project.id === filters.projectId)
  }

  if (filters.collaboratorId) {
    /* Pelo responsável do CARD, não pelo do projeto — ver `projectResponsibleMap`. */
    scoped = scoped.filter(
      (project) => responsibleByProject.get(project.id)?.id === filters.collaboratorId,
    )
  }

  const operational = collaborators.filter(
    (collaborator) =>
      collaborator.status === 'active' && OPERATIONAL_ROLES.includes(collaborator.role),
  )

  const byCollaborator: CollaboratorLoad[] = operational
    .map((collaborator) => {
      const projects = scoped.filter(
        (project) => responsibleByProject.get(project.id)?.id === collaborator.id,
      )
      return {
        id: collaborator.id,
        name: collaborator.name,
        role: collaborator.role,
        projectCount: projects.length,
        projects,
        needsAction: false,
      }
    })
    .filter((load) => load.projectCount > 0)
    .sort((a, b) => b.projectCount - a.projectCount)

  const unassigned = scoped.filter((project) => !responsibleByProject.get(project.id)?.id)

  if (unassigned.length > 0) {
    byCollaborator.push({
      id: UNASSIGNED_BUCKET_ID,
      name: 'Sem responsável no Fluxo do Projeto',
      role: null,
      projectCount: unassigned.length,
      projects: unassigned,
      needsAction: true,
    })
  }

  return { byCollaborator, activeProjects: scoped.length }
}

/*
  "Evolução dos Projetos" (DashboardExecutivo.jsx:397-441): a lista de projetos
  ativos do menos ao mais adiantado, com a carga de atividades de cada um.

  O PROGRESSO VEM DA VIEW `project_progress`, não de coluna gravada pelo
  navegador. É a mesma `progress_percent` que a lista de Projetos e o kanban já
  mostram — e ela DIVERGE do original de propósito, por decisão do usuário
  registrada na migration 0035: lá uma única tarefa concluída levava o projeto a
  100%. Consequência para este painel: "Progresso Médio", "Projetos < 30%" e
  "Projetos > 80%" mudam de valor em relação ao base44, e mudam para melhor.

  A CONTAGEM DE ATIVIDADES ignora as excluídas (é o que o original faz aqui), ao
  contrário do cartão "Concluídas" no topo do mesmo painel.

  E ELA É A ÚLTIMA SOMA DE LISTA DO PAINEL, com o teto de 500 que os cartões
  deixaram de ter: são três contagens POR PROJETO, e agregação por projeto não
  cabe num `count` com WHERE — precisa de `group by`, ou seja, de uma view nova.
  Passadas 500 atividades no escritório, o crachá "N atividades abertas" de cada
  linha conta menos do que existe. Está no relatório do módulo.

  O original ordena duas vezes (linhas 399 e 434) com o mesmo critério; aqui é
  uma vez só, com o mesmo resultado.
*/
export function progressMetrics(
  activeProjects: ProjectRow[],
  progressByProject: Map<string, ProjectProgress>,
  responsibleByProject: Map<string, ProjectResponsible>,
  activities: DashboardActivity[],
  now: Date = new Date(),
): ProgressMetrics {
  const alive = activities.filter((activity) => activity.deleted_at == null)

  const rows: ProjectProgressRow[] = activeProjects.map((project) => {
    const progress = progressByProject.get(project.id)
    const ofProject = alive.filter((activity) => activity.project_id === project.id)

    return {
      project,
      progressPercent: progress?.progress_percent ?? 0,
      requiredItemsTotal: progress?.required_items_total ?? 0,
      requiredItemsCompleted: progress?.required_items_completed ?? 0,
      responsible: responsibleByProject.get(project.id) ?? null,
      totalActivities: ofProject.length,
      openActivities: ofProject.filter((activity) => activity.status !== 'completed').length,
      overdueActivities: ofProject.filter((activity) => isActivityOverdue(activity, now)).length,
    }
  })

  const total = rows.reduce((sum, row) => sum + row.progressPercent, 0)

  return {
    sorted: [...rows].sort((a, b) => a.progressPercent - b.progressPercent),
    averageProgress: rows.length > 0 ? Math.round(total / rows.length) : 0,
    below30: rows.filter((row) => row.progressPercent < 30).length,
    above80: rows.filter((row) => row.progressPercent > 80).length,
  }
}

/* ═══ Painel 3: "Dashboard Comercial" ════════════════════════════════════ */

const estimated = (negotiation: NegotiationRow): number => negotiation.estimated_value ?? 0

const sumEstimated = (negotiations: NegotiationRow[]): number =>
  negotiations.reduce((total, negotiation) => total + estimated(negotiation), 0)

/*
  Bloco 1 — "Visão Geral do Funil" (DashboardComercial.jsx:81-105).

  NÃO RESPEITA O FILTRO DE MÊS do cabeçalho, e é do original: os quatro cartões
  somam todas as negociações ativas, de qualquer época. O seletor de mês/ano ao
  lado do título sugere o contrário. Quem desenhar a tela precisa reproduzir o
  microcopy do original ("Em andamento", "Pipeline total"), que não menciona
  período — é o que separa este bloco do de baixo.

  "Em risco" é previsão de fechamento vencida, com a régua compartilhada do
  pipeline (`isExpectedCloseOverdue`), a mesma do crachá do quadro.

  METADE DESTE BLOCO VEM DO BANCO E METADE NÃO, e isso é visível na tela quando o
  funil passar de 500 negociações (~2 anos, a 300/ano):

  - "Negociações Ativas" e "Em Risco" são CONTAGEM, e viraram `count` com o
    critério no WHERE (`useFunnelCounts`). Números certos em qualquer tamanho.
  - "Pipeline Total" e "Ticket Médio" são SOMA, e soma não é contagem: o
    PostgREST não agrega sem uma view ou função nova. Continuam saindo da lista,
    logo continuam com teto de 500.

  Consequência para quem desenha a tela, e ela precisa estar dita: passado o teto,
  "Ticket Médio" deixa de ser "Pipeline Total ÷ Negociações Ativas" — ele é
  calculado sobre as 500 que desceram, para não misturar uma soma parcial com uma
  contagem completa e produzir uma média que não é média de nada. Resolver de
  verdade é uma view de totais do funil, e é decisão do usuário.
*/
export function funnelMetrics(
  negotiations: NegotiationRow[],
  counts: FunnelCounts,
): FunnelMetrics {
  const active = negotiations.filter((negotiation) => negotiation.status === 'active')
  const totalValue = sumEstimated(active)

  return {
    activeCount: counts.activeCount,
    totalValue,
    averageTicket: active.length > 0 ? totalValue / active.length : 0,
    atRiskCount: counts.atRiskCount,
  }
}

/*
  Blocos 2 e 2B — o que ganhou e o que perdeu no mês escolhido
  (DashboardComercial.jsx:108-157).

  MESMA DIVERGÊNCIA DE UM DIA de `closedContractsIn`, e pela mesma razão:
  `closed_at` é coluna `date` e o original a compara com `new Date`. Aqui é
  comparação de texto sobre o intervalo de `monthRange`.

  As duas taxas dividem pelo total FINALIZADO no mês (ganhas + perdidas), não
  pelo funil inteiro — então elas somam 100% sempre que houver qualquer
  fechamento, e valem 0% no mês em que nada fechou.
*/
export function closingMetrics(
  negotiations: NegotiationRow[],
  period: MonthYear,
): ClosingMetrics {
  const { from, to } = monthRange(period)

  const closedInMonth = (status: 'won' | 'lost') =>
    negotiations.filter(
      (negotiation) =>
        negotiation.status === status &&
        negotiation.closed_at != null &&
        negotiation.closed_at >= from &&
        negotiation.closed_at <= to,
    )

  const won = closedInMonth('won')
  const lost = closedInMonth('lost')

  const wonValue = sumEstimated(won)
  const finished = won.length + lost.length

  return {
    wonCount: won.length,
    wonValue,
    wonAverageTicket: won.length > 0 ? wonValue / won.length : 0,
    conversionRate: finished > 0 ? (won.length / finished) * 100 : 0,
    lostCount: lost.length,
    lostValue: sumEstimated(lost),
    lossRate: finished > 0 ? (lost.length / finished) * 100 : 0,
    won,
    lost,
  }
}

/*
  Bloco 3 — as cinco etapas do funil, só com as ativas
  (DashboardComercial.jsx:221-236). A ordem é a de declaração de `FUNNEL_STAGE`,
  que é a ordem das colunas do quadro; o original repete a lista à mão.
*/
export function funnelStageTotals(negotiations: NegotiationRow[]): FunnelStageTotals[] {
  const active = negotiations.filter((negotiation) => negotiation.status === 'active')

  return (Object.keys(FUNNEL_STAGE) as FunnelStage[]).map((stage) => {
    const inStage = active.filter((negotiation) => negotiation.funnel_stage === stage)
    return {
      stage,
      label: FUNNEL_STAGE[stage],
      count: inStage.length,
      value: sumEstimated(inStage),
    }
  })
}

/*
  Bloco 5 — "Velocidade e Gargalos" (DashboardComercial.jsx:243-276).

  O tempo médio de fechamento é sobre TODAS as ganhas de todos os tempos, não as
  do mês escolhido — de novo, o filtro do cabeçalho não alcança este bloco. É do
  original.

  "Paradas" é negociação ativa que entrou no funil há mais de 30 dias. O nome
  engana: nada disso olha a última movimentação, então uma negociação trabalhada
  ontem aparece como parada se entrou há 31 dias. A lista de Negociações usa
  outra régua para a mesma palavra (`updated_at` há mais de 5 dias,
  Negociacoes.tsx:234) — duas telas, dois significados, os dois do original.
*/
const STALLED_DAYS = 30

export function velocityMetrics(
  negotiations: NegotiationRow[],
  now: Date = new Date(),
): VelocityMetrics {
  const won = negotiations.filter(
    (negotiation) => negotiation.status === 'won' && negotiation.closed_at != null,
  )

  const totalDays = won.reduce(
    (sum, negotiation) =>
      sum + differenceInDays(parseISO(negotiation.closed_at!), parseISO(negotiation.funnel_entry_date)),
    0,
  )

  const stalled: StalledNegotiation[] = negotiations
    .filter((negotiation) => negotiation.status === 'active')
    .map((negotiation) => ({
      negotiation,
      daysInFunnel: differenceInDays(now, parseISO(negotiation.funnel_entry_date)),
    }))
    .filter((row) => row.daysInFunnel > STALLED_DAYS)
    .sort((a, b) => b.daysInFunnel - a.daysInFunnel)

  return {
    averageDaysToClose: won.length > 0 ? totalDays / won.length : 0,
    stalled,
  }
}

/*
  Os sete cartões clicáveis (DashboardComercial.jsx:160-218).

  BUG DO ORIGINAL REPRODUZIDO, e este é o que mais importa desta tela: o
  drill-down de "Negociações Ganhas" filtra a lista de PERDIDAS procurando status
  "Ganha" (linha 185), então ele abre SEMPRE VAZIO — a gaveta diz "Nenhuma
  negociação encontrada" enquanto o cartão logo acima mostra, por exemplo, 4.
  Está reproduzido de propósito, com este comentário, e reportado ao usuário: a
  correção é uma linha (`closing.won`), e é decisão dele.

  DIFERENÇA SEM EFEITO NA TELA: onde o original ordena a lista de perdidas com
  `.sort()` direto sobre o array do memo — mutando o resultado memoizado e
  reordenando também o cartão "Quantidade Perdida" — aqui a ordenação é sobre uma
  cópia.
*/
export function commercialDrilldown(
  kind: CommercialDrilldown,
  negotiations: NegotiationRow[],
  closing: ClosingMetrics,
  now: Date = new Date(),
): NegotiationRow[] {
  const active = negotiations.filter((negotiation) => negotiation.status === 'active')
  const byValueDesc = (rows: NegotiationRow[]) =>
    [...rows].sort((a, b) => estimated(b) - estimated(a))

  switch (kind) {
    case 'ativas':
      return active
    case 'valor_em_negociacao':
      return byValueDesc(active)
    case 'em_risco':
      return active.filter((negotiation) => isExpectedCloseOverdue(negotiation, now))
    case 'ganhas':
      /* Sim, sobre `lost`. Ver o cabeçalho: é o bug do original, preservado. */
      return closing.lost.filter((negotiation) => negotiation.status === 'won')
    case 'valor_ganho':
      return byValueDesc(closing.won)
    case 'perdidas':
      return closing.lost
    case 'valor_perdido':
      return byValueDesc(closing.lost)
  }
}
