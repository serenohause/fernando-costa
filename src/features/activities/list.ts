import { format, isBefore, isThisWeek, isToday, parseISO, startOfDay } from 'date-fns'
import type { PriorityLevel, WorkStatus } from '@/lib/enums'
import type { ActivityRow } from './types'

/*
  A ordenação, os filtros e os contadores das telas de atividades, fora do
  componente.

  UMA TRADUÇÃO VALE PARA O ARQUIVO INTEIRO: `start_date` e `end_date` são colunas
  `date` e chegam como "2026-07-20". O original faz `new Date(a.prazo_termino)`,
  que lê string só-data como MEIA-NOITE EM UTC — em qualquer fuso negativo,
  Goiânia inclusive, o prazo passa a valer um dia antes do gravado, e "atrasada"
  acende um dia cedo. `parseISO` lê como meia-noite LOCAL, que é a data gravada.
  É a mesma correção já registrada em src/lib/format.ts, e pelo mesmo motivo: não
  é ajuste de layout, é dado errado na tela.
*/

/* Atividades.jsx:44-49, usada como último critério de desempate. */
const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function isOverdue(activity: ActivityRow, now: Date = new Date()): boolean {
  if (activity.status === 'completed') return false
  return isBefore(parseISO(activity.end_date), startOfDay(now))
}

/* "Data Finalização" da tela gerencial é dd/MM (Atividades.jsx:402); as outras
   duas telas mostram dd/MM/yyyy, que é `formatDateBR` de src/lib/format.ts. */
export function formatDayMonth(value: string): string {
  try {
    return format(parseISO(value), 'dd/MM')
  } catch {
    return value
  }
}

/* ── Filtros rápidos (as quatro abas) ──────────────────────────────────── */

export type QuickFilter = 'todas' | 'hoje' | 'semana' | 'atrasadas'

/*
  Atividades.jsx:234-240. A terceira condição de "hoje" é o intervalo em curso:
  começou antes de agora e ainda não venceu. Reproduzida como está — o `isToday`
  já cobre o que ela deixa de fora.
*/
function isToday_(activity: ActivityRow, now: Date): boolean {
  const start = parseISO(activity.start_date)
  const end = parseISO(activity.end_date)
  return isToday(start) || isToday(end) || (isBefore(start, now) && !isBefore(end, now))
}

function isThisWeek_(activity: ActivityRow): boolean {
  return isThisWeek(parseISO(activity.start_date)) || isThisWeek(parseISO(activity.end_date))
}

export function matchesQuickFilter(
  activity: ActivityRow,
  quickFilter: QuickFilter,
  now: Date = new Date(),
): boolean {
  if (quickFilter === 'hoje') return isToday_(activity, now)
  if (quickFilter === 'semana') return isThisWeek_(activity)
  if (quickFilter === 'atrasadas') return isOverdue(activity, now)
  return true
}

export type ActivityCounters = { hoje: number; semana: number; atrasadas: number }

export function countActivities(
  activities: ActivityRow[],
  now: Date = new Date(),
): ActivityCounters {
  return {
    hoje: activities.filter((activity) => isToday_(activity, now)).length,
    semana: activities.filter(isThisWeek_).length,
    atrasadas: activities.filter((activity) => isOverdue(activity, now)).length,
  }
}

/* ── Filtros dos quatro selects ────────────────────────────────────────── */

export type ActivityFilters = {
  quick: QuickFilter
  priority: PriorityLevel | 'all'
  collaboratorId: string | 'all'
  projectId: string | 'all'
  status: WorkStatus | 'all'
}

export function filterActivities(
  activities: ActivityRow[],
  filters: ActivityFilters,
  now: Date = new Date(),
): ActivityRow[] {
  return activities.filter((activity) => {
    if (!matchesQuickFilter(activity, filters.quick, now)) return false
    if (filters.priority !== 'all' && activity.priority !== filters.priority) return false
    if (filters.collaboratorId !== 'all' && activity.collaborator_id !== filters.collaboratorId) {
      return false
    }
    if (filters.projectId !== 'all' && activity.project_id !== filters.projectId) return false
    if (filters.status !== 'all' && activity.status !== filters.status) return false
    return true
  })
}

/* ── Ordenações ────────────────────────────────────────────────────────── */

/*
  A "ordenação inteligente" da tela gerencial (Atividades.jsx:275-296), na mesma
  ordem de critérios: atrasada primeiro, depois a posição na fila do responsável,
  depois o prazo de término, depois a prioridade.

  `execution_order` é a fila DENTRO de cada responsável (migration 0037, item 4),
  então este segundo critério mistura filas diferentes quando a lista tem gente
  variada — é o que o original faz, e é a lista gerencial, onde o desempate
  seguinte (prazo) resolve. Atividade nunca arrastada não tem posição e cai
  direto no prazo.
*/
export function sortActivities(activities: ActivityRow[], now: Date = new Date()): ActivityRow[] {
  return [...activities].sort((a, b) => {
    const aLate = isOverdue(a, now)
    const bLate = isOverdue(b, now)
    if (aLate && !bLate) return -1
    if (!aLate && bLate) return 1

    if (a.execution_order && b.execution_order) return a.execution_order - b.execution_order
    if (a.execution_order) return -1
    if (b.execution_order) return 1

    const byDeadline = parseISO(a.end_date).getTime() - parseISO(b.end_date).getTime()
    if (byDeadline !== 0) return byDeadline

    return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
  })
}

/*
  A ordenação de "Minhas Atividades" (MinhasAtividades.jsx:150-164): atrasada
  primeiro, depois o prazo mais próximo. NÃO usa `execution_order` — é a mesma
  lista, com outra ordem, como no original.

  Os dois desvios do original ali (`if (!a.prazo_termino) return 1`) não foram
  portados: `end_date` é NOT NULL na migration 0037, então aqueles ramos não
  alcançam linha nenhuma.
*/
export function sortMyActivities(activities: ActivityRow[], now: Date = new Date()): ActivityRow[] {
  return [...activities].sort((a, b) => {
    const aLate = isOverdue(a, now)
    const bLate = isOverdue(b, now)
    if (aLate && !bLate) return -1
    if (!aLate && bLate) return 1
    return parseISO(a.end_date).getTime() - parseISO(b.end_date).getTime()
  })
}

/*
  A fila de UMA pessoa, como ReordenarAtividades.jsx a monta (linhas 37-47):
  atividades abertas daquele responsável, na posição gravada, e as sem posição
  pelo prazo de término.

  Concluída fica de fora, e é o mesmo motivo do check da migration 0037 para a
  excluída: posição ocupada por linha que a tela não mostra colide na próxima
  reordenação, com erro sem causa visível.
*/
export function queueOf(activities: ActivityRow[], collaboratorId: string): ActivityRow[] {
  return activities
    .filter(
      (activity) => activity.collaborator_id === collaboratorId && activity.status !== 'completed',
    )
    .sort((a, b) => {
      if (a.execution_order && b.execution_order) return a.execution_order - b.execution_order
      if (a.execution_order) return -1
      if (b.execution_order) return 1
      return parseISO(a.end_date).getTime() - parseISO(b.end_date).getTime()
    })
}
