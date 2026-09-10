import { PROJECT_PHASE } from '@/lib/enums'
import type { KanbanColumnRow } from './types'

/*
  O QUADRO COMO FONTE DE ROTULO E DE ORDEM.

  Até a migration 0094 as duas coisas saíam do enum `project_phase`: o rótulo do
  mapa `PROJECT_PHASE` e a ordem da ordem de declaração dele. Agora a etapa é uma
  linha do escritório — pode ter nome que o enum nunca teve, e pode estar em
  qualquer posição.

  Estas funções são PURAS e recebem as colunas de fora, em vez de consultarem o
  banco: é o que permite testá-las sem subir React, e é o que impede que a ordem
  do quadro seja lida de dois lugares diferentes na mesma tela.
*/

/* As etapas desenhadas, na ordem configurada. */
export function activeColumns(columns: KanbanColumnRow[]): KanbanColumnRow[] {
  return columns
    .filter((column) => column.is_active)
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
}

/*
  A ESCADA DE ETAPAS INCLUI AS OCULTAS, e isso não é descuido.

  Uma tarefa pode estar numa etapa que o escritório tirou do quadro (é o que
  acontece hoje com Revisão e Alvará de Construção). Se a escada só conhecesse as
  visíveis, `phaseIndexIn` devolveria -1 para ela, e a trava de checklist — que
  só vale ao AVANÇAR — passaria a se comportar como se toda saída dessa etapa
  fosse um retrocesso.
*/
export function orderedPhaseKeys(columns: KanbanColumnRow[]): string[] {
  return columns
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((column) => column.key)
}

/*
  -1 para etapa que não está no quadro, e quem chama precisa tratar: é o caso da
  tarefa cuja etapa foi apagada. `indexOf` já devolve isso; a função existe para
  o nome dizer o que o número significa.
*/
export function phaseIndexIn(orderedKeys: string[], phase: string | null): number {
  if (phase == null) return -1
  return orderedKeys.indexOf(phase)
}

/*
  O ROTULO, EM TRES DEGRAUS, e cada degrau existe por um motivo diferente:

  1. O que o escritório escreveu no quadro. É a resposta certa quando existe.
  2. O rótulo embutido de `PROJECT_PHASE`. Cobre a linha histórica — uma entrada
     de diário que registra "saiu de Revisão" continua legível depois de a etapa
     ser apagada do quadro.
  3. A própria chave. Feio de propósito: é o sinal visível de que alguém apagou
     uma etapa que ainda tinha história, e é melhor do que um traço mudo.
*/
export function phaseLabelIn(
  columns: KanbanColumnRow[],
  phase: string | null | undefined,
): string {
  if (phase == null || phase === '') return '—'

  const column = columns.find((candidate) => candidate.key === phase)
  if (column) return column.label

  return (PROJECT_PHASE as Record<string, string>)[phase] ?? phase
}

/*
  A ordem do cálculo de fase do projeto: da mais avançada para a mais inicial.

  `not_started` fica FORA, como no original: tarefa não iniciada não puxa o
  projeto de volta para o começo. `finished` também, porque não é fase de tarefa
  — é o que a função devolve quando tudo está concluído.
*/
export function advancedToInitial(columns: KanbanColumnRow[]): string[] {
  return orderedPhaseKeys(columns)
    .filter((key) => key !== 'not_started' && key !== 'finished')
    .reverse()
}

/*
  A CHAVE DE UMA ETAPA NOVA sai do nome, como em `serviceKeyFrom` (0084) e pelo
  mesmo motivo: pedir os dois ao escritório seria pedir que ele entendesse a
  diferença entre "o que aparece na tela" e "o que fica gravado na tarefa".

  Colisão não é tratada aqui — `unique (tenant_id, key)` recusa e a mensagem diz
  o que fazer. Inventar `layout_2` criaria em silêncio uma segunda etapa com o
  mesmo nome visível.
*/
export function phaseKeyFrom(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}
