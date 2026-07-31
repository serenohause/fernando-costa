import type { PriorityLevel } from '@/lib/enums'

/*
  As cores de prioridade das três telas de atividades.

  O original escreve TRÊS mapas diferentes para a mesma escala, e os três estão
  no ar: o crachá forte da tela gerencial (Atividades.jsx:37-42, repetido
  letra por letra em ReordenarAtividades.jsx:23-28), o texto colorido de
  "Minhas Atividades" (MinhasAtividades.jsx:166-171) e o crachá claro do
  relatório (RelatorioProdutividade.jsx:239-242). Os três continuam distintos —
  são o que está na tela; o que não continua é a QUARTA cópia do primeiro.

  Cor de estado ganha variante escura: o fundo 100/50 de cada cor, no tema
  escuro, era faixa quase branca sob texto quase branco. O par claro é o do
  original, classe por classe. O tom neutro da prioridade Baixa não é estado —
  vira token (`bg-muted`/`bg-elevated`/`text-soft` são exatamente slate-100,
  slate-50 e slate-600/700 no tema claro).

  `StatusBadge` não serve aqui: o mapa dele traz Alta em rosa, Média em âmbar e
  nenhuma entrada para Urgente, que é a escala de PRIORIDADE DE TAREFA. Atividade
  tem quatro níveis e outra paleta, e é a paleta destas telas.
*/

export const PRIORITY_BADGE: Record<PriorityLevel, string> = {
  urgent:
    'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900',
  high: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-900',
  medium:
    'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-900',
  low: 'bg-muted text-soft border-border',
}

export const PRIORITY_TEXT: Record<PriorityLevel, string> = {
  urgent: 'text-rose-600 dark:text-rose-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-muted-foreground',
}

export const PRIORITY_REPORT_BADGE: Record<PriorityLevel, string> = {
  urgent: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400',
  high: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400',
  medium: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  low: 'bg-elevated text-soft',
}

/* O crachá azul do projeto, que aparece igual nas três telas. */
export const PROJECT_BADGE =
  'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900'
