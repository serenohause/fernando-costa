import type { DiaryEntryStatus, DiaryEntryType } from '@/lib/enums'

/*
  A paleta da linha do tempo, indexada pelo valor do banco em vez do rótulo em
  português (ProjectDiaryDrawer.jsx:41-58, onde a chave do mapa É o rótulo).

  Mesmas decisões já tomadas em budget-styles.ts e priority-styles.ts:

  - cada cor de estado ganha variante escura, porque o fundo 100 sozinho vira
    faixa quase branca sob texto quase branco no tema escuro. O par claro é o do
    original, classe por classe;
  - o tom neutro (slate) não é estado — vira token: `bg-muted`, `text-soft` e
    `border-border` são exatamente slate-100, slate-600/700 e slate-200 no tema
    claro.

  O PONTO DA ESQUERDA tem uma tradução a mais. "Observação" usa slate-400 e
  "Outro" usa slate-300 — dois degraus de cinza, e o segundo é mais claro que o
  primeiro de propósito ("Outro" é o tipo que menos afirma). O tema tem
  `--text-faint` (slate-400 no claro) e `--border` (slate-200); a distância
  relativa entre os dois pontos é preservada, e `bg-faint`/`bg-border` são os
  dois degraus disponíveis.

  O `|| TYPE_CONFIG['Outro']` do original não tem equivalente: a coluna é
  `diary_entry_type` NOT NULL, então não há tipo fora do mapa.
*/
export const ENTRY_TYPE_STYLE: Record<DiaryEntryType, { badge: string; dot: string }> = {
  client_request: {
    badge:
      'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    dot: 'bg-amber-400',
  },
  project_change: {
    badge:
      'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900',
    dot: 'bg-violet-400',
  },
  decision: {
    badge:
      'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    dot: 'bg-blue-400',
  },
  meeting: {
    badge:
      'bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-900',
    dot: 'bg-teal-400',
  },
  approval: {
    badge:
      'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    dot: 'bg-emerald-400',
  },
  correction: {
    badge:
      'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
    dot: 'bg-rose-400',
  },
  delivery: {
    badge:
      'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900',
    dot: 'bg-indigo-400',
  },
  note: {
    badge: 'bg-muted text-soft border-border',
    dot: 'bg-faint',
  },
  other: {
    badge: 'bg-muted text-soft border-border',
    dot: 'bg-border',
  },
  system: {
    badge:
      'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900',
    dot: 'bg-sky-400',
  },
}

/*
  O crachá de situação do registro (ProjectDiaryDrawer.jsx:54-58). Só aparece em
  registro manual: evento de sistema nasce sempre `completed` (migration 0070) e
  o original não o desenha.
*/
export const ENTRY_STATUS_BADGE: Record<DiaryEntryStatus, string> = {
  in_progress:
    'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  completed:
    'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

/*
  A BORDA ESQUERDA DA LINHA DO TEMPO. Registro automático é sky-200; manual é
  slate-200, que é o próprio `--border` do tema.
*/
export const ENTRY_RAIL = {
  automatic: 'border-sky-200 dark:border-sky-900',
  manual: 'border-border',
}
