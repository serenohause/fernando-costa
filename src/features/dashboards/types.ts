import type { Tables } from '@/lib/database.types'
import type { CollaboratorRole, FunnelStage, ProjectPhase } from '@/lib/enums'
import type { NegotiationRow } from '@/features/pipeline/types'
import type { ProjectRow, TaskRow } from '@/features/projects/types'
import type { ReportPeriod } from '@/features/activities/productivity'

/*
  MÓDULO 10 — os três painéis. SEM TABELA NOVA: tudo aqui é agregação sobre os
  módulos 1 a 9, e o que já é calculado no banco continua sendo lido do banco.

  O que vem de VIEW e NÃO é recalculado aqui:
  - `is_overdue` (accounts_receivable_status / accounts_payable_status, 0043/0046)
  - `progress_percent` (project_progress, 0034/0035)
  - `required_items_total` / `required_items_completed` (mesma view) — é o que o
    original chama de "projeto bloqueado".

  O que vem de função pura já escrita e não é reescrito:
  - `summarizeFinancial` (financial/hooks.ts) — os quatro cartões do financeiro
  - `periodRange`/`filterByPeriod` (activities/productivity.ts) — o recorte
    hoje/semana/mês
  - `isOverdue` (activities/list.ts), `isTaskOverdue` (projects/list.ts),
    `isExpectedCloseOverdue` (pipeline/filters.ts)

  CARTÃO DE CONTAGEM É CONTADO NO BANCO, e não somando a lista: `ActivityCounts` e
  `FunnelCounts` (mais abaixo) são o que volta de `count: 'exact'` com o critério
  no WHERE. As funções puras acima continuam sendo a régua — cada consulta em
  hooks.ts diz qual delas está reproduzindo, e a tradução foi conferida contra o
  banco. O que NÃO virou contagem (soma de valor, agregação por projeto) continua
  saindo da lista e continua com teto de 500 linhas.
*/

/* ── Roteamento de entrada (Home.jsx) ──────────────────────────────────── */

export type DashboardPage = 'Dashboard' | 'DashboardExecutivo' | 'DashboardComercial'

/*
  Onde a pessoa cai ao entrar. `MinhasAtividades` está aqui porque o
  redirecionamento do Layout (auth/access.ts) tira Arquiteto e Estagiário de
  QUALQUER um dos três painéis — no original isso acontece depois, num segundo
  salto; aqui já sai resolvido. Ver `homeTargetFor` em list.ts.
*/
export type HomeTarget = DashboardPage | 'MinhasAtividades'

/* ── Painel 1: "Dashboard Geral" (Dashboard.jsx) ───────────────────────── */

/*
  Os quatro cartões do topo, montados sobre `summarizeFinancial`.

  `forecastExpense` e `forecastResult` são calculados pelo original
  (Dashboard.jsx:120 e 129) e NÃO aparecem em cartão nenhum. Ficam porque são
  conta do painel, não invenção — quem decide mostrá-los é o usuário.
*/
export type OverviewFinancial = {
  forecastRevenue: number
  receivedRevenue: number
  forecastExpense: number
  paidExpense: number
  result: number
  forecastResult: number
}

/* "Contratos Fechados (Mês)" e "Valor Fechado (Mês)". */
export type ClosedContracts = { count: number; value: number }

/*
  "Projetos por Etapa" — os três números do bloco 4.

  OS TRÊS PARTICIONAM a lista: cada projeto cai em exatamente um, e a soma é o
  total. No original os recortes se sobrepunham e deixavam projeto de fora — ver
  `countProjectStages`.
*/
export type ProjectStageCount = { notStarted: number; inProgress: number; completed: number }

/* Uma linha de "Próximas Entregas - 15 dias". */
export type UpcomingDelivery = { task: TaskRow; daysRemaining: number }

/*
  O bloco inteiro: a lista CORTADA em 10, que é o que a tela desenha, e o total
  contado ANTES do corte, que é o que o crachá mostra. No original os dois são a
  mesma coisa e o crachá satura em "10" — ver `upcomingDeliveries`.
*/
export type UpcomingDeliveries = { items: UpcomingDelivery[]; total: number }

/* Uma linha de "Contas em Atraso". Recorte próprio, e não `ReceivableRow`: o
   bloco mostra três campos e o painel não precisa carregar a parcela inteira. */
export type OverdueReceivable = {
  id: string
  due_date: string
  value: number
  client: { id: string; name: string } | null
}

/* ── Painel 2: "Painel Executivo" (DashboardExecutivo.jsx) ─────────────── */

/*
  O select de período do painel. É o de `ReportPeriod` (Relatório de
  Produtividade) MENOS `custom`, que o painel não oferece — declarado como
  recorte do outro para que os dois nunca aceitem conjuntos diferentes de valor.
*/
export type ExecutivePeriod = Exclude<ReportPeriod, 'custom'>

export type ExecutiveFilters = {
  period: ExecutivePeriod
  /* `null` = "Todos projetos" / "Todos colaboradores", como no original. */
  projectId: string | null
  collaboratorId: string | null
}

/*
  A atividade como o painel a lê — recorte enxuto, sem os quatro embeds das telas
  de atividade: nenhum bloco RENDERIZADO do painel mostra nome de atividade,
  de colaborador ou de projeto. Só contagens.

  `deleted_at` vem de propósito: este painel é o único lugar do sistema que
  precisa distinguir atividade excluída de não excluída DENTRO da mesma consulta
  — ver `useDashboardActivities`.
*/
export type DashboardActivity = Pick<
  Tables<'activities'>,
  | 'id'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'completed_at'
  | 'deleted_at'
  | 'project_id'
  | 'collaborator_id'
  | 'priority'
  | 'total_minutes'
>

/*
  O que o BANCO conta para o bloco "Visão Geral" — cinco `count` com o critério
  no WHERE, e nenhuma linha descendo. Ver `useActivityCounts`.

  OS DOIS ÚLTIMOS NÃO SÃO CARTÃO: são as duas pontas de "Produtividade".
  `forecast` é o conjunto PREVISTO para o período (prazo dentro dele, concluída
  ou não) e `forecastCompleted` é a parte dele que foi concluída — o numerador é
  subconjunto do denominador, que é o que faz a divisão significar alguma coisa.
  No original o denominador saía do recorte por DATA DE CONCLUSÃO e o cartão
  ficava preso em 100%; ver `activityMetrics`.
*/
export type ActivityCounts = {
  inProgress: number
  completed: number
  overdue: number
  forecast: number
  forecastCompleted: number
}

/* Os quatro cartões do bloco "Visão Geral". */
export type ActivityMetrics = {
  inProgress: number
  completed: number
  overdue: number
  /* "Concluídas / previstas" do período, em %. Ver `activityMetrics`. */
  productivity: number
}

/* Uma barra do gráfico "Distribuição por Fase". */
export type PhaseCount = { phase: ProjectPhase; label: string; count: number }

export type OperationalMetrics = {
  totalProjects: number
  byPhase: PhaseCount[]
  awaitingClient: number
  atRisk: number
  blocked: number
}

/* Quem responde pelo projeto no Fluxo: a coluna `operational_responsible_id`
   quando existe, senão o responsável do card mais antigo — ver
   `projectResponsibleMap`. */
export type ProjectResponsible = { id: string; name: string }

export type CollaboratorLoad = {
  /* `'sem-responsavel'` no balde dos projetos sem responsável no card. */
  id: string
  name: string
  role: CollaboratorRole | null
  projectCount: number
  projects: ProjectRow[]
  needsAction: boolean
}

export type TeamMetrics = {
  byCollaborator: CollaboratorLoad[]
  activeProjects: number
}

/*
  O projeto como o bloco "Evolução dos Projetos" o desenha: a linha, o progresso
  vindo da VIEW e a contagem de atividades vinculadas.

  `progressPercent` é `project_progress.progress_percent` — o número que a lista
  de Projetos e o kanban já mostram. No original é `progresso_percentual`, coluna
  que o navegador gravava de volta; a migration 0035 registra por que a conta
  mudou (decisão do usuário) e por que `phase_percent` existe ao lado.
*/
export type ProjectProgressRow = {
  project: ProjectRow
  progressPercent: number
  requiredItemsTotal: number
  requiredItemsCompleted: number
  responsible: ProjectResponsible | null
  totalActivities: number
  openActivities: number
  overdueActivities: number
}

export type ProgressMetrics = {
  sorted: ProjectProgressRow[]
  averageProgress: number
  below30: number
  above80: number
}

/* ── Painel 3: "Dashboard Comercial" (DashboardComercial.jsx) ──────────── */

/*
  Os dois cartões de CONTAGEM do bloco 1, contados no banco (`useFunnelCounts`).
  Os dois de VALOR do mesmo bloco continuam saindo da lista, porque soma não é
  contagem — a ressalva inteira está em `funnelMetrics`.
*/
export type FunnelCounts = { activeCount: number; atRiskCount: number }

/* Bloco 1 — sobre TODAS as negociações ativas, sem recorte de período. */
export type FunnelMetrics = {
  activeCount: number
  totalValue: number
  averageTicket: number
  atRiskCount: number
}

/* Blocos 2 e 2B — sobre o que fechou no mês escolhido. */
export type ClosingMetrics = {
  wonCount: number
  wonValue: number
  wonAverageTicket: number
  conversionRate: number
  lostCount: number
  lostValue: number
  lossRate: number
  /* As duas listas que os drill-downs abrem. */
  won: NegotiationRow[]
  lost: NegotiationRow[]
}

/* Uma barra dos dois gráficos do bloco 3. */
export type FunnelStageTotals = {
  stage: FunnelStage
  label: string
  count: number
  value: number
}

/* Dias SEM MOVIMENTAÇÃO (`updated_at`), a mesma régua do crachá "Parada há N
   dias" da tela de Negociações — ver `velocityMetrics`. */
export type StalledNegotiation = { negotiation: NegotiationRow; daysStalled: number }

export type VelocityMetrics = {
  /* Em dias, sobre as ganhas do MÊS escolhido. */
  averageDaysToClose: number
  stalled: StalledNegotiation[]
}

/* Os sete cartões clicáveis do painel comercial. */
export type CommercialDrilldown =
  | 'ativas'
  | 'valor_em_negociacao'
  | 'em_risco'
  | 'ganhas'
  | 'valor_ganho'
  | 'perdidas'
  | 'valor_perdido'
