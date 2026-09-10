import type { Database } from '@/lib/database.types'

export type KanbanBoardRow = Database['public']['Tables']['kanban_boards']['Row']
export type KanbanColumnRow = Database['public']['Tables']['kanban_columns']['Row']

export type OperationalTagRow = Database['public']['Tables']['operational_tags']['Row']

/*
  A coluna do quadro carrega as CHAVES dos status que ela oferece — vindas da
  tabela de ligação `kanban_column_operational_tags` (migration 0097). Eram dois
  booleanos até a 0096; deixaram de servir quando o status virou cadastro, porque
  booleano que carrega o NOME de um valor não sobrevive a uma lista que o
  escritório cria.
*/
export type KanbanColumnWithTags = KanbanColumnRow & { tagKeys: string[] }

export type KanbanBoard = KanbanBoardRow & { columns: KanbanColumnWithTags[] }

/*
  A COR DA COLUNA É UM NOME NO BANCO E UMA CLASSE AQUI — e a separação não é
  organização, é o único jeito de funcionar.

  O Tailwind monta o CSS varrendo o CÓDIGO em busca de nomes de classe. Uma
  classe que só existe numa linha do banco (`'bg-' + cor + '-100'`, ou o texto
  `bg-blue-100` gravado numa coluna) nunca entra no arquivo final: a regra não é
  gerada, o elemento fica sem fundo, e NÃO HÁ ERRO NENHUM — a cor simplesmente
  some. Por isso o banco guarda 'blue' e as classes estão escritas por extenso
  abaixo, onde o Tailwind as enxerga.

  Os dez primeiros valores são as cores que o quadro já usa hoje
  (`COLUMNS` do TaskKanban antes da migration 0093), copiadas sem mudança. O
  resto da paleta existe para o escritório ter escolha real ao renomear ou
  reordenar uma etapa.

  A VARIANTE ESCURA acompanha cada cor pelo mesmo motivo já registrado em
  `PRIORITY_STYLES`: um fundo de tom 100 vira faixa clara sob texto claro no
  tema escuro.
*/
export const COLUMN_COLORS = {
  muted: { label: 'Neutro', header: 'bg-muted', swatch: 'bg-muted-foreground/30' },
  slate: {
    label: 'Cinza',
    header: 'bg-slate-100 dark:bg-slate-900/50',
    swatch: 'bg-slate-400',
  },
  blue: { label: 'Azul', header: 'bg-blue-100 dark:bg-blue-950/40', swatch: 'bg-blue-400' },
  sky: { label: 'Azul claro', header: 'bg-sky-100 dark:bg-sky-950/40', swatch: 'bg-sky-400' },
  cyan: { label: 'Ciano', header: 'bg-cyan-100 dark:bg-cyan-950/40', swatch: 'bg-cyan-400' },
  teal: { label: 'Verde-azulado', header: 'bg-teal-100 dark:bg-teal-950/40', swatch: 'bg-teal-400' },
  emerald: {
    label: 'Verde',
    header: 'bg-emerald-100 dark:bg-emerald-950/40',
    swatch: 'bg-emerald-400',
  },
  lime: { label: 'Verde-limão', header: 'bg-lime-100 dark:bg-lime-950/40', swatch: 'bg-lime-400' },
  amber: { label: 'Âmbar', header: 'bg-amber-100 dark:bg-amber-950/40', swatch: 'bg-amber-400' },
  orange: {
    label: 'Laranja',
    header: 'bg-orange-100 dark:bg-orange-950/40',
    swatch: 'bg-orange-400',
  },
  rose: { label: 'Rosa', header: 'bg-rose-100 dark:bg-rose-950/40', swatch: 'bg-rose-400' },
  pink: { label: 'Pink', header: 'bg-pink-100 dark:bg-pink-950/40', swatch: 'bg-pink-400' },
  fuchsia: {
    label: 'Magenta',
    header: 'bg-fuchsia-100 dark:bg-fuchsia-950/40',
    swatch: 'bg-fuchsia-400',
  },
  purple: {
    label: 'Roxo',
    header: 'bg-purple-100 dark:bg-purple-950/40',
    swatch: 'bg-purple-400',
  },
  violet: {
    label: 'Violeta',
    header: 'bg-violet-100 dark:bg-violet-950/40',
    swatch: 'bg-violet-400',
  },
  indigo: {
    label: 'Índigo',
    header: 'bg-indigo-100 dark:bg-indigo-950/40',
    swatch: 'bg-indigo-400',
  },
} as const

export type ColumnColor = keyof typeof COLUMN_COLORS

export const COLUMN_COLOR_VALUES = Object.keys(COLUMN_COLORS) as ColumnColor[]

/*
  COR DESCONHECIDA NÃO PODE APAGAR A COLUNA. O check do banco aceita qualquer
  palavra minúscula, então uma cor gravada pela API — ou uma que saia desta
  paleta numa versão futura — chegaria aqui sem classe. Cair no neutro mantém a
  coluna visível e legível; devolver `undefined` deixaria o cabeçalho
  transparente e a etapa pareceria quebrada.
*/
export function columnHeaderClass(color: string): string {
  return (COLUMN_COLORS[color as ColumnColor] ?? COLUMN_COLORS.muted).header
}

export function columnSwatchClass(color: string): string {
  return (COLUMN_COLORS[color as ColumnColor] ?? COLUMN_COLORS.muted).swatch
}

/*
  A COR DO STATUS OPERACIONAL, pelos mesmos motivos de `COLUMN_COLORS` — e com
  uma diferença que importa: aqui a cor pinta TEXTO e BORDA, não só o fundo. Um
  crachá precisa de contraste com o que está escrito dentro dele, então cada cor
  traz o conjunto inteiro em vez de uma classe só.

  As duas primeiras são exatamente as que estavam cravadas em
  `OPERATIONAL_TAG_STYLES` (TaskKanban.tsx): âmbar para "Em Revisão", ciano para
  "Aguardando Cliente". O resto da paleta existe para o status que o escritório
  criar ter escolha real.

  O PONTO do menu não ganha variante escura: `bg-amber-400` é cor cheia, não
  fundo de contraste, e se lê igual nos dois temas.
*/
export const TAG_COLORS = {
  slate: {
    label: 'Cinza',
    badge:
      'bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-900',
    dot: 'bg-slate-400',
    menuActive: 'bg-slate-50 dark:bg-slate-950/40 font-medium',
  },
  amber: {
    label: 'Âmbar',
    badge:
      'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-900',
    dot: 'bg-amber-400',
    menuActive: 'bg-amber-50 dark:bg-amber-950/40 font-medium',
  },
  cyan: {
    label: 'Ciano',
    badge:
      'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-900',
    dot: 'bg-cyan-400',
    menuActive: 'bg-cyan-50 dark:bg-cyan-950/40 font-medium',
  },
  rose: {
    label: 'Rosa',
    badge:
      'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900',
    dot: 'bg-rose-400',
    menuActive: 'bg-rose-50 dark:bg-rose-950/40 font-medium',
  },
  violet: {
    label: 'Violeta',
    badge:
      'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-900',
    dot: 'bg-violet-400',
    menuActive: 'bg-violet-50 dark:bg-violet-950/40 font-medium',
  },
  emerald: {
    label: 'Verde',
    badge:
      'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-400',
    menuActive: 'bg-emerald-50 dark:bg-emerald-950/40 font-medium',
  },
  sky: {
    label: 'Azul',
    badge:
      'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-900',
    dot: 'bg-sky-400',
    menuActive: 'bg-sky-50 dark:bg-sky-950/40 font-medium',
  },
  orange: {
    label: 'Laranja',
    badge:
      'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-900',
    dot: 'bg-orange-400',
    menuActive: 'bg-orange-50 dark:bg-orange-950/40 font-medium',
  },
} as const

export type TagColor = keyof typeof TAG_COLORS
export const TAG_COLOR_VALUES = Object.keys(TAG_COLORS) as TagColor[]

/* Cor desconhecida cai no neutro, e não em nada: o check do banco aceita
   qualquer palavra minúscula, e um crachá sem classe ficaria invisível. */
export function tagStyleOf(color: string) {
  return TAG_COLORS[color as TagColor] ?? TAG_COLORS.slate
}
