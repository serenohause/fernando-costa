import type {
  DiaryEntryStatus,
  DiaryEntryType,
  ProjectIssueStatus,
  SiteVisitStatus,
  SiteVisitType,
} from '@/lib/enums'

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

/*
  ═══ ABA OBRA ═══

  O crachá de RESULTADO da visita (ObraTab.jsx:16-21), com o círculo colorido que
  o original põe antes do texto. O círculo é EMOJI lá e continua emoji aqui: ele
  aparece dentro do crachá, junto do rótulo, e trocá-lo por um ponto desenhado em
  CSS mudaria o desenho do crachá.

  Mesmas decisões dos outros mapas deste arquivo: cada cor de estado ganha
  variante escura, e o tom neutro vira token.
*/
export const VISIT_STATUS_STYLE: Record<SiteVisitStatus, { badge: string; dot: string }> = {
  no_issues: {
    badge:
      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    dot: '🟢',
  },
  with_issues: {
    badge:
      'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
    dot: '🔴',
  },
  awaiting_execution: {
    badge:
      'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    dot: '🟡',
  },
  resolved: {
    badge:
      'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    dot: '🔵',
  },
}

/*
  O crachá de TIPO da visita (ObraTab.jsx:23-33).

  "Vistoria" e "Outro" ficam iguais aqui, e no original diferem por um degrau do
  texto (slate-700 contra slate-600) — os dois caem em `--text-soft`, que é
  exatamente esse par no tema claro. Mesma tradução que "Observação" e "Outro" já
  receberam em `ENTRY_TYPE_STYLE`.
*/
export const VISIT_TYPE_BADGE: Record<SiteVisitType, string> = {
  follow_up:
    'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  verification:
    'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900',
  inspection:
    'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900',
  meeting:
    'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-900',
  measurement:
    'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900',
  correction:
    'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  delivery:
    'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  survey: 'bg-elevated text-soft border-border',
  other: 'bg-elevated text-soft border-border',
}

/*
  Os cinco indicadores do topo da aba Obra (ObraTab.jsx:176-181). São
  `texto + fundo + borda` num bloco só, como lá.
*/
export const OBRA_INDICATOR = {
  visits:
    'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900',
  open:
    'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900',
  inProgress:
    'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900',
  resolved:
    'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900',
  photos: 'text-soft bg-elevated border-border',
}

/*
  ═══ ABA PENDÊNCIAS ═══

  O crachá de situação da pendência (PendenciasTab.jsx:15-20), com o mesmo
  círculo de emoji do crachá da visita.
*/
export const ISSUE_STATUS_STYLE: Record<ProjectIssueStatus, { badge: string; dot: string }> = {
  open: {
    badge:
      'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
    dot: '🔴',
  },
  in_progress: {
    badge:
      'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    dot: '🟡',
  },
  resolved: {
    badge:
      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    dot: '🟢',
  },
  cancelled: {
    badge: 'bg-muted text-muted-foreground border-border',
    dot: '⚫',
  },
}

/*
  ═══ ABA RESUMO ═══

  O CARTÃO DE INDICADOR (ResumoTab.jsx:33-42), que é `fundo + borda + texto` num
  bloco só, indexado pela cor que cada indicador recebe na tela.

  As oito entradas são as de lá, classe por classe, com as mesmas duas decisões
  do resto deste arquivo: cada cor de estado ganha variante escura (o fundo 50
  sozinho vira faixa quase branca sob texto quase branco no tema escuro), e o tom
  neutro vira token — `bg-elevated`, `border-border` e `text-soft` são
  exatamente slate-50, slate-200 e slate-600/700 no tema claro.
*/
export const RESUMO_STAT_CARD = {
  slate: 'bg-elevated border-border text-soft',
  amber:
    'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400',
  blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400',
  emerald:
    'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400',
  rose: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400',
  violet:
    'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900 text-violet-700 dark:text-violet-400',
  orange:
    'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-400',
  sky: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-400',
}

export type ResumoStatColor = keyof typeof RESUMO_STAT_CARD

/*
  A PÍLULA da pendência dentro do cartão da visita (ObraTab.jsx:323).

  ELA NÃO É `ISSUE_STATUS_STYLE`, e a diferença é do original: lá a expressão tem
  três braços — resolvida é verde, aberta é vermelha e TODO O RESTO é âmbar. Ou
  seja, "Cancelada" aparece âmbar dentro da visita e cinza na aba Pendências.
  Reproduzido como está: é a mesma pendência vista em dois lugares, e igualar as
  duas seria mudar o desenho de uma delas por conta própria.
*/
export const VISIT_ISSUE_CHIP: Record<ProjectIssueStatus, string> = {
  open: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  in_progress:
    'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  resolved:
    'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  cancelled:
    'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
}
