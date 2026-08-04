import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  FileText,
  FolderKanban,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { format, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TASK_PRIORITY, labelOf, type TaskPriority } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import type { MonthYear } from '@/features/financial/types'
import { useOverviewDashboard } from '../hooks'
import StatsCard from './StatsCard'

/*
  Porta de projeto-original/src/pages/Dashboard.jsx — o "Dashboard Geral".

  Os cinco blocos, na ordem do original: os quatro cartões financeiros do mês
  escolhido, o alerta de contas em atraso, a performance comercial do mês, os
  projetos por etapa e as próximas entregas de 15 dias. Cabeçalho com o seletor
  de mês à direita, `space-y-8` entre blocos, grades 1 / md:2 / lg:4 e 1 / md:2,
  microcopy idêntico.

  NENHUMA CONTA MORA AQUI. Tudo vem de `useOverviewDashboard`, e cada número
  está documentado em features/dashboards/list.ts ao lado da linha do original
  que ele reproduz — inclusive os defeitos preservados, resumidos abaixo onde
  aparecem na tela.

  DOIS BLOCOS DO ORIGINAL NÃO EXISTEM E NUNCA EXISTIRAM: `FinancialChart` e
  `TopList` são importados por Dashboard.jsx (linhas 19-20) e não são
  renderizados em lugar nenhum. As agregações que os alimentariam (seis meses de
  receita/despesa, top 5 clientes, top 5 projetos) são código morto no original e
  não foram portadas.

  PERMISSÃO: esta tela não escreve nada — não há botão, formulário ou menu de
  ação para esconder. Quem decide se o item "Visão Geral" (`dashboard_overview`,
  migration 0004) aparece na barra lateral é `useAppNavigation`, e quem decide o
  que cada linha devolve é a RLS. O bloco financeiro tem LEITURA LARGA por
  decisão registrada na migration 0042: receita, despesa e resultado do mês
  aparecem para quem tem o menu do painel, mesmo sem `receivables`/`payables` na
  barra lateral. É o comportamento aceito; a tela não inventa uma trava que o
  banco não tem.
*/

/* Os 12 meses do seletor, do atual para trás (Dashboard.jsx:246-256). */
type MonthOption = { value: string; label: string }

function buildMonthOptions(now: Date): MonthOption[] {
  const options: MonthOption[] = []
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i)
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    })
  }
  return options
}

/* `yyyy-MM` do seletor para o recorte que os hooks do financeiro usam. `month`
   é 0-11, como `Date.getMonth()` — ver MonthYear em financial/types.ts. */
function monthYearOfValue(value: string): MonthYear {
  const [year, month] = value.split('-')
  return { year: Number(year), month: Number(month) - 1 }
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'))

  const monthOptions = useMemo(() => buildMonthOptions(new Date()), [])
  const period = useMemo(() => monthYearOfValue(selectedMonth), [selectedMonth])

  const {
    financial,
    overdueReceivables,
    contractsClosed,
    projectStages,
    upcomingDeliveries,
    isLoadingFinancial,
    isError,
    error,
  } = useOverviewDashboard(period)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard Geral</h1>
          <p className="text-muted-foreground mt-1">Visão executiva consolidada</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label.charAt(0).toUpperCase() + option.label.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        O TERCEIRO ESTADO, que o original não tem: lá, falha de leitura só vai
        para o `console.error` de cada consulta e a tela desenha o painel inteiro
        zerado — "R$ 0,00 de receita" e "nenhuma conta em atraso" ficam
        indistinguíveis de "não deu para carregar". Um painel que mente com
        confiança é pior que um painel que não abre.

        `invalidateQueries()` sem chave porque o painel cruza seis consultas de
        cinco módulos; é a mesma coisa que o gesto de puxar-para-atualizar do
        AppLayout já dispara nesta página.
      */}
      {isError ? (
        <ErrorState
          title="Não foi possível carregar o painel"
          description="Os números do painel não puderam ser lidos agora."
          error={error}
          onRetry={() => {
            void queryClient.invalidateQueries()
          }}
        />
      ) : (
        <>
          {/* BLOCO 1 - Resumo Financeiro (Destaque) */}
          {/*
            O ESQUELETO COBRE SÓ ESTE BLOCO, e é do original (Dashboard.jsx:101):
            `isLoading` lá é recebíveis + pagamentos, e os outros quatro blocos
            são desenhados na hora, com zero e com as caixas de "nenhum" enquanto
            o dado não chegou. `isLoadingFinancial` é exatamente esse recorte.
          */}
          {isLoadingFinancial ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatsCard
                title="Receita Prevista"
                value={formatCurrencyBRL(financial.forecastRevenue)}
                icon={ArrowDownCircle}
                color="blue"
              />
              <StatsCard
                title="Receita Recebida"
                value={formatCurrencyBRL(financial.receivedRevenue)}
                icon={TrendingUp}
                color="green"
                trend={financial.receivedRevenue > 0 ? 'up' : undefined}
              />
              <StatsCard
                title="Despesas Pagas"
                value={formatCurrencyBRL(financial.paidExpense)}
                icon={ArrowUpCircle}
                color="red"
              />
              {/* O cartão de Resultado ganha um fundo levemente mais escuro atrás
                  dele — é o destaque do original (Dashboard.jsx:311-312). O
                  slate-900 daquele degradê é `primary` ao pixel no tema claro
                  (ver src/index.css); no escuro ele inverte, e a marca d'água
                  continua aparecendo por cima do fundo escuro. */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl -z-10"></div>
                <StatsCard
                  title="Resultado"
                  value={formatCurrencyBRL(financial.result)}
                  icon={Wallet}
                  color={financial.result >= 0 ? 'green' : 'red'}
                  trend={financial.result >= 0 ? 'up' : 'down'}
                />
              </div>
            </div>
          )}

          {/* BLOCO 2 - Alertas Financeiros */}
          <Card className="border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <div className="p-2 bg-rose-100 dark:bg-rose-950/40 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </div>
                Contas em Atraso
                {/*
                  ESTE NÚMERO SATURA EM 5, e é do original: lá a lista é cortada
                  em cinco (Dashboard.jsx:188) ANTES de o crachá medir o tamanho
                  dela (linha 333), então quarenta parcelas vencidas mostram "5".
                  A consulta reproduz o mesmo teto (ver `useOverdueReceivables`).
                  Reproduzido de propósito e reportado: corrigir é uma segunda
                  consulta de contagem, e é decisão do usuário.
                */}
                <span className="ml-auto text-xs font-normal bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 px-2 py-1 rounded-full">
                  {overdueReceivables.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overdueReceivables.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-soft text-sm">Nenhuma conta em atraso</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Cinco vêm, três aparecem — também é o original (linha 344). */}
                  {overdueReceivables.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-card rounded-lg border border-rose-100 dark:border-rose-900"
                    >
                      <div className="flex-1">
                        {/* Nome ATUAL do cadastro, via embed: no original é a
                            cópia `client_name`, congelada quando a parcela
                            nasceu. */}
                        <p className="font-medium text-foreground text-sm">
                          {item.client?.name ?? 'Sem cliente'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Vencimento: {formatDateBR(item.due_date)}
                        </p>
                      </div>
                      <span className="font-semibold text-foreground ml-4">
                        {formatCurrencyBRL(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* BLOCO 3 - Performance Comercial do Mês */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Performance Comercial
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/*
                DIVERGÊNCIA DE UM DIA EM RELAÇÃO AO ORIGINAL, registrada em
                `closedContractsIn`: lá a data de assinatura é comparada com
                `new Date`, que lê a coluna `date` como meia-noite UTC — contrato
                assinado no dia 1 não conta no mês dele e conta no anterior. Aqui
                a comparação é de texto `YYYY-MM-DD`, sem fuso no meio.
              */}
              <StatsCard
                title="Contratos Fechados (Mês)"
                value={contractsClosed.count.toString()}
                icon={FileText}
                color="green"
              />
              <StatsCard
                title="Valor Fechado (Mês)"
                value={formatCurrencyBRL(contractsClosed.value)}
                icon={TrendingUp}
                color="green"
                trend={contractsClosed.value > 0 ? 'up' : undefined}
              />
            </div>
          </div>

          {/* BLOCO 4 - Status Operacional */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <div className="p-2 bg-violet-100 dark:bg-violet-950/40 rounded-lg">
                  <FolderKanban className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                Projetos por Etapa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/*
                OS TRÊS NÚMEROS NÃO PARTICIONAM OS PROJETOS, e é do original
                (ver `countProjectStages`): projeto "Em contrato" na fase
                Briefing não entra em nenhum deles, e projeto "Concluído" cuja
                fase ainda é "Não iniciado" entra em dois. Somar os três não dá o
                total de projetos. Reproduzido e reportado.
              */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-elevated rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{projectStages.notStarted}</p>
                  <p className="text-xs text-soft mt-1">Não iniciado</p>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {projectStages.inProgress}
                  </p>
                  <p className="text-xs text-soft mt-1">Em andamento</p>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/40 rounded-lg">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {projectStages.completed}
                  </p>
                  <p className="text-xs text-soft mt-1">Finalizado</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BLOCO 5 - Próximas Entregas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-950/40 rounded-lg">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                Próximas Entregas - 15 dias
                {/* Mesmo teto do bloco de atraso, com outro número: a lista é
                    cortada em 10, então o crachá satura em "10". */}
                <span className="ml-auto text-xs font-normal bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full">
                  {upcomingDeliveries.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingDeliveries.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-soft text-sm">Nenhuma entrega próxima</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Dez vêm, três aparecem — original (linha 430). */}
                  {upcomingDeliveries.slice(0, 3).map(({ task, daysRemaining }) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 bg-elevated rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground text-sm">
                          {task.project?.name ?? 'Sem projeto'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateBR(task.due_date)} •{' '}
                          {task.responsible?.name ?? 'Sem responsável'}
                        </p>
                        {/* O original condiciona o crachá a `task.priority`
                            (linha 439); a coluna é NOT NULL no schema, então o
                            crachá está sempre lá. */}
                        <div className="mt-1">
                          <StatusBadge
                            status={labelOf(TASK_PRIORITY, task.priority as TaskPriority)}
                          />
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <span
                          className={`text-sm font-semibold ${
                            daysRemaining <= 3
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
