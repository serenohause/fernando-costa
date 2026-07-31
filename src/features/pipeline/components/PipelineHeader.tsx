import type { LucideIcon } from 'lucide-react'
import { DollarSign, Percent, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'
import { formatCurrencyBRL } from '@/lib/format'
import type { NegotiationRow } from '../types'

/*
  Porta de projeto-original/src/components/negociacoes/PipelineHeader.jsx.

  Os cinco cartões, a ordem, os ícones, a grade (2 / md:3 / lg:5), o
  espaçamento e as contas são os do original. O que muda é a origem dos campos
  (`status_negociacao` → `status`, `valor_estimado` → `estimated_value`,
  `data_fechamento` → `closed_at`) e as cores de estado, que ganham variante
  escura — no tema escuro, `bg-blue-50` era faixa quase branca.

  O `framer-motion` do original é o `motion` que este projeto já usa; o atraso
  escalonado de 0.05s por cartão é o mesmo.
*/

type Stat = {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  /* Par claro do original + variante escura. Cor de estado continua cor de
     estado; o `dark:` é adição, não troca. */
  color: string
  bgColor: string
  borderColor: string
}

export default function PipelineHeader({ negotiations }: { negotiations: NegotiationRow[] }) {
  const active = negotiations.filter((n) => n.status === 'active')
  const totalInNegotiation = sumValue(active)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentlyWon = negotiations.filter(
    (n) => n.status === 'won' && n.closed_at && new Date(n.closed_at) >= thirtyDaysAgo,
  )
  const recentlyWonValue = sumValue(recentlyWon)

  const wonCount = negotiations.filter((n) => n.status === 'won').length
  const lostCount = negotiations.filter((n) => n.status === 'lost').length
  const closedCount = wonCount + lostCount
  const conversionRate = closedCount > 0 ? ((wonCount / closedCount) * 100).toFixed(1) : 0

  const totalWonValue = sumValue(negotiations.filter((n) => n.status === 'won'))
  const averageTicket = wonCount > 0 ? totalWonValue / wonCount : 0

  const stats: Stat[] = [
    {
      title: 'Negociações Ativas',
      value: active.length,
      icon: TrendingUp,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40',
      borderColor: 'border-blue-100 dark:border-blue-900',
    },
    {
      title: 'Valor em Negociação',
      value: formatCurrencyBRL(totalInNegotiation, { withCents: false }),
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
      borderColor: 'border-emerald-100 dark:border-emerald-900',
    },
    {
      title: 'Ganho (30 dias)',
      value: formatCurrencyBRL(recentlyWonValue, { withCents: false }),
      subtitle: `${recentlyWon.length} negócios`,
      icon: Target,
      color: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-50 dark:bg-violet-950/40',
      borderColor: 'border-violet-100 dark:border-violet-900',
    },
    {
      title: 'Taxa de Conversão',
      value: `${conversionRate}%`,
      subtitle: `${wonCount} ganhos`,
      icon: Percent,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40',
      borderColor: 'border-amber-100 dark:border-amber-900',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrencyBRL(averageTicket, { withCents: false }),
      icon: TrendingDown,
      color: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-50 dark:bg-rose-950/40',
      borderColor: 'border-rose-100 dark:border-rose-900',
    },
  ]

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className={`border ${stat.borderColor} hover:shadow-md transition-shadow`}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className={`${stat.bgColor} p-2 rounded-lg`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-xs text-soft mb-1">{stat.title}</p>
                <p className="text-xl font-bold text-foreground mb-0.5">{stat.value}</p>
                {stat.subtitle && <p className="text-xs text-muted-foreground">{stat.subtitle}</p>}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function sumValue(rows: NegotiationRow[]): number {
  return rows.reduce((total, row) => total + (row.estimated_value ?? 0), 0)
}
