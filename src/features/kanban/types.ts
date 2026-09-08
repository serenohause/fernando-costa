import type { Database } from '@/lib/database.types'

export type KanbanBoardRow = Database['public']['Tables']['kanban_boards']['Row']
export type KanbanColumnRow = Database['public']['Tables']['kanban_columns']['Row']

export type KanbanBoard = KanbanBoardRow & { columns: KanbanColumnRow[] }

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
