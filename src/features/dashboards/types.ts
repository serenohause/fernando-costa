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
  - `filterByPeriod` (activities/productivity.ts) — o recorte hoje/semana/mês
  - `isOverdue` (activities/list.ts), `isTaskOverdue` (projects/list.ts),
    `isExpectedCloseOverdue` (pipeline/filters.ts)
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

  ATENÇÃO, e é do original: os três recortes NÃO PARTICIONAM os projetos.
  Projeto "Em contrato" na fase Briefing não entra em nenhum deles; projeto
  "Concluído" na fase "Não iniciado" entra em dois. Ver `countProjectStages`.
*/
export type ProjectStageCount = { notStarted: number; inProgress: number; completed: number }

/* Uma linha de "Próximas Entregas - 15 dias". */
export type UpcomingDelivery = { task: TaskRow; daysRemaining: number }

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

/* Os quatro cartões do bloco "Visão Geral". */
export type ActivityMetrics = {
  inProgress: number
  completed: number
  overdue: number
  /* "Meta vs concluído", em %. Ver a ressalva em `activityMetrics`. */
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

/* O responsável do CARD do Fluxo do Projeto — não o do projeto. */
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

export type StalledNegotiation = { negotiation: NegotiationRow; daysInFunnel: number }

export type VelocityMetrics = {
  /* Em dias, sobre TODAS as ganhas de todos os tempos — não só as do mês. */
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
