import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  isAfter,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ActivityRow } from './types'

/*
  As contas do Relatório de Produtividade, fora do componente.

  Todas somam `total_minutes`, que é COLUNA GERADA pelo banco a partir de
  `started_at` e `completed_at` (migration 0037, item 3). No original o mesmo
  número é calculado no navegador uma única vez, no clique de Concluir, e gravado
  — o que deixa o relatório mentindo para qualquer atividade que tenha sido
  concluída por outro caminho. Aqui a soma é sempre sobre o valor que o banco
  calcula.
*/

export type ReportPeriod = 'hoje' | 'semana' | 'mes' | 'todas' | 'custom'

const hours = (minutes: number): number => Math.round((minutes / 60) * 10) / 10

/*
  "Atrasada" no relatório: a conclusão veio depois do prazo.

  DIVERGÊNCIA CONSCIENTE, do mesmo tipo que src/lib/format.ts registra. O
  original compara `new Date(a.data_conclusao_real) > new Date(a.prazo_termino)`
  (RelatorioProdutividade.jsx:133). `prazo_termino` é coluna `date`, e
  `new Date("2026-07-20")` é meia-noite EM UTC: concluir no próprio dia do prazo,
  a qualquer hora do expediente em Goiânia, já cai como atrasada — o prazo, na
  prática, vence às 21h do dia ANTERIOR.

  Aqui o prazo vence no fim do dia gravado, no fuso local, que é a mesma
  definição de atraso que as outras duas telas usam (`isOverdue` em list.ts).
  Muda o número que a tela mostra, então está no relatório do módulo.
*/
export function wasLate(activity: ActivityRow): boolean {
  if (!activity.completed_at) return false
  return isAfter(parseISO(activity.completed_at), endOfDay(parseISO(activity.end_date)))
}

/*
  O recorte por período (RelatorioProdutividade.jsx:79-103), sobre a data de
  CONCLUSÃO. "Todas" e período customizado sem as duas datas devolvem tudo, como
  no original.
*/
/*
  GENÉRICA desde o módulo 10, e não `ActivityRow[]`: o filtro de período do
  Painel Executivo (DashboardExecutivo.jsx:112-133) é este mesmo recorte, sobre
  uma linha enxuta. A função só olha `completed_at`, então é isso que ela passa a
  exigir — e "Concluídas neste mês" no painel e no Relatório de Produtividade
  viram literalmente a mesma conta, inclusive nas bordas de semana e de mês.

  UMA DIFERENÇA CONHECIDA em relação ao painel do original: lá o fim de "hoje" é
  o INSTANTE atual (`fim = today`), aqui é `endOfDay(now)`. Atividade não se
  conclui no futuro, então nenhum caso real cai entre os dois.
*/
export function filterByPeriod<T extends { completed_at: string | null }>(
  activities: T[],
  period: ReportPeriod,
  customStart: string,
  customEnd: string,
  now: Date = new Date(),
): T[] {
  const range = periodRange(period, customStart, customEnd, now)
  if (!range) return activities

  return activities.filter(
    (activity) =>
      activity.completed_at != null &&
      isWithinInterval(parseISO(activity.completed_at), range),
  )
}

/*
  AS DUAS PONTAS DO PERÍODO, SEPARADAS DO FILTRO desde a correção de contagem do
  módulo 10: o cartão "Concluídas" do Painel Executivo deixou de peneirar linhas
  no navegador e virou `count` com as mesmas duas pontas no WHERE
  (`useActivityCounts`). Extrair em vez de repetir é o ponto — início de semana
  com `locale: ptBR` (domingo) escrito duas vezes é a definição de "concluídas
  nesta semana" divergindo entre o painel e o Relatório de Produtividade sem
  ninguém mexer em nenhum dos dois.

  `null` = "não há recorte" (período "todas", ou customizado sem as duas datas),
  que é o `return activities` do original.

  `isWithinInterval` inclui as duas pontas, e é por isso que a tradução para SQL
  é `gte`/`lte` — não `gt`/`lt`.
*/
export function periodRange(
  period: ReportPeriod,
  customStart: string,
  customEnd: string,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  if (period === 'custom' && customStart && customEnd) {
    return { start: startOfDay(parseISO(customStart)), end: endOfDay(parseISO(customEnd)) }
  }
  if (period === 'hoje') return { start: startOfDay(now), end: endOfDay(now) }
  if (period === 'semana') {
    return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) }
  }
  if (period === 'mes') return { start: startOfMonth(now), end: endOfMonth(now) }
  return null
}

/* ── Cartões de métrica ────────────────────────────────────────────────── */

export type ReportMetrics = {
  totalActivities: number
  totalHours: number
  averageHours: number
  latePercent: number
}

export function reportMetrics(activities: ActivityRow[]): ReportMetrics {
  const totalActivities = activities.length
  const totalMinutes = activities.reduce((sum, activity) => sum + (activity.total_minutes ?? 0), 0)
  const averageMinutes = totalActivities > 0 ? totalMinutes / totalActivities : 0
  const late = activities.filter(wasLate).length

  return {
    totalActivities,
    totalHours: hours(totalMinutes),
    averageHours: hours(averageMinutes),
    latePercent: totalActivities > 0 ? Math.round((late / totalActivities) * 100) : 0,
  }
}

/* ── Aba "Ranking Colaboradores" ───────────────────────────────────────── */

export type CollaboratorRanking = {
  /* `DataTable` identifica a linha por `id`. */
  id: string
  position: number
  name: string
  total: number
  totalHours: number
  averageHours: number
  latePercent: number
}

/*
  A chave e o rótulo da atividade SEM RESPONSÁVEL.

  `activities.collaborator_id` deixou de ser NOT NULL na migration 0064: 1
  atividade do base44 tem responsável que não está no export de Collaborator, e
  nulo ali diz "essa pessoa não está mais cadastrada".

  ELA CONTINUA NO RANKING, num balde próprio, e não sai da lista: o cartão "Total
  de Atividades" do mesmo relatório conta essa linha, e descartá-la aqui faria a
  soma da coluna "Total" do ranking não bater com o cartão logo acima — dois
  números diferentes na mesma tela, que é o defeito que este projeto já corrigiu
  em outros lugares. O original também não descarta: ele indexa `grupos` por
  `undefined`, o que cria um grupo com nome em branco.

  "Sem responsável" é a microcopy do PRÓPRIO original para este caso
  (Dashboard.jsx:437, DashboardComercial.jsx:623), e agrupar o que não tem
  responsável num balde ao lado dos outros é o que ele faz no Painel Executivo
  ('sem-responsavel', DashboardExecutivo.jsx:376-384).

  A chave não pode ser um id de colaborador de verdade — `DataTable` identifica a
  linha por `id`, e este balde não abre cadastro nenhum.
*/
export const UNASSIGNED_ACTIVITY_ID = 'sem-responsavel'
const UNASSIGNED_ACTIVITY_NAME = 'Sem responsável'

/*
  RelatorioProdutividade.jsx:147-178. A "Posição" é calculada aqui e não no
  render: o `DataTable` deste projeto passa só a linha para a célula, e a posição
  é dado da linha — depende da ordenação, não de onde ela está sendo desenhada.
*/
export function rankByCollaborator(activities: ActivityRow[]): CollaboratorRanking[] {
  const groups = new Map<string, { name: string; total: number; minutes: number; late: number }>()

  for (const activity of activities) {
    const key = activity.collaborator_id ?? UNASSIGNED_ACTIVITY_ID
    const group = groups.get(key) ?? {
      /* Nome ATUAL do cadastro, via join — no original ele é a cópia congelada
         `colaborador_name`. */
      name:
        activity.collaborator_id == null
          ? UNASSIGNED_ACTIVITY_NAME
          : (activity.collaborator?.name ?? '—'),
      total: 0,
      minutes: 0,
      late: 0,
    }

    group.total += 1
    group.minutes += activity.total_minutes ?? 0
    if (wasLate(activity)) group.late += 1

    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      position: 0,
      name: group.name,
      total: group.total,
      totalHours: hours(group.minutes),
      averageHours: group.total > 0 ? hours(group.minutes / group.total) : 0,
      latePercent: group.total > 0 ? Math.round((group.late / group.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .map((row, index) => ({ ...row, position: index + 1 }))
}

/* ── Aba "Por Projeto" ─────────────────────────────────────────────────── */

export type ProjectProductivity = {
  id: string
  name: string
  total: number
  totalHours: number
}

/* RelatorioProdutividade.jsx:181-206. Atividade sem projeto fica de fora — é a
   atividade interna, que o original também ignora nesta aba. */
export function groupByProject(activities: ActivityRow[]): ProjectProductivity[] {
  const groups = new Map<string, { name: string; total: number; minutes: number }>()

  for (const activity of activities) {
    if (!activity.project_id) continue

    const group = groups.get(activity.project_id) ?? {
      name: activity.project?.name ?? '—',
      total: 0,
      minutes: 0,
    }
    group.total += 1
    group.minutes += activity.total_minutes ?? 0
    groups.set(activity.project_id, group)
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      name: group.name,
      total: group.total,
      totalHours: hours(group.minutes),
    }))
    .sort((a, b) => b.total - a.total)
}
