import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Award,
  Calendar as CalendarIcon,
  Clock,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { format, getMonth, getYear } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ErrorState from '@/components/shared/ErrorState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { FUNNEL_STAGE, labelOf } from '@/lib/enums'
import { formatCurrencyBRL } from '@/lib/format'
import type { MonthYear } from '@/features/financial/types'
import type { NegotiationRow } from '@/features/pipeline/types'
import { useCommercialDashboard } from '../hooks'
import { commercialDrilldown } from '../list'
import type { CommercialDrilldown } from '../types'
import NegociacoesDrillDown from './NegociacoesDrillDown'

/*
  Porta de projeto-original/src/pages/DashboardComercial.jsx — o "Painel
  Comercial" (menu `dashboard_commercial`, migration 0004).

  Os cinco blocos, na ordem e com o microcopy do original: visão geral do funil,
  performance de fechamento, negociações perdidas, os dois gráficos de barras por
  etapa e velocidade/gargalos. Cabeçalho com os dois seletores (mês e ano) à
  direita, `space-y-8` entre blocos, grades md:4 / md:3 / lg:2 / lg:3, cartões
  `border-0 shadow-sm` e número em `text-3xl font-bold` colorido.

  NENHUMA CONTA MORA AQUI. Tudo vem de `useCommercialDashboard`, e cada número
  está documentado em features/dashboards/list.ts ao lado da linha do original que
  reproduz — inclusive os defeitos preservados, repetidos abaixo onde aparecem na
  tela.

  O QUE O ORIGINAL TEM E NÃO FOI PORTADO, por ser código morto lá:
  - `Contract.list()` (linha 49): baixado e nunca usado, só segurava o esqueleto.
  - `const COLORS` (linha 300) e os imports de `PieChart`/`Pie`/`Cell`/`Legend`:
    o bloco 4 (pizza) foi apagado do original e sobraram as sobras dele.
  - `DollarSign` importado e não usado (linha 10).

  PERMISSÃO — E ELA É DO BANCO, não desta tela. Nada aqui escreve: não há botão,
  formulário ou menu de ação para esconder. Quem decide se o item "Painel
  Comercial" aparece na barra lateral é `useAppNavigation` sobre a chave
  `dashboard_commercial` (migration 0004); quem tira Arquiteto e Estagiário desta
  página, mesmo digitando a URL, é `redirectTargetFor` (auth/access.ts, a regra
  do Layout.jsx original); e quem decide quais negociações descem é a RLS —
  `negotiations_select_active_collaborator` (migration 0024), que é LEITURA LARGA:
  qualquer colaborador ativo do tenant lê o funil inteiro. Ou seja, ao contrário
  do Painel Executivo, os números desta tela são os mesmos para todo mundo que
  consegue abri-la. A tela não inventa uma trava que o banco não tem.
*/

/* Os doze meses do seletor, escritos como no original (DashboardComercial.jsx:75-78). */
const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/* Os títulos da gaveta, um por cartão clicável (linhas 165-210). */
const DRILLDOWN_TITLES: Record<CommercialDrilldown, string> = {
  ativas: 'Negociações Ativas',
  valor_em_negociacao: 'Valor Total em Negociação',
  em_risco: 'Negociações em Risco',
  ganhas: 'Negociações Ganhas',
  valor_ganho: 'Valor Ganho',
  perdidas: 'Negociações Perdidas',
  valor_perdido: 'Valor Perdido',
}

type DrillDownState = {
  isOpen: boolean
  negotiations: NegotiationRow[]
  title: string
  subtitle: string
}

const CLOSED_DRILLDOWN: DrillDownState = {
  isOpen: false,
  negotiations: [],
  title: '',
  subtitle: '',
}

/* Últimos 3 anos + o atual + os 2 seguintes (linhas 70-73). */
function buildYearOptions(now: Date): number[] {
  const currentYear = getYear(now)
  return Array.from({ length: 6 }, (_, i) => currentYear - 3 + i)
}

export default function DashboardComercial() {
  const queryClient = useQueryClient()

  const [selectedMonth, setSelectedMonth] = useState(() => getMonth(new Date()))
  const [selectedYear, setSelectedYear] = useState(() => getYear(new Date()))
  const [drillDown, setDrillDown] = useState<DrillDownState>(CLOSED_DRILLDOWN)

  const availableYears = useMemo(() => buildYearOptions(new Date()), [])

  /*
    O par (mês, ano) que os blocos 2 e 2B recortam. O original monta uma data de
    referência com `setMonth`/`setYear` e a passa por `startOfMonth`/`endOfMonth`;
    aqui o par viaja como `MonthYear` até `monthRange` (financial/hooks.ts), que é
    o mesmo recorte de mês das telas do financeiro e do painel Geral.
  */
  const period: MonthYear = useMemo(
    () => ({ year: selectedYear, month: selectedMonth }),
    [selectedYear, selectedMonth],
  )

  /* "agosto/2026", em minúscula — é o que o original escreve no subtítulo, no
     rodapé de quatro cartões e no subtítulo da gaveta. */
  const periodLabel = useMemo(
    () => format(new Date(selectedYear, selectedMonth, 1), 'MMMM/yyyy', { locale: ptBR }),
    [selectedYear, selectedMonth],
  )

  const { negotiations, funnel, closing, stages, velocity, isLoading, isError, error } =
    useCommercialDashboard(period)

  const openDrillDown = (kind: CommercialDrilldown) => {
    setDrillDown({
      isOpen: true,
      /*
        A lista é recortada NO CLIQUE, como no original — a gaveta guarda o que
        viu, e não reage à troca de mês por baixo dela (que fica atrás do véu de
        qualquer forma).

        A GAVETA DE "NEGOCIAÇÕES GANHAS" ABRE SEMPRE VAZIA, e é o bug mais
        visível desta tela: `commercialDrilldown` filtra a lista de PERDIDAS
        procurando status "Ganha" (DashboardComercial.jsx:185), então o cartão
        mostra 4 e a gaveta diz "Nenhuma negociação encontrada". Reproduzido de
        propósito e reportado ao usuário: a correção é uma linha, e é decisão
        dele.
      */
      negotiations: commercialDrilldown(kind, negotiations, closing),
      title: DRILLDOWN_TITLES[kind],
      /*
        O SUBTÍTULO FALA DO MÊS EM TODAS AS SETE GAVETAS, inclusive nas quatro
        que ignoram o mês (ativas, valor em negociação, em risco e — por
        tabela — a de ganhas, que vem vazia). É do original, linha 163.
      */
      subtitle: `Exibindo negociações de ${periodLabel}`,
    })
  }

  /*
    O ESQUELETO SUBSTITUI A TELA INTEIRA, cabeçalho e filtros incluídos, e é o
    original (linhas 287-298): um retângulo no lugar do título e oito no lugar
    dos cartões. Diferença de origem: lá o `isLoading` espera negociações +
    contratos (a lista de contratos não é usada em lugar nenhum); aqui espera as
    negociações e as duas contagens do funil.
  */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard Comercial</h1>
          <p className="text-muted-foreground mt-1">
            Pipeline, conversão e performance de vendas — {periodLabel}
          </p>
        </div>

        {/* Filtro de Período (Mês e Ano) */}
        <div className="flex gap-2 items-center">
          <CalendarIcon className="w-5 h-5 text-faint" />
          <Select
            value={selectedMonth.toString()}
            onValueChange={(value) => setSelectedMonth(parseInt(value))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((month, index) => (
                <SelectItem key={month} value={index.toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => setSelectedYear(parseInt(value))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/*
        O TERCEIRO ESTADO, que o original não tem: lá a falha de leitura só vai
        para o `console.error` da consulta e a tela desenha o painel inteiro
        zerado — "0 negociações ativas" e "R$ 0 em pipeline" ficam
        indistinguíveis de "não deu para carregar". Mesmo tratamento do painel
        Geral: o cabeçalho e os filtros continuam, o corpo vira o erro, e
        `invalidateQueries()` sem chave porque o painel cruza a lista do pipeline
        com duas contagens.
      */}
      {isError ? (
        <ErrorState
          title="Não foi possível carregar o painel"
          description="Os números do painel comercial não puderam ser lidos agora."
          error={error}
          onRetry={() => {
            void queryClient.invalidateQueries()
          }}
        />
      ) : (
        <>
          {/* BLOCO 1 — VISÃO GERAL DO FUNIL */}
          {/*
            ESTE BLOCO IGNORA OS DOIS SELETORES DO CABEÇALHO, e é do original: os
            quatro cartões somam TODAS as negociações ativas, de qualquer época.
            O microcopy ("Em andamento", "Pipeline total", "Por negociação") é o
            que separa este bloco do de baixo — nenhum deles menciona o mês.
            Reproduzido e reportado.
          */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Visão Geral do Funil
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('ativas')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Negociações Ativas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                    {funnel.activeCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Em andamento • Clique para ver
                  </p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('valor_em_negociacao')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">
                    Valor Total em Negociação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                    {formatCurrencyBRL(funnel.totalValue, { withCents: false })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pipeline total • Clique para ver
                  </p>
                </CardContent>
              </Card>

              {/*
                "TICKET MÉDIO" DEIXA DE SER "PIPELINE ÷ ATIVAS" passadas 500
                negociações, e a ressalva inteira está em `funnelMetrics`: a
                contagem de ativas vem do banco (exata em qualquer tamanho) e a
                soma vem da lista, que tem teto. A média é calculada sobre as 500
                que desceram, para não misturar soma parcial com contagem
                completa. Resolver de verdade é uma view de totais do funil, e é
                decisão do usuário.
              */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">
                    Ticket Médio em Negociação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrencyBRL(funnel.averageTicket, { withCents: false })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Por negociação</p>
                </CardContent>
              </Card>

              {/*
                "PRAZO VENCIDO" É LIDO EM UTC, e o desvio é mantido de propósito:
                `expected_close_date` é coluna `date` e a régua compartilhada
                (`isExpectedCloseOverdue`, pipeline/filters.ts) a compara com
                `new Date`, o que em Goiânia faz a previsão de hoje vencer às 21h
                de ontem. O quadro do pipeline (módulo 3) já está no ar assim;
                corrigir aqui faria o painel discordar dele.
              */}
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('em_risco')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">
                    Negociações em Risco
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors">
                    {funnel.atRiskCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Prazo vencido • Clique para ver
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* BLOCO 2 — PERFORMANCE DE FECHAMENTO (GANHOS) */}
          {/*
            ESTE BLOCO E O DE BAIXO SÃO OS ÚNICOS QUE RESPEITAM O SELETOR DE MÊS.

            E eles têm a divergência de um dia registrada em `closingMetrics`:
            `closed_at` é coluna `date` e o original a compara com `new Date`, ou
            seja, negociação fechada no dia 1 não conta no mês dela e conta no
            anterior. Aqui a comparação é de texto `YYYY-MM-DD` sobre o mesmo
            `monthRange` do financeiro, sem fuso no meio.
          */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Award className="w-5 h-5" />
              Performance de Fechamento (Ganhos)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('ganhas')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Negociações Ganhas</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* O cartão conta certo; a gaveta que ele abre vem vazia — ver
                      o comentário em `openDrillDown`. */}
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                    {closing.wonCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {periodLabel} • Clique para ver
                  </p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('valor_ganho')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Valor Ganho</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                    {formatCurrencyBRL(closing.wonValue, { withCents: false })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {periodLabel} • Clique para ver
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Ticket Médio Ganho</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrencyBRL(closing.wonAverageTicket, { withCents: false })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Por negociação</p>
                </CardContent>
              </Card>

              {/* As duas taxas dividem pelo total FINALIZADO no mês, então somam
                  100% sempre que algo fechou e valem 0,0% no mês em que nada
                  fechou — ver `closingMetrics`. */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Taxa de Conversão</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-violet-600 dark:text-violet-400">
                    {closing.conversionRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Ganhos / Finalizadas</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* BLOCO 2B — NEGOCIAÇÕES PERDIDAS */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              Negociações Perdidas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('perdidas')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Quantidade Perdida</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors">
                    {closing.lostCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {periodLabel} • Clique para ver
                  </p>
                </CardContent>
              </Card>

              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openDrillDown('valor_perdido')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Valor Perdido</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors">
                    {formatCurrencyBRL(closing.lostValue, { withCents: false })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {periodLabel} • Clique para ver
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">Taxa de Perda</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                    {closing.lossRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Perdidas / Finalizadas</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* BLOCO 3 — FUNIL COMERCIAL */}
          {/*
            OS DOIS GRÁFICOS TAMBÉM IGNORAM O SELETOR DE MÊS: são as negociações
            ATIVAS de qualquer época, distribuídas pelas cinco etapas do quadro
            (`funnelStageTotals`). É do original.

            AS CORES DAS BARRAS SÃO AS DO ORIGINAL — sky-500 na quantidade e
            emerald-500 no valor —, e vêm dos tokens `--chart-sky` e
            `--chart-emerald`, os mesmos que o Painel Executivo usa. Nasceram
            aqui como `currentColor` numa classe utilitária, que dá o mesmo
            pixel na barra mas deixa o texto do balão sair na cor do texto da
            página em vez da cor da série — e eram dois mecanismos para a mesma
            coisa dentro do mesmo módulo. A grade usa `--muted`, que no tema
            claro é exatamente o slate-100 do original e no escuro deixa de ser
            uma linha branca sobre fundo escuro.

            O TEXTO DOS EIXOS FICA NO PADRÃO DO recharts (cinza #666, só com o
            `fontSize: 11` que o original passa). No tema escuro ele tem pouco
            contraste — está reportado, não corrigido: mexer nisso é mexer na cor
            de um elemento que o original desenha assim.
          */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Funil Comercial (Ativas)
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Negociações Ativas por Etapa</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stages}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis
                        dataKey="label"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis />
                      <Tooltip />
                      {/* `name` reproduz o rótulo do balão: no original a série
                          não tem nome e o recharts cai no `dataKey`, que lá é
                          "quantidade". Sem isso o balão diria "count". */}
                      <Bar
                        dataKey="count"
                        name="quantidade"
                        fill="var(--color-chart-sky)"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Valor Ativo por Etapa</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stages}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis
                        dataKey="label"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis />
                      <Tooltip
                        formatter={(value) =>
                          formatCurrencyBRL(Number(value), { withCents: false })
                        }
                      />
                      {/* Mesma razão do gráfico ao lado: no original o `dataKey`
                          desta série é "valor". */}
                      <Bar
                        dataKey="value"
                        name="valor"
                        fill="var(--color-chart-emerald)"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* BLOCO 5 — TEMPO E VELOCIDADE DE VENDA */}
          {/*
            O TERCEIRO BLOCO QUE IGNORA O SELETOR: o tempo médio é sobre todas as
            ganhas de todos os tempos, e a lista de paradas é sobre o funil ativo
            inteiro.

            "PARADAS (+30 DIAS)" MEDE ENTRADA NO FUNIL, NÃO ÚLTIMA MOVIMENTAÇÃO —
            negociação trabalhada ontem aparece aqui se entrou há 31 dias. E a
            tela de Negociações usa OUTRA régua para a mesma palavra
            (`updated_at` há mais de 5 dias). Dois lugares, duas contas, o mesmo
            rótulo; os dois são do original. Reproduzido e reportado.
          */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Velocidade e Gargalos
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-soft">
                    Tempo Médio de Fechamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {Math.round(velocity.averageDaysToClose)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Dias (entrada → fechamento)</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    Negociações Paradas (+30 dias)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {/* O estado vazio deste bloco é o do original; os outros
                        blocos, sem negociação nenhuma, mostram zero e barras
                        zeradas, como lá. */}
                    {velocity.stalled.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma negociação parada
                      </p>
                    ) : (
                      velocity.stalled.map(({ negotiation, daysInFunnel }) => (
                        <div
                          key={negotiation.id}
                          className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-900"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {negotiation.name}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              {/* Nome ATUAL do cadastro, via embed — no original
                                  são as cópias `cliente_name` e
                                  `responsavel_comercial_name`. */}
                              <p className="text-xs text-soft">
                                {negotiation.client?.name || 'Sem cliente'}
                              </p>
                              <span className="text-xs text-faint">•</span>
                              <p className="text-xs text-soft">
                                {negotiation.owner?.name || 'Sem responsável'}
                              </p>
                              <span className="text-xs text-faint">•</span>
                              <p className="text-xs text-soft">
                                {labelOf(FUNNEL_STAGE, negotiation.funnel_stage)}
                              </p>
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                              {daysInFunnel} dias
                            </div>
                            <div className="text-xs text-soft">
                              {formatCurrencyBRL(negotiation.estimated_value, { withCents: false })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Drill-Down Drawer */}
      <NegociacoesDrillDown
        isOpen={drillDown.isOpen}
        onClose={() => setDrillDown({ ...drillDown, isOpen: false })}
        negotiations={drillDown.negotiations}
        title={drillDown.title}
        subtitle={drillDown.subtitle}
      />
    </div>
  )
}
