import type { PartnershipTier, SupplierStatus } from '@/lib/enums'

/*
  As duas paletas da tela de Fornecedores, que o original escreve duas vezes cada
  — em Fornecedores.jsx:14-25 e de novo em FornecedorDrawer.jsx:7-12. Aqui é uma
  cópia só, indexada pelo valor do banco em vez do rótulo em português.

  Cor de estado ganha variante escura, como já foi feito em priority-styles.ts e
  StatusBadge: o fundo 100 de cada cor, no tema escuro, era faixa quase branca
  sob texto quase branco. O par claro é o do original, classe por classe.

  O tom neutro (slate) não é estado — vira token: `bg-muted`/`bg-elevated` e
  `text-soft`/`text-muted-foreground` são exatamente slate-100/50 e
  slate-600/slate-500 no tema claro.

  `StatusBadge` não serve aqui: o mapa dele é 50/700/200 e traz "Ativo" e "Em
  negociação" com outra intensidade da que esta tela usa; e o crachá de nível de
  parceria não existe lá.
*/

/* Crachá de nível de parceria, com borda (Fornecedores.jsx:14-19). */
export const TIER_BADGE: Record<PartnershipTier, string> = {
  strategic:
    'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-900',
  preferred:
    'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-900',
  registered:
    'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 border-blue-300 dark:border-blue-900',
  under_evaluation: 'bg-muted text-soft border-border',
}

/*
  Pílula de status da tabela (Fornecedores.jsx:21-25). O original usa `red` aqui
  — e não o `rose` das outras telas dele. Fica como está.
*/
export const STATUS_PILL: Record<SupplierStatus, string> = {
  active: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  inactive: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  negotiating: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
}
