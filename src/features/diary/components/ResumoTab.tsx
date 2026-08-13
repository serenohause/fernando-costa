import { useMemo, useState, type ComponentType } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Clock,
  FileDown,
  FileText,
  Filter,
  HardHat,
  Image,
  RefreshCw,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ErrorState from '@/components/shared/ErrorState'
import { AXIS_TICK_FILL } from '@/features/dashboards/chart-theme'
import { formatDateBR } from '@/lib/format'
import { PROJECT_PHASE, PROJECT_STATUS, labelOf } from '@/lib/enums'
import { buildDiarySummary, hasPeriodFilter } from '../resumo'
import RelatorioPDFModal from './RelatorioPDFModal'
import { RESUMO_STAT_CARD, type ResumoStatColor } from './diary-styles'
import type {
  DiaryEntryRow,
  DiaryPeriod,
  DiaryProject,
  ProjectIssueRow,
  SiteVisitRow,
} from '../types'

/*
  Porta de nova-versao/src/components/diary/resumo/ResumoTab.jsx.

  O filtro de período com os dois campos e o aviso amarelo, o painel de
  informações do projeto, os seis indicadores, o bloco de pendências com os
  quatro contadores, a taxa de resolução com a barrinha, o tempo médio, o gráfico
  de pizza, o bloco de obra, o histórico de revisões, o gráfico de barras das
  principais solicitações, a linha do tempo executiva com o "Ver histórico
  completo", o "Tempo por Etapa" e o botão fixo de gerar relatório são os da
  versão nova, na mesma ordem e com o mesmo microcopy.

  ═══ O QUE MUDA EM RELAÇÃO À VERSÃO NOVA, E POR QUÊ ═══

  1. AS CONTAS SAÍRAM DO COMPONENTE para `../resumo`. Lá são oito `useMemo`
     dentro do JSX; aqui a tela recebe o resumo pronto. Mesmo resultado, e a
     regra deixa de morar na tela que a desenha.
  2. DEFEITO 10 DO PLANO: "Histórico de Revisões", "Tempo por Etapa" e a linha
     "Entrada em Obra" deixam de ser adivinhação sobre o TEXTO do título e passam
     a sair das colunas `system_event`, `to_phase` e `operational_tag`. O motivo
     inteiro está em `../resumo`; o efeito visível é que uma anotação manual
     chamada "Revisão do memorial" não entra mais na conta de revisões do
     projeto. ⚠ As 36 linhas importadas do base44 não têm `from_phase`/`to_phase`
     (de propósito, ver a migration 0069), então as duas seções derivadas contam
     dos eventos novos em diante — e não quebram nem contam errado por causa
     delas.
  3. AS TRÊS CONSULTAS chegam por prop, feitas uma vez pela gaveta. Lá esta aba
     refaz as três que as outras já fizeram.
  4. TRÊS ESTADOS, e não dois: a versão nova só distingue carregando e vazio, e
     falha de leitura deixa a aba com todos os indicadores em zero — que é a
     mesma tela de um projeto sem nenhum registro.
  5. AS CORES DOS GRÁFICOS vêm de token do tema (`--chart-rose` e companhia em
     src/index.css) e não de hex dentro do componente, como já foi feito no
     gráfico do módulo 10. Os valores são os mesmos.
  6. QUEM GERA RELATÓRIO é `useCanWriteProjectDiary()`, que a gaveta já leu e
     passa por prop — a mesma regra de `is_project_diary_writer()` (migration
     0070), e não uma segunda regra escrita aqui.
*/

/* ── Os dois blocos de apoio, como no original ─────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  color = 'slate',
  icon: Icon,
}: {
  label: string
  value: number | string | null
  sub?: string
  color?: ResumoStatColor
  icon?: ComponentType<{ className?: string }>
}) {
  return (
    <div className={`rounded-xl border p-3 ${RESUMO_STAT_CARD[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70 leading-tight">
          {label}
        </span>
        {Icon && <Icon className="w-3.5 h-3.5 opacity-50" />}
      </div>
      <div className="text-2xl font-bold leading-none">{value ?? '—'}</div>
      {sub && <div className="text-[10px] mt-1 opacity-70 leading-tight">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold tracking-widest text-faint uppercase whitespace-nowrap">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

/*
  O BALÃO DO TOOLTIP E O TEXTO DOS EIXOS NO TEMA ESCURO — reparo, não redesenho.

  O recharts pinta o balão de branco e o rótulo do eixo com `#666` por atributo
  embutido, o que no escuro dá um retângulo branco com texto claro dentro. É
  exatamente o mesmo conserto do módulo 10 (ver PhaseDistributionChart e
  `AXIS_TICK_FILL`), e no tema claro nada muda: o valor do token é o próprio
  `#666`.
*/
const CHART_TOOLTIP_FIX =
  'dark:[&_.recharts-default-tooltip]:!border-border dark:[&_.recharts-default-tooltip]:!bg-card'

export default function ResumoTab({
  project,
  entries,
  visits,
  issues,
  isLoading,
  error,
  onRetry,
  canEdit,
  onSwitchTab,
}: {
  project: DiaryProject
  entries: DiaryEntryRow[]
  visits: SiteVisitRow[]
  issues: ProjectIssueRow[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
  canEdit: boolean
  onSwitchTab: (tab: 'timeline') => void
}) {
  const [period, setPeriod] = useState<DiaryPeriod>({ from: '', to: '' })
  const [reportOpen, setReportOpen] = useState(false)

  const summary = useMemo(
    () => buildDiarySummary({ entries, visits, issues, period }),
    [entries, visits, issues, period],
  )

  const filtered = hasPeriodFilter(period)

  if (error) {
    return (
      <ErrorState
        title="Não foi possível carregar o resumo"
        description="Os registros, as visitas e as pendências deste projeto não puderam ser lidos agora."
        error={error}
        onRetry={onRetry}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((placeholder) => (
          <div key={placeholder} className="h-20 animate-pulse bg-muted rounded-xl" />
        ))}
      </div>
    )
  }

  /* As seis linhas do painel, e cada uma some quando não há o que mostrar —
     como no original (ResumoTab.jsx:261). */
  const info: [string, string | null][] = [
    ['Cliente', project.client?.name ?? null],
    ['Responsável', project.responsible?.name ?? null],
    ['Etapa atual', project.current_phase ? labelOf(PROJECT_PHASE, project.current_phase) : null],
    ['Data de início', project.start_date ? formatDateBR(project.start_date) : null],
    [
      'Entrada em Obra',
      summary.constructionStartDate ? formatDateBR(summary.constructionStartDate) : null,
    ],
    ['Status', project.status ? labelOf(PROJECT_STATUS, project.status) : null],
  ]

  return (
    <div className="space-y-6">
      {/* ── Filtro de período ── */}
      <div className="bg-elevated border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-soft">Filtrar por período</span>
          {filtered && (
            <button
              onClick={() => setPeriod({ from: '', to: '' })}
              className="ml-auto flex items-center gap-1 text-xs text-faint hover:text-soft transition-colors"
            >
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground block mb-1">De</label>
            <Input
              type="date"
              value={period.from}
              onChange={(event) =>
                setPeriod((current) => ({ ...current, from: event.target.value }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground block mb-1">Até</label>
            <Input
              type="date"
              value={period.to}
              onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
              className="h-7 text-xs"
            />
          </div>
        </div>
        {filtered && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
            ⚠️ Indicadores refletem somente o período filtrado.
          </p>
        )}
      </div>

      {/* ── Info do projeto ── */}
      <div>
        <SectionTitle>Informações do Projeto</SectionTitle>
        <div className="bg-card rounded-xl border border-border divide-y divide-border text-sm">
          {info.map(([label, value]) =>
            value ? (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-foreground">{value}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>

      {/* ── Indicadores gerais ── */}
      <div>
        <SectionTitle>Indicadores</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatCard
            label="Total de registros"
            value={summary.entries.length}
            color="slate"
            icon={BookOpen}
          />
          <StatCard
            label="Solicitações cliente"
            value={summary.requests.length}
            sub={`${
              summary.requests.filter((entry) => entry.status === 'completed').length
            } concluídas`}
            color="amber"
            icon={Users}
          />
          <StatCard
            label="Alterações"
            value={summary.changes.length}
            sub={`${
              summary.changes.filter((entry) => entry.status === 'completed').length
            } concluídas`}
            color="violet"
            icon={RefreshCw}
          />
          <StatCard
            label="Aprovações"
            value={summary.approvals.length}
            color="emerald"
            icon={CheckCircle}
          />
          <StatCard
            label="Revisões"
            value={summary.revisions.length}
            color="sky"
            icon={TrendingUp}
          />
          <StatCard
            label="Visitas à obra"
            value={summary.visits.length}
            color="orange"
            icon={HardHat}
          />
        </div>
      </div>

      {/* ── Pendências ── */}
      <div>
        <SectionTitle>Pendências</SectionTitle>
        {summary.issues.length === 0 ? (
          <p className="text-xs text-faint text-center py-4">Sem pendências registradas.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard
                label="Abertas"
                value={summary.openIssues}
                color="rose"
                icon={AlertCircle}
              />
              <StatCard
                label="Em andamento"
                value={summary.inProgressIssues}
                color="amber"
                icon={Clock}
              />
              <StatCard
                label="Resolvidas"
                value={summary.resolvedIssues}
                color="emerald"
                icon={CheckCircle}
              />
              <StatCard label="Canceladas" value={summary.cancelledIssues} color="slate" icon={X} />
            </div>

            <div className="flex gap-4">
              <div className="flex-1 bg-card rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">Taxa de resolução</p>
                {summary.resolutionRate !== null ? (
                  <>
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      {summary.resolutionRate}%
                    </p>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all"
                        style={{ width: `${summary.resolutionRate}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-faint">—</p>
                )}
              </div>
              <div className="flex-1 bg-card rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">Tempo médio resolução</p>
                {summary.averageResolutionDays !== null ? (
                  <>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {summary.averageResolutionDays}
                    </p>
                    <p className="text-[10px] text-faint">dias</p>
                  </>
                ) : (
                  <p className="text-xs text-faint">Dados insuficientes</p>
                )}
              </div>
            </div>

            {summary.issuePie.length > 0 && (
              <div className={`bg-card rounded-xl border border-border p-3 ${CHART_TOOLTIP_FIX}`}>
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  Distribuição por status
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={summary.issuePie}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      dataKey="value"
                      label={({ value }) => `${value}`}
                    >
                      {summary.issuePie.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Legend iconSize={10} wrapperStyle={{ fontSize: '10px' }} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Obra ── */}
      <div>
        <SectionTitle>Obra</SectionTitle>
        {summary.visits.length === 0 && summary.issues.length === 0 ? (
          <p className="text-xs text-faint text-center py-4 bg-elevated rounded-xl border border-border">
            Projeto ainda não entrou em obra.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard label="Visitas" value={summary.visits.length} color="blue" icon={HardHat} />
            <StatCard label="Total fotos" value={summary.photoCount} color="slate" icon={Image} />
            <StatCard
              label="Arquivos"
              value={summary.attachmentCount}
              color="slate"
              icon={FileText}
            />
          </div>
        )}
      </div>

      {/* ── Histórico de revisões ── */}
      {summary.revisionHistory.length > 0 && (
        <div>
          <SectionTitle>Histórico de Revisões</SectionTitle>
          <div className="space-y-2">
            {summary.revisionHistory.map((entry, index) => (
              <div
                key={entry.id}
                className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900 rounded-xl px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                    Revisão #{index + 1}
                  </span>
                  <span className="text-[10px] text-sky-500 dark:text-sky-500">
                    {formatDateBR(entry.occurrence_date)}
                  </span>
                </div>
                <p className="text-xs text-sky-800 dark:text-sky-300 mt-1">{entry.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gráfico: solicitações por título ── */}
      {summary.topRequests.length > 0 && (
        <div>
          <SectionTitle>Principais Solicitações / Alterações</SectionTitle>
          <div className={`bg-card rounded-xl border border-border p-3 ${CHART_TOOLTIP_FIX}`}>
            <ResponsiveContainer
              width="100%"
              height={Math.max(120, summary.topRequests.length * 28)}
            >
              <BarChart
                data={summary.topRequests}
                layout="vertical"
                margin={{ left: 0, right: 20, top: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: AXIS_TICK_FILL }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: AXIS_TICK_FILL }}
                  width={140}
                />
                <Tooltip />
                <Bar dataKey="count" fill="var(--color-chart-indigo)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Linha do tempo executiva ── */}
      {summary.executiveTimeline.length > 0 && (
        <div>
          <SectionTitle>Linha do Tempo Executiva</SectionTitle>
          <div className="space-y-2">
            {summary.executiveTimeline.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="shrink-0 w-2 h-2 rounded-full bg-faint mt-1.5" />
                <div className="flex-1 bg-card rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground leading-tight">
                      {entry.title}
                    </p>
                    <span className="text-[10px] text-faint shrink-0">
                      {formatDateBR(entry.occurrence_date)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => onSwitchTab('timeline')}
            className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-soft transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Ver histórico completo
          </button>
        </div>
      )}

      {/* ── Tempo por etapa ── */}
      {summary.phaseTimeline.length > 0 && (
        <div>
          <SectionTitle>Tempo por Etapa</SectionTitle>
          <div className="space-y-1.5">
            {summary.phaseTimeline.map((step) => (
              <div
                key={step.id}
                className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
              >
                <p className="text-xs text-soft">{step.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-faint">{formatDateBR(step.date)}</span>
                  {step.days !== null && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-elevated text-muted-foreground border-border"
                    >
                      {step.days}d
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gerar relatório ── */}
      {/* `bg-linear-to-t` é o `bg-gradient-to-t` do original escrito no nome que
          o Tailwind v4 usa — mesmo degradê. */}
      {canEdit && (
        <div className="sticky bottom-0 bg-linear-to-t from-card via-card to-transparent pt-4 pb-2">
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            onClick={() => setReportOpen(true)}
          >
            <FileDown className="w-4 h-4" />
            Gerar Relatório
          </Button>
        </div>
      )}

      <RelatorioPDFModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        project={project}
        entries={entries}
        visits={visits}
        issues={issues}
      />
    </div>
  )
}
