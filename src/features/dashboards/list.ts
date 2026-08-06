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
  UpcomingDeliveries,
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

  CORRIGIDO EM RELAÇÃO AO ORIGINAL — os três recortes de lá não particionam:

  - NÃO COBRIAM todo mundo. Projeto com status "Em contrato" e fase "Briefing"
    não entrava em nenhum dos três (`status` não é `prospecting`, `in_development`
    nem `in_approval`, e a fase não é `not_started` nem `finished`), então a soma
    dos três dava MENOS que o total do fluxo.
  - SE SOBREPUNHAM. Projeto "Concluído" cuja fase ainda é "Não iniciado" era
    contado em "Não iniciado" E em "Finalizado" ao mesmo tempo, e a soma dava
    MAIS que o total.

  Os dois defeitos produzem número errado num bloco cuja leitura é justamente
  "como o escritório se divide", então viraram uma ESCADA EXCLUSIVA: cada projeto
  cai em exatamente um balde e a soma dos três é o total da lista.

  A ORDEM DA ESCADA é a precedência do original quando ele contava duas vezes:
  terminal primeiro (status "Concluído" OU fase "Finalizado" — quem terminou
  terminou, qualquer que seja a outra coluna), depois "não iniciado", e o resto
  cai em "em andamento". Os três rótulos da tela continuam os mesmos.

  CONSEQUÊNCIA REGISTRADA: projeto SUSPENSO, que antes não entrava em nenhum
  balde, agora conta em "Em andamento" — é o balde do "nem terminou nem está por
  começar". Os três rótulos são os do original e não há um quarto para suspenso;
  criar um seria redesenhar o bloco.
*/
export function countProjectStages(projects: ProjectRow[]): ProjectStageCount {
  const count = { notStarted: 0, inProgress: 0, completed: 0 }

  for (const project of projects) {
    if (project.status === 'completed' || project.current_phase === 'finished') {
      count.completed += 1
    } else if (project.status === 'prospecting' || project.current_phase === 'not_started') {
      count.notStarted += 1
    } else {
      count.inProgress += 1
    }
  }

  return count
}

/*
  "Próximas Entregas - 15 dias" (Dashboard.jsx:220-233): tarefa não concluída com
  prazo entre AGORA e daqui a 15 dias, da mais próxima para a mais distante.

  O QUE VEM DO ORIGINAL E FICA: o piso da janela é o INSTANTE atual, não o começo
  do dia — então tarefa que vence HOJE nunca aparece neste bloco. Ela some da
  lista de "próximas entregas" no mesmo momento em que passa a valer como
  atrasada no kanban.

  O QUE FOI CORRIGIDO: no original a lista é cortada em 10 e o crachá do
  cabeçalho mede o tamanho DELA (Dashboard.jsx:220-233 e 425), então o contador
  satura em "10" por mais entregas que existam — quinze entregas nos próximos
  quinze dias apareciam como "10". Agora a função devolve as duas coisas
  separadas: `items`, com o mesmo corte de 10 que a lista sempre teve, e `total`,
  contado ANTES do corte. A lista não mudou; o número ao lado dela passou a ser o
  real.

  O TETO DE 500 TAREFAS de `useTasks` continua de pé e é o limite que sobra
  daqui: `total` é exato dentro das tarefas que desceram. Passar disso pede uma
  contagem no banco, com a tradução de fuso que a janela exige — está no
  relatório do módulo.

  `daysRemaining` é o cálculo que o original faz dentro do JSX
  (Dashboard.jsx:431) e que aqui sai pronto — conta não mora no render.
*/
const UPCOMING_DAYS = 15
const UPCOMING_LIMIT = 10

export function upcomingDeliveries(tasks: TaskRow[], now: Date = new Date()): UpcomingDeliveries {
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000)

  const upcoming = tasks
    .filter((task) => {
      if (task.status === 'completed' || !task.due_date) return false
      const due = parseISO(task.due_date)
      return due >= now && due <= horizon
    })
    .sort((a, b) => parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime())

  return {
    total: upcoming.length,
    items: upcoming.slice(0, UPCOMING_LIMIT).map((task) => ({
      task,
      daysRemaining: Math.ceil(
        (parseISO(task.due_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ),
    })),
  }
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
  `getProjectResponsibleMap`: quem responde pelo projeto no Fluxo.

  O DEFEITO DO ORIGINAL ERA A FALTA DE CRITÉRIO: lá o mapa é um `map.set` dentro
  de um `forEach` sobre TODAS as tarefas (flowProjectsQuery.jsx:56-66), então
  quem "vence" é simplesmente a última tarefa que a consulta devolveu — ordem que
  neste projeto é `created_at` decrescente (`useTasks`) e no base44 era a ordem
  padrão da entidade. Consequência visível: CRIAR UMA TAREFA trocava o nome do
  responsável no card e mexia nos números de "Projetos por Colaborador", sem
  ninguém ter reatribuído nada. Isso não é uma escolha de produto, é o resultado
  de não haver escolha nenhuma.

  O CRITÉRIO NOVO, em duas metades e as duas estáveis:

  1. `projects.operational_responsible_id`, quando existir. É a coluna que o
     schema declara como "quem executa - responsavel operacional, definido no
     Fluxo de Projeto" (migration 0032, item 4) — campo explícito ganha de campo
     inferido, e é exatamente o sujeito de que o painel fala.
  2. Sem ela, o responsável da tarefa MAIS ANTIGA do projeto (`created_at`
     crescente, desempate por `id` para a consulta nunca decidir sozinha). A
     metade 2 existe porque "Alterar Responsável" no card do quadro é a única
     forma que a aplicação oferece HOJE de definir responsável no Fluxo — sem
     ela, a instrução que o painel dá ("Defina um Arquiteto, Estagiário ou
     Coordenador no card do Fluxo de Projeto") não teria como ser cumprida.

  As duas metades não mudam quando uma tarefa nova é criada, que é o ponto.

  O QUE NÃO MUDA: o conceito continua sendo "responsável no Fluxo do Projeto", e
  o balde "Sem responsável" continua sendo projeto sem nenhum dos dois.
*/
export function projectResponsibleMap(
  tasks: TaskRow[],
  projects: ProjectRow[],
): Map<string, ProjectResponsible> {
  const map = new Map<string, ProjectResponsible>()

  for (const project of projects) {
    if (project.operational_responsible_id) {
      map.set(project.id, {
        id: project.operational_responsible_id,
        /* Nome ATUAL do cadastro, via embed — no original é a cópia congelada
           `responsible_name`. */
        name: project.operational_responsible?.name ?? '—',
      })
    }
  }

  const oldestFirst = [...tasks].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )

  for (const task of oldestFirst) {
    if (task.project_id && task.responsible_id && !map.has(task.project_id)) {
      map.set(task.project_id, {
        id: task.responsible_id,
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
  O RECORTE QUE A BARRA DE FILTROS DO TOPO PRODUZ, em um lugar só.

  No original este recorte existe DENTRO do bloco "Capacidade do Time"
  (DashboardExecutivo.jsx:498-508) e não sai de lá: os quatro cartões de "Visão
  Geral de Projetos Ativos", o gráfico de fases e o bloco "Evolução dos Projetos"
  contam o escritório inteiro, com a barra de filtros logo acima deles. O
  sintoma mais visível era "Total Ativo" (bloco 2) e "Projetos Ativos" (bloco 4)
  discordando na mesma tela, com o mesmo rótulo, a uma rolagem um do outro.

  Extraído e aplicado a TODOS os blocos de projeto do painel. Filtro visível que
  não muda o número ao lado é engano, e aqui ele tinha até um contraexemplo na
  própria tela.

  O PERÍODO NÃO ENTRA — e não é omissão: `period` é o recorte de ATIVIDADE
  (hoje/semana/mês pela data de conclusão), e projeto não tem data de conclusão
  para peneirar. É o mesmo alcance que o filtro tinha no bloco 4 do original.

  COLABORADOR É PELO RESPONSÁVEL NO FLUXO, não pelo responsável comercial — ver
  `projectResponsibleMap`.
*/
export function scopeProjects(
  activeProjects: ProjectRow[],
  responsibleByProject: Map<string, ProjectResponsible>,
  filters: ExecutiveFilters,
): ProjectRow[] {
  let scoped = activeProjects

  if (filters.projectId) {
    scoped = scoped.filter((project) => project.id === filters.projectId)
  }

  if (filters.collaboratorId) {
    scoped = scoped.filter(
      (project) => responsibleByProject.get(project.id)?.id === filters.collaboratorId,
    )
  }

  return scoped
}

/*
  Os quatro cartões do bloco "Visão Geral" (DashboardExecutivo.jsx:151-261).

  AS QUATRO CONTAGENS VÊM DO BANCO, uma a uma, com o critério no WHERE — ver
  `useActivityCounts` em hooks.ts, onde cada consulta está escrita ao lado da
  regra que reproduz. Elas somavam a lista em memória, e a lista tem teto de 500
  linhas: 8 pessoas × 5 atividades por semana estouram esse teto em cerca de três
  meses, e o cartão passaria a mostrar um número menor que o real sem nada avisar.
  O que sobra para esta função é a única conta que não é contagem — a divisão.

  OS QUATRO PASSARAM A RESPEITAR PROJETO E COLABORADOR da barra de filtros. No
  original, "Em Andamento" e "Atrasadas" contavam o escritório inteiro com a
  barra logo acima deles dizendo o contrário — filtrar por um projeto e ver o
  número não se mexer é engano puro. Os WHERE estão em `useActivityCounts`.

  O PERÍODO CONTINUA FORA DESSES DOIS, e a razão é que ele não teria como entrar:
  "Em Andamento" e "Atrasadas" são fotografia de AGORA, e as quatro opções do
  seletor (Hoje, Esta semana, Este mês, Todas) contêm todas o dia de hoje.
  Recortar "atrasada" por "prazo dentro de hoje" daria zero por construção — todo
  atraso está no passado. Está no relatório do módulo.

  "PRODUTIVIDADE" DEIXOU DE MARCAR ~100% SEMPRE. A conta do original é
  `concluídas / previstas`, mas "previstas" saía do MESMO recorte já filtrado por
  DATA DE CONCLUSÃO, acrescido só de `prazo_inicio <= hoje` — ou seja, de
  atividades que necessariamente já tinham sido concluídas. Denominador igual ao
  numerador a menos de um caso de borda, resultado preso em 100% (ou em 0% quando
  nada fechou no período). E o rótulo dizia "Meta vs concluído" sem existir meta
  em lugar nenhum do sistema.

  A CONTA NOVA é a taxa de cumprimento do período: das atividades PREVISTAS para
  o período — as que têm PRAZO (`end_date`) dentro dele, concluídas ou não —
  quantas foram concluídas. Numerador e denominador saem do mesmo conjunto, o
  numerador é subconjunto próprio do denominador, o resultado é sempre 0–100% e
  varia de verdade. Escolhida em vez de "deixar de prometer meta" porque um
  painel executivo sem nenhuma medida de execução perde o sentido do bloco, e
  porque "prazo no período" é um conjunto que já existe no dado — não precisa de
  meta cadastrada, que é o que o sistema não tem. O rótulo da tela deixa de citar
  meta e passa a dizer a divisão, como os cartões de taxa do painel comercial
  ("Ganhos / Finalizadas").

  `completed` (o cartão "Concluídas") continua saindo da DATA DE CONCLUSÃO, que é
  o que aquele cartão sempre mediu e o que o Relatório de Produtividade mede. Por
  isso ele NÃO é o numerador desta divisão: são duas perguntas diferentes sobre o
  mesmo período.
*/
export function activityMetrics(counts: ActivityCounts): ActivityMetrics {
  return {
    inProgress: counts.inProgress,
    completed: counts.completed,
    overdue: counts.overdue,
    productivity:
      counts.forecast > 0 ? Math.round((counts.forecastCompleted / counts.forecast) * 100) : 0,
  }
}

/*
  As fases do gráfico "Distribuição por Fase" (DashboardExecutivo.jsx:268-272),
  na ordem em que o original as lista — que é a ordem de declaração de
  `PROJECT_PHASE`, ou seja, a ordem das colunas do kanban. Eram onze; com
  `under_construction` (migration 0061) são doze, e a barra "Em Obra" apareceu
  sozinha justamente porque a lista é derivada.

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
  "EM RISCO" VEM DE FORA, do CONJUNTO de projetos com tarefa vencida que o banco
  devolve (`useAtRiskProjectIds`): é a única das cinco medidas deste bloco que
  dependia da lista de TAREFAS, e a lista de tarefas é a que cresce (~100
  projetos × 10 a 30 tarefas), além de vir com o checklist inteiro pendurado no
  embed. Saber QUAIS projetos estão em risco não precisa de nada disso.

  POR QUE UM CONJUNTO E NÃO UMA CONTAGEM: com a contagem vinda do banco e a
  gaveta peneirada sobre as 500 tarefas baixadas, o cartão e a gaveta podiam
  discordar — e agora que o cartão respeita os filtros do topo, a contagem
  sozinha nem serviria (o banco não sabe quem é o responsável do card, que é
  cruzamento de tela). Com o conjunto de ids, o cartão conta os projetos do
  recorte que estão nele e a gaveta abre exatamente esses. Um lugar, um número.

  AS CINCO RESPEITAM O RECORTE que a barra de filtros do topo produz — ver
  `scopeProjects`. No original os quatro cartões e o gráfico contavam o
  escritório inteiro enquanto o cartão "Projetos Ativos" do bloco de baixo, a uma
  rolagem dali, já respeitava os mesmos filtros: dois totais diferentes, com o
  mesmo nome, na mesma tela.
*/
export function operationalMetrics(
  scopedProjects: ProjectRow[],
  progressByProject: Map<string, ProjectProgress>,
  atRiskIds: Set<string>,
): OperationalMetrics {
  return {
    totalProjects: scopedProjects.length,
    byPhase: EXECUTIVE_PHASES.map((phase) => ({
      phase,
      label: PROJECT_PHASE[phase],
      count: scopedProjects.filter((project) => project.current_phase === phase).length,
    })),
    awaitingClient: scopedProjects.filter((project) => project.current_phase === 'awaiting_client')
      .length,
    atRisk: scopedProjects.filter((project) => atRiskIds.has(project.id)).length,
    blocked: scopedProjects.filter((project) => isProjectBlocked(progressByProject.get(project.id)))
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
  scoped: ProjectRow[],
  responsibleByProject: Map<string, ProjectResponsible>,
): TeamMetrics {
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

  NÃO RESPEITA O FILTRO DE MÊS, E ISSO FICA: os quatro cartões somam as
  negociações ATIVAS — negociação está ativa AGORA, não "em agosto de 2026". É
  fotografia do funil no instante em que a tela abre, e recortá-la por mês
  produziria um número que não corresponde a pergunta nenhuma ("quanto do
  pipeline de hoje entrou em agosto?" não é o que o cartão diz).

  O QUE FOI CORRIGIDO É O RÓTULO, não a conta: a tela agora escreve, embaixo do
  título do bloco, que ele é a posição atual e independe do mês selecionado — no
  original o seletor fica ao lado do título e nada avisa que estes quatro números
  o ignoram. Ver DashboardComercial.tsx.

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

  TAMBÉM É FOTOGRAFIA DO FUNIL ATUAL, pela mesma razão do bloco 1: os dois
  gráficos distribuem as negociações ativas pelas etapas do quadro, e "ativa" não
  tem mês. O seletor não alcança este bloco, e agora a tela diz isso embaixo do
  título em vez de deixar o filtro parecer global.
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

  "TEMPO MÉDIO DE FECHAMENTO" PASSOU A RESPEITAR O MÊS. No original ele é a média
  sobre todas as ganhas de todos os tempos, com o seletor de mês/ano logo acima
  no cabeçalho — mexer no seletor não movia o número. É uma medida de FECHAMENTO,
  e fechamento tem data: o mesmo `closed_at` dentro do mesmo `monthRange` que os
  blocos 2 e 2B já usam. Mês sem nenhuma ganha mostra 0, como a Taxa de Conversão
  já mostra 0,0% no mês em que nada fechou.

  "PARADAS" MEDIA A COISA ERRADA. No original é negociação ativa que ENTROU no
  funil há mais de 30 dias (`data_entrada_funil`), ou seja, nada ali olha
  movimentação: negociação trabalhada ontem aparecia como parada por ter entrado
  há 31 dias, e negociação esquecida há meses sumia da lista se tivesse entrado
  ontem. Pior, a tela de Negociações usa a palavra "Parada" para OUTRA conta
  (`updated_at` há mais de 5 dias, Negociacoes.tsx:234), então o mesmo termo
  significava duas coisas em duas telas.

  AGORA É UM CONCEITO SÓ: parada = sem movimentação, medida por `updated_at`, a
  mesma coluna e a mesma leitura da tela de Negociações. O que separa as duas
  telas é só a RÉGUA, e ela está escrita em cada rótulo: o crachá do quadro
  avisa a partir de 5 dias ("Parada há N dias"), este bloco lista o gargalo a
  partir de 30 ("Negociações Paradas (+30 dias)"). O número da linha passa a ser
  dias SEM MOVIMENTAÇÃO — é o que a palavra sempre prometeu.

  A LISTA CONTINUA SENDO O FUNIL ATIVO INTEIRO, sem recorte de mês, pela mesma
  razão do bloco 1: é fotografia de agora.

  `updated_at` é NOT NULL no schema; o `?? created_at` da tela de Negociações é
  defesa de dado importado, não caso deste caminho.
*/
const STALLED_DAYS = 30

export function velocityMetrics(
  negotiations: NegotiationRow[],
  period: MonthYear,
  now: Date = new Date(),
): VelocityMetrics {
  const { from, to } = monthRange(period)

  /*
    `funnel_entry_date != null` É DO ORIGINAL, e não defesa nova: ele filtra
    `n.data_entrada_funil && n.data_fechamento` antes de medir o tempo de
    fechamento (DashboardComercial.jsx:245-246). A condição tinha sumido daqui
    porque a coluna era NOT NULL; a migration 0064 a tornou anulável (1
    negociação do base44 entrou sem data registrada) e ela volta ao lugar.

    Sem ela, a negociação sem data entraria no cálculo como se tivesse entrado no
    funil na virada de 1970 e o "tempo médio de fechamento" viraria dezenas de
    milhares de dias. Negociação sem data registrada não mede tempo de funil —
    fica fora da média, como no original.
  */
  const won = negotiations.filter(
    (negotiation) =>
      negotiation.status === 'won' &&
      negotiation.funnel_entry_date != null &&
      negotiation.closed_at != null &&
      negotiation.closed_at >= from &&
      negotiation.closed_at <= to,
  )

  const totalDays = won.reduce(
    (sum, negotiation) =>
      sum +
      differenceInDays(parseISO(negotiation.closed_at!), parseISO(negotiation.funnel_entry_date!)),
    0,
  )

  const stalled: StalledNegotiation[] = negotiations
    .filter((negotiation) => negotiation.status === 'active')
    .map((negotiation) => ({
      negotiation,
      daysStalled: differenceInDays(now, parseISO(negotiation.updated_at)),
    }))
    .filter((row) => row.daysStalled > STALLED_DAYS)
    .sort((a, b) => b.daysStalled - a.daysStalled)

  return {
    averageDaysToClose: won.length > 0 ? totalDays / won.length : 0,
    stalled,
  }
}

/*
  Os sete cartões clicáveis (DashboardComercial.jsx:160-218).

  BUG DO ORIGINAL CORRIGIDO, e era o mais visível desta tela: o drill-down de
  "Negociações Ganhas" filtrava a lista de PERDIDAS procurando status "Ganha"
  (linha 185) — dois conjuntos disjuntos, então a interseção é vazia por
  construção. O cartão mostrava 1 e a gaveta dizia "Nenhuma negociação
  encontrada". Agora o caso 'ganhas' devolve `closing.won`, que é exatamente o
  conjunto que o cartão conta: gaveta e cartão saem do mesmo lugar.

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
      /* Era `closing.lost.filter(status === 'won')` — o bug do original. Ver o
         cabeçalho: é o mesmo conjunto que o cartão "Negociações Ganhas" conta. */
      return closing.won
    case 'valor_ganho':
      return byValueDesc(closing.won)
    case 'perdidas':
      return closing.lost
    case 'valor_perdido':
      return byValueDesc(closing.lost)
  }
}
