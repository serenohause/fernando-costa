import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProjectPhase } from '@/lib/enums'
import type { PhaseCount } from '../types'

/*
  Porta do gráfico "Distribuição por Fase" (DashboardExecutivo.jsx:689-714) — o
  único gráfico que o Painel Executivo desenha.

  MESMA BIBLIOTECA E MESMA VERSÃO do original (`recharts` 2.15.4), e cada prop é
  a de lá: altura 300, grade tracejada "3 3", rótulo do eixo X a -45° com 100px
  de altura reservada e fonte 11, cantos superiores da barra em 8px, cursor do
  tooltip em azul a 10%.

  AS TRÊS COISAS QUE MUDARAM DE ESCRITA, e nenhuma delas muda um pixel no tema
  claro:

  1. As cores fixas viram token. `#0ea5e9` da barra é `--chart-sky`
     (src/index.css), com o mesmo valor em HSL; `#f1f5f9` da grade é slate-100,
     que já é `--muted` ao pixel; e `rgba(14,165,233,0.1)` do cursor é o mesmo
     `--chart-sky` a 10%.
  2. `name="quantidade"` é o que mantém o texto do tooltip como no original. Lá o
     campo se chama `quantidade` e o tooltip padrão mostra o NOME da série; aqui
     o campo é `count`, e sem `name` o balão passaria a dizer "count : 5".
  3. O eixo X lê `label` (o rótulo em português de `PROJECT_PHASE`), que é
     exatamente o que a coluna `fase_projeto_atual` guardava no original.

  O TEMA ESCURO É REPARO, NÃO REDESENHO: o recharts pinta o texto do eixo em
  `#666` e o balão do tooltip em branco por atributo/estilo embutido, o que no
  escuro dá texto apagado e um balão branco com texto claro por cima. As duas
  correções abaixo só existem dentro de `.dark` — no claro o gráfico continua
  sendo o do original, atributo por atributo. Mesma decisão já tomada no
  StatsCard.
*/

/* O recorte do estado do recharts que o clique usa. O tipo completo
   (`CategoricalChartState`) não é exportado pela raiz do pacote, e o que
   interessa aqui é uma propriedade só. */
type ChartClickState = { activePayload?: { payload?: PhaseCount }[] }

export default function PhaseDistributionChart({
  data,
  onSelectPhase,
}: {
  data: PhaseCount[]
  onSelectPhase: (phase: ProjectPhase) => void
}) {
  return (
    <div className="dark:[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground dark:[&_.recharts-default-tooltip]:!border-border dark:[&_.recharts-default-tooltip]:!bg-card">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          onClick={(state: ChartClickState) => {
            const phase = state?.activePayload?.[0]?.payload?.phase
            if (phase) onSelectPhase(phase)
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
          <XAxis dataKey="label" angle={-45} textAnchor="end" height={100} tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip cursor={{ fill: 'hsl(var(--chart-sky) / 0.1)' }} />
          <Bar
            dataKey="count"
            name="quantidade"
            fill="var(--color-chart-sky)"
            radius={[8, 8, 0, 0]}
            className="cursor-pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
