import type { BudgetItemStatus } from '@/lib/enums'

/*
  A paleta de status do item de orçamento, indexada pelo valor do banco em vez do
  rótulo em português (ItemOrcamentoDrawer.jsx:8-15).

  Mesmas decisões já tomadas em supplier-styles.ts e priority-styles.ts:

  - cada cor de estado ganha variante escura, porque o fundo 100 sozinho vira
    faixa quase branca sob texto quase branco no tema escuro. O par claro é o do
    original, classe por classe;
  - o tom neutro (slate) não é estado — vira token: `bg-muted` e `text-soft` são
    exatamente slate-100 e slate-600/700 no tema claro.

  O `|| 'bg-slate-100 text-slate-700'` do original não tem equivalente aqui: a
  coluna é `budget_item_status` NOT NULL, então não há status fora do mapa.
*/
export const ITEM_STATUS_BADGE: Record<BudgetItemStatus, string> = {
  pending: 'bg-muted text-soft',
  quoting: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  quoted: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  presented_to_client: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400',
  approved: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
}
