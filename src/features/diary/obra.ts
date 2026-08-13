import {
  PROJECT_ISSUE_CATEGORY,
  SITE_VISIT_TYPE,
} from '@/lib/enums'
import type {
  DiaryPhotoGroup,
  ProjectIssueFilters,
  ProjectIssueRow,
  SiteVisitFilters,
  SiteVisitRow,
} from './types'

/*
  AS BUSCAS, OS FILTROS E O AGRUPAMENTO DAS ABAS DE OBRA, fora do componente.

  No original os três são `useMemo` dentro das abas (ObraTab.jsx:149-159,
  PendenciasTab.jsx:109-119, FotosTab.jsx:27-56). O resultado em tela é o mesmo; o
  que muda é que a regra deixa de morar no JSX que a desenha — mesma decisão de
  `./timeline` na fatia 1.

  Continua sendo trabalho de MEMÓRIA e não do banco: os filtros dependem do que
  foi digitado, e uma consulta por tecla seria uma requisição por tecla. A
  consulta já chega recortada por projeto e com teto.
*/

/*
  O casamento da busca de VISITAS. Os quatro campos são os do original
  (ObraTab.jsx:155): resumo, observações, nome do responsável e o TIPO — este
  pelo rótulo em português, que é o texto que a pessoa vê e portanto o que ela
  digita. Lá o teste é sobre `tipo_visita`, que já É o rótulo; aqui a coluna
  guarda `follow_up`, então buscar por "acompanhamento" exige o mapa.
*/
function matchesVisitSearch(visit: SiteVisitRow, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (query === '') return true

  const fields = [
    visit.summary,
    visit.notes,
    visit.responsible?.name ?? null,
    SITE_VISIT_TYPE[visit.visit_type],
  ]

  return fields.some((field) => field?.toLowerCase().includes(query))
}

export function filterSiteVisits(
  visits: SiteVisitRow[],
  filters: SiteVisitFilters,
): SiteVisitRow[] {
  return visits.filter((visit) => {
    if (filters.type !== 'all' && visit.visit_type !== filters.type) return false
    if (filters.status !== 'all' && visit.status !== filters.status) return false
    return matchesVisitSearch(visit, filters.search)
  })
}

/*
  O casamento da busca de PENDÊNCIAS: descrição, categoria (pelo rótulo), nome do
  responsável e observações (PendenciasTab.jsx:115).
*/
function matchesIssueSearch(issue: ProjectIssueRow, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (query === '') return true

  const fields = [
    issue.description,
    PROJECT_ISSUE_CATEGORY[issue.category],
    issue.responsible?.name ?? null,
    issue.notes,
  ]

  return fields.some((field) => field?.toLowerCase().includes(query))
}

export function filterProjectIssues(
  issues: ProjectIssueRow[],
  filters: ProjectIssueFilters,
): ProjectIssueRow[] {
  return issues.filter((issue) => {
    if (filters.status !== 'all' && issue.status !== filters.status) return false
    if (filters.category !== 'all' && issue.category !== filters.category) return false
    return matchesIssueSearch(issue, filters.search)
  })
}

/*
  "PENDÊNCIA COM PRAZO VENCIDO" — a borda vermelha do cartão, o crachá "⚠️ Prazo
  vencido" e o prazo em vermelho (PendenciasTab.jsx:126).

  A COMPARAÇÃO NÃO É A LITERAL DO ORIGINAL, e é a única regra desta fatia que se
  afasta dele de propósito. Lá é `new Date(issue.prazo) < new Date()`: `due_date` é
  coluna `date`, `new Date("2026-08-13")` é meia-noite EM UTC, e em Goiânia isso
  faz a pendência que vence HOJE aparecer vencida desde as 21h de ontem — prazo
  que ainda não passou pintado de vermelho, num cartão cuja única função é dizer o
  que já passou do prazo.

  Aqui a comparação é entre DATAS, texto com texto no formato do banco
  (`yyyy-MM-dd` ordena como data), e vencido é "o prazo é anterior a hoje".

  POR QUE AQUI SIM E EM `isTaskOverdue` NÃO: aquele crachá está no ar desde o
  módulo 5, e corrigir só um lado faria o Painel Executivo dizer "3 projetos em
  risco" com o quadro mostrando 4 cartões vermelhos (ver o comentário em
  projects/list.ts). Esta tela é nova e não tem par para desencontrar; nascer com
  o erro seria plantá-lo.
*/
export function isIssueOverdue(
  issue: Pick<ProjectIssueRow, 'due_date' | 'status'>,
  today: string = todayISODate(),
): boolean {
  if (!issue.due_date) return false
  if (issue.status === 'resolved' || issue.status === 'cancelled') return false
  return issue.due_date < today
}

/*
  Hoje e agora NO RELÓGIO DE QUEM ESTÁ USANDO O SISTEMA, no formato do banco.

  São eles que carimbam o evento automático das abas de obra, e não o relógio do
  servidor: o banco roda em UTC e a pessoa não — às 21h de Goiânia já é o dia
  seguinte em UTC, e a faixa de dia da linha do tempo mostraria o evento no dia
  errado. É a mesma escolha do original (diaryAutoEvents.js:28-29, que grava
  `format(new Date(), ...)` do navegador) e o motivo pelo qual
  `record_project_diary_event` recebe os dois por parâmetro (cabeçalho da 0070).
*/
export function todayISODate(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function nowClockTime(now: Date = new Date()): string {
  const hours = `${now.getHours()}`.padStart(2, '0')
  const minutes = `${now.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

/*
  A GALERIA DA ABA FOTOS (FotosTab.jsx:27-56): um grupo por REGISTRO — visita ou
  pendência —, do mais recente para o mais antigo, com as fotos de cada um.

  É AQUI QUE A TABELA ÚNICA SE PAGA. No base44 são dois arrays em duas entidades
  diferentes, e a aba os junta em memória; aqui as fotos das duas mães são linhas
  da mesma tabela, e o que sobra para a tela é agrupar o que já veio junto com
  cada registro.

  O REGISTRO SEM FOTO NÃO VIRA GRUPO, como lá: o `.filter` de origem existe para
  que a galeria não desenhe uma faixa de data com nada embaixo.

  A ORDEM É POR DATA DECRESCENTE, comparada como texto — `yyyy-MM-dd` ordena
  igual à data, e é o mesmo `localeCompare` do original.
*/
export function buildPhotoGroups(
  visits: SiteVisitRow[],
  issues: ProjectIssueRow[],
): DiaryPhotoGroup[] {
  const visitGroups: DiaryPhotoGroup[] = visits
    .map((visit) => ({
      id: visit.id,
      label: SITE_VISIT_TYPE[visit.visit_type],
      date: visit.visit_date,
      responsible: visit.responsible?.name ?? null,
      photos: visit.files.filter((file) => file.file_kind === 'photo'),
      caption: {
        title: visit.summary,
        subtitle: SITE_VISIT_TYPE[visit.visit_type],
      },
    }))
    .filter((group) => group.photos.length > 0)

  const issueGroups: DiaryPhotoGroup[] = issues
    .map((issue) => ({
      id: issue.id,
      label: `Pendência #${issue.issue_number} — ${PROJECT_ISSUE_CATEGORY[issue.category]}`,
      date: issue.identified_date,
      responsible: issue.responsible?.name ?? null,
      photos: issue.files.filter((file) => file.file_kind === 'photo'),
      /* O lightbox aberto por uma pendência mostra "Pendência #3" na linha de
         cima e nada na de baixo — no original o `source` da pendência só tem
         `resumo` (FotosTab.jsx:50). */
      caption: { title: `Pendência #${issue.issue_number}`, subtitle: null },
    }))
    .filter((group) => group.photos.length > 0)

  return [...visitGroups, ...issueGroups].sort((a, b) => b.date.localeCompare(a.date))
}
