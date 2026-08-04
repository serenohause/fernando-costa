import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'

/*
  Porta de projeto-original/src/components/dashboard/StatsCard.jsx.

  O cartão dos três painéis: rótulo pequeno, número grande, ícone em quadrado
  colorido à direita, elevação no hover. A geometria (p-6, space-y-2, p-3
  rounded-xl no ícone, w-5 h-5), a tipografia (text-sm font-medium / text-2xl
  font-bold tracking-tight) e as duas animações do `framer-motion` (o cartão sobe
  4px e cresce 2%; o ícone gira 5° e cresce 10%) são as do original, valor por
  valor. `framer-motion` aqui é o `motion` que o projeto já usa — mesmo
  precedente de PipelineHeader.tsx.

  AS CORES DE ESTADO CONTINUAM SENDO AS DO ORIGINAL, com variante escura somada:
  no tema escuro o `bg-*-50` sozinho é uma faixa quase branca. O par claro é o
  mesmo, classe por classe. Já os dois cinzas do original (`text-slate-500` do
  rótulo e `text-slate-900` do número) e o `bg-white` do cartão viram token —
  mesma cor no claro, e no escuro deixa de ser texto quase preto sobre fundo
  quase preto.

  `trend` SEM `trendValue` NÃO DESENHA NADA, e é do original: o bloco da seta
  está preso a `trendValue &&` (linha 25), enquanto quem decide para que lado a
  seta aponta é `trend`. O painel Geral passa `trend` em três cartões e
  `trendValue` em nenhum — ou seja, nenhuma seta aparece lá. Reproduzido; a prop
  continua existindo porque é o contrato do componente.
*/

export type StatsCardColor = 'blue' | 'green' | 'red' | 'purple' | 'orange'

export type StatsCardProps = {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: 'up' | 'down'
  trendValue?: string | number
  color?: StatsCardColor
}

const colorClasses: Record<StatsCardColor, string> = {
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  green: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
  red: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
  purple: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
  orange: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  color = 'blue',
}: StatsCardProps) {
  return (
    <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ duration: 0.2 }}>
      <Card className="p-6 bg-card border-0 shadow-sm hover:shadow-xl transition-all duration-300">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            {trendValue && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1"
              >
                {trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                )}
                <span
                  className={`text-sm font-medium ${
                    trend === 'up'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {trendValue}
                </span>
              </motion.div>
            )}
          </div>
          <motion.div
            whileHover={{ rotate: 5, scale: 1.1 }}
            className={`p-3 rounded-xl ${colorClasses[color]}`}
          >
            <Icon className="w-5 h-5" />
          </motion.div>
        </div>
      </Card>
    </motion.div>
  )
}
