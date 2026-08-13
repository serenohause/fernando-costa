import { differenceInDays, parseISO } from 'date-fns'
import { PROJECT_ISSUE_STATUS } from '@/lib/enums'
import type {
  DiaryEntryRow,
  DiaryPeriod,
  DiarySummary,
  IssueStatusSlice,
  PhaseTimelineStep,
  ProjectIssueRow,
  SiteVisitRow,
  TopRequest,
} from './types'

/*
  OS INDICADORES DA ABA RESUMO, fora do componente.

  No original são oito `useMemo` dentro do JSX (ResumoTab.jsx:107-210). Mesma
  decisão de `./timeline` e `./obra`: o resultado em tela é o mesmo, e a regra de
  "o que conta como revisão" deixa de morar na tela que a desenha — o que aqui
  importa mais do que nas outras duas, porque essa regra é justamente o defeito
  10 do plano.

  Continua sendo trabalho de MEMÓRIA e não do banco: tudo depende do período
  digitado, e uma consulta por tecla seria uma requisição por tecla. As três
  listas já chegam recortadas por projeto e com teto (ver `hooks.ts`).
*/

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEFEITO 10 DO PLANO: "REVISÃO" E "MUDANÇA DE ETAPA" SAEM DE COLUNA, NÃO DE TEXTO
  ═══════════════════════════════════════════════════════════════════════════

  Na versão nova as duas seções derivadas são heurística sobre o TÍTULO:

      revisoes      = titulo.toLowerCase().includes('revisão')      (:128, :157)
      phaseTimeline = is_automatico && (titulo.includes('→') || 'Etapa:')  (:164)

  Três coisas quebram com isso, e as três são silenciosas: uma anotação manual
  chamada "Revisão do memorial" entra na conta de revisões do projeto; renomear o
  texto de um evento automático apaga um gráfico inteiro; e a seta do título é o
  único vínculo entre a linha do banco e o fato que ela descreve.

  O schema deste módulo tem as colunas para isso (migration 0069, e o COMMENT de
  `system_event` diz exatamente por quê): `system_event`, `from_phase`,
  `to_phase` e `operational_tag`. Um registro MANUAL tem `system_event` nulo — o
  check `system_event_matches_automatic` amarra os dois —, então nada digitado
  entra nestas contas, seja qual for o título.

  ⚠ AS 36 LINHAS IMPORTADAS FICAM DE FORA, E ISSO É ESPERADO. As 31 automáticas
  do base44 entraram com `system_event` (que sai do prefixo de `evento_chave`,
  determinístico) e com `from_phase`/`to_phase` NULOS de propósito: extrair a
  fase do texto do título seria plantar no dado histórico a mesma heurística que
  este defeito manda remover (COMMENT de `from_phase`). O efeito é que "Tempo por
  Etapa" e "Histórico de Revisões" ignoram o histórico antigo e passam a
  funcionar dos eventos novos em diante. É por isso que `to_phase is not null`
  aparece no filtro: sem ele, um evento antigo entraria no gráfico como um degrau
  sem etapa de destino — número errado, que é pior que seção vazia.
*/

/** Um evento de REVISÃO de projeto, pelo que o banco guarda em coluna. */
export function isRevisionEntry(entry: DiaryEntryRow): boolean {
  /*
    Os dois fatos que a heurística do original tentava pescar pelo título:
    o cartão entrou na etapa "Revisão", e a tarefa foi marcada com a tag
    operacional "Em Revisão" (o "em revisão" que ela procura em :157).
  */
  if (entry.system_event === 'phase_change') return entry.to_phase === 'revision'
  if (entry.system_event === 'tag_on') return entry.operational_tag === 'in_review'
  return false
}

/** Um evento de MUDANÇA DE ETAPA que diz para onde foi. */
function isPhaseChangeEntry(entry: DiaryEntryRow): boolean {
  return entry.system_event === 'phase_change' && entry.to_phase !== null
}

/* ── O filtro de período ───────────────────────────────────────────────── */

/*
  A data como o banco a guarda: `yyyy-MM-dd` compara como texto na mesma ordem em
  que compara como data. `resolved_at` é timestamptz e tem hora — o corte é pelo
  dia, como no original (`.split('T')[0]`, ResumoTab.jsx:98).
*/
const dayOf = (value: string) => value.slice(0, 10)

export function hasPeriodFilter(period: DiaryPeriod): boolean {
  return period.from !== '' || period.to !== ''
}

/*
  Sem filtro, tudo passa. Com filtro, passa o que está dentro — e o que NÃO TEM
  data também passa, como no original (:99): o filtro existe para recortar um
  intervalo, não para esconder o que não pode ser situado nele.
*/
export function isInPeriod(value: string | null | undefined, period: DiaryPeriod): boolean {
  if (!hasPeriodFilter(period)) return true
  if (!value) return true

  const day = dayOf(value)
  if (period.from !== '' && day < period.from) return false
  if (period.to !== '' && day > period.to) return false
  return true
}

/* ── As contas ─────────────────────────────────────────────────────────── */

/*
  Dias entre duas datas, nulo quando a segunda vem antes da primeira — o
  `safeDays` do original (ResumoTab.jsx:20-27). Data inválida cai no mesmo nulo:
  `parseISO` devolve Invalid Date e a diferença vira NaN.
*/
function daysBetween(from: string, to: string): number | null {
  const days = differenceInDays(parseISO(to), parseISO(from))
  if (!Number.isFinite(days) || days < 0) return null
  return days
}

/*
  A ordem CRESCENTE das duas seções que andam para a frente no tempo.

  O desempate por `created_at` não existe no original (que compara só a data) e
  não muda o que a tela mostra: `occurrence_date` é DATE, dois eventos do mesmo
  dia empatam, e empate sem critério deixa a lista se reembaralhar entre um
  refetch e outro — o mesmo motivo pelo qual a consulta já ordena pelos dois
  (ver `useProjectDiaryEntries`). Aqui isso importa duas vezes, porque é a ordem
  que decide de qual degrau para qual degrau os dias são contados.
*/
function byOccurrenceAsc(a: DiaryEntryRow, b: DiaryEntryRow): number {
  return (
    a.occurrence_date.localeCompare(b.occurrence_date) ||
    a.created_at.localeCompare(b.created_at)
  )
}

/*
  "TEMPO POR ETAPA" (ResumoTab.jsx:163-174): cada mudança de etapa e quantos dias
  se passaram até a próxima.

  O TÍTULO EXIBIDO É O QUE FOI GRAVADO, como lá — quem escolhe as LINHAS é a
  coluna (ver o bloco do defeito 10 no topo), e quem as rotula é o texto que o
  evento carrega. Os dois papéis são separados de propósito: mudar a redação do
  título de um evento novo muda o rótulo do degrau e não muda o gráfico.
*/
export function buildPhaseTimeline(entries: DiaryEntryRow[]): PhaseTimelineStep[] {
  const steps = entries.filter(isPhaseChangeEntry).sort(byOccurrenceAsc)

  return steps.map((entry, index) => {
    const next = steps[index + 1]
    return {
      id: entry.id,
      title: entry.title,
      date: entry.occurrence_date,
      days: next ? daysBetween(entry.occurrence_date, next.occurrence_date) : null,
    }
  })
}

/*
  "HISTÓRICO DE REVISÕES" (ResumoTab.jsx:155-160): as dez primeiras revisões, da
  mais antiga para a mais nova — a numeração "Revisão #1, #2…" que a tela desenha
  é a ordem cronológica, e por isso o corte de dez é no COMEÇO da lista.
*/
export function buildRevisionHistory(entries: DiaryEntryRow[]): DiaryEntryRow[] {
  return entries.filter(isRevisionEntry).sort(byOccurrenceAsc).slice(0, 10)
}

/*
  "ENTRADA EM OBRA", a quinta linha do painel de informações (ResumoTab.jsx:199).

  MESMO DEFEITO, MESMA CORREÇÃO: lá a linha é o primeiro registro automático cujo
  título contém "obra" — e o título de toda visita à obra começa com "🏗️ Visita à
  obra", então a data mostrada como entrada em obra costuma ser a da última
  VISITA, não a da mudança de etapa. Aqui o fato está em coluna.

  A LISTA CHEGA DA MAIS RECENTE PARA A MAIS ANTIGA e o `find` devolve a primeira
  — ou seja, a entrada em obra MAIS RECENTE, que é o que o original devolve com
  a lista ordenada por `-data_ocorrencia`. Projeto que voltou para a obra mostra
  a volta, e não a primeira vez.
*/
export function findConstructionStart(entries: DiaryEntryRow[]): string | null {
  const entry = entries.find(
    (candidate) =>
      candidate.system_event === 'phase_change' &&
      candidate.to_phase === 'under_construction',
  )
  return entry?.occurrence_date ?? null
}

/*
  "PRINCIPAIS SOLICITAÇÕES / ALTERAÇÕES" (ResumoTab.jsx:177-186): os oito títulos
  mais repetidos entre solicitações do cliente e alterações de projeto.

  O agrupamento é pelo TÍTULO porque é o que a barra mostra — e aqui isso não é
  heurística: o título é o texto que a pessoa escreveu, e o gráfico existe
  justamente para dizer qual pedido se repete.
*/
export function buildTopRequests(entries: DiaryEntryRow[]): TopRequest[] {
  const counts = new Map<string, number>()

  for (const entry of entries) {
    if (entry.entry_type !== 'client_request' && entry.entry_type !== 'project_change') {
      continue
    }
    counts.set(entry.title, (counts.get(entry.title) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }))
}

/*
  "LINHA DO TEMPO EXECUTIVA" (ResumoTab.jsx:205-210): os oito registros mais
  recentes entre os que contam a história para fora — os quatro tipos que o
  original escolhe, mais todo evento de sistema.

  `system` está na lista por outro caminho aqui: lá o tipo "Sistema" é um valor
  do mesmo campo de texto; aqui `is_automatic` e `entry_type = 'system'` são a
  mesma coisa por check (migration 0069), então basta o primeiro.
*/
const EXECUTIVE_TYPES = new Set<DiaryEntryRow['entry_type']>([
  'approval',
  'delivery',
  'client_request',
  'project_change',
])

export function buildExecutiveTimeline(entries: DiaryEntryRow[]): DiaryEntryRow[] {
  return entries
    .filter((entry) => entry.is_automatic || EXECUTIVE_TYPES.has(entry.entry_type))
    .slice(0, 8)
}

/* ── O resumo inteiro ──────────────────────────────────────────────────── */

const countFiles = (
  rows: { files: { file_kind: string }[] }[],
  kind: 'photo' | 'attachment',
) => rows.reduce((total, row) => total + row.files.filter((f) => f.file_kind === kind).length, 0)

export function buildDiarySummary({
  entries,
  visits,
  issues,
  period,
}: {
  entries: DiaryEntryRow[]
  visits: SiteVisitRow[]
  issues: ProjectIssueRow[]
  period: DiaryPeriod
}): DiarySummary {
  const filteredEntries = entries.filter((entry) => isInPeriod(entry.occurrence_date, period))
  const filteredVisits = visits.filter((visit) => isInPeriod(visit.visit_date, period))
  const filteredIssues = issues.filter((issue) => isInPeriod(issue.identified_date, period))

  const byType = (type: DiaryEntryRow['entry_type']) =>
    filteredEntries.filter((entry) => entry.entry_type === type)

  const openIssues = filteredIssues.filter((issue) => issue.status === 'open').length
  const inProgressIssues = filteredIssues.filter((issue) => issue.status === 'in_progress').length
  const resolvedIssues = filteredIssues.filter((issue) => issue.status === 'resolved').length
  const cancelledIssues = filteredIssues.filter((issue) => issue.status === 'cancelled').length

  /*
    TEMPO MÉDIO DE RESOLUÇÃO (ResumoTab.jsx:141-149). Só entra pendência resolvida
    com as duas datas — e `resolved_at` só existe em pendência resolvida, pelos
    dois sentidos do check (migration 0069), então o par nunca fica pela metade.

    Prazo negativo conta como zero, como lá: é o que o `?? 0` do original faz, e
    tirar a linha da média mudaria o denominador de uma conta que a tela mostra
    com uma casa decimal.
  */
  const resolvedWithDates = filteredIssues.filter(
    (issue) => issue.status === 'resolved' && issue.resolved_at !== null,
  )

  const averageResolutionDays =
    resolvedWithDates.length === 0
      ? null
      : (
          resolvedWithDates.reduce(
            (total, issue) =>
              total + (daysBetween(issue.identified_date, dayOf(issue.resolved_at as string)) ?? 0),
            0,
          ) / resolvedWithDates.length
        ).toFixed(1)

  /*
    A cor de cada fatia vem de token do tema (src/index.css), e não do hex fixo
    de ResumoTab.jsx:191-194 — mesmo caminho já usado no gráfico do módulo 10. Os
    valores são os mesmos: rose-500, amber-500, emerald-500 e slate-400.

    Fatia com zero fica de fora, como lá: uma legenda com "Canceladas 0" ocupa o
    mesmo espaço de uma que existe.
  */
  const issuePie: IssueStatusSlice[] = [
    { name: PROJECT_ISSUE_STATUS.open, value: openIssues, color: 'var(--color-chart-rose)' },
    {
      name: PROJECT_ISSUE_STATUS.in_progress,
      value: inProgressIssues,
      color: 'var(--color-chart-amber)',
    },
    {
      name: PROJECT_ISSUE_STATUS.resolved,
      value: resolvedIssues,
      color: 'var(--color-chart-emerald)',
    },
    {
      name: PROJECT_ISSUE_STATUS.cancelled,
      value: cancelledIssues,
      color: 'var(--color-chart-slate)',
    },
  ].filter((slice) => slice.value > 0)

  return {
    entries: filteredEntries,
    visits: filteredVisits,
    issues: filteredIssues,

    requests: byType('client_request'),
    changes: byType('project_change'),
    approvals: byType('approval'),
    revisions: filteredEntries.filter(isRevisionEntry),

    /*
      As fotos são as das VISITAS e das PENDÊNCIAS, e os arquivos somam também os
      dos registros da linha do tempo — o recorte de ResumoTab.jsx:129-133, onde
      a entrada de diário tem `anexos` e não tem `fotos`. O que lá era o NOME do
      array aqui é `file_kind` (migration 0068).
    */
    photoCount: countFiles(filteredVisits, 'photo') + countFiles(filteredIssues, 'photo'),
    attachmentCount:
      countFiles(filteredVisits, 'attachment') +
      countFiles(filteredIssues, 'attachment') +
      countFiles(filteredEntries, 'attachment'),

    openIssues,
    inProgressIssues,
    resolvedIssues,
    cancelledIssues,

    resolutionRate:
      filteredIssues.length === 0
        ? null
        : Math.round((resolvedIssues / filteredIssues.length) * 100),
    averageResolutionDays,

    issuePie,
    topRequests: buildTopRequests(filteredEntries),

    /* As quatro que ignoram o período — ver o comentário de `DiarySummary`. */
    revisionHistory: buildRevisionHistory(entries),
    phaseTimeline: buildPhaseTimeline(entries),
    constructionStartDate: findConstructionStart(entries),

    executiveTimeline: buildExecutiveTimeline(filteredEntries),
  }
}
