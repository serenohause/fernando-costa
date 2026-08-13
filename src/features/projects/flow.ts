import { format } from 'date-fns'
import {
  OPERATIONAL_TAG,
  PROJECT_PHASE,
  labelOf,
  type OperationalTag,
  type ProjectPhase,
  type TaskPhase,
} from '@/lib/enums'
import { missingChecklistItems } from './checklist-templates'
import { phaseIndex } from './project-phase'
import type { TaskChecklistItem, TaskPhaseMove, TaskRow } from './types'

/*
  A decisão da mudança de coluna do kanban, separada da gravação.

  Porta de `handleDragEnd` (TaskKanban.jsx:196-258) somado a `handleStatusChange`
  (Tasks.jsx:150-184) — no original a regra está partida entre os dois arquivos e
  metade dela viaja como argumento posicional (`onStatusChange(id, phase,
  checklist, status)`), o que torna difícil ver o que acontece em cada caso.
*/

export type MoveOutcome =
  /* Item obrigatório da etapa ATUAL por concluir. A tarefa não sai do lugar. */
  | { kind: 'blocked'; fromPhase: ProjectPhase; toPhase: ProjectPhase; pending: string[] }
  | { kind: 'move'; move: TaskPhaseMove }

/*
  Quais tarefas aparecem em cada coluna (TaskKanban.jsx:272-308).

  "Finalizado" NÃO é uma fase de tarefa: é `status = completed` desenhado como
  coluna. O banco recusa `tasks.phase = 'finished'`
  (`tasks_phase_not_finished_check`), e no original a lista de fases de `Task`
  simplesmente não traz o valor. Por isso a coluna junta as concluídas de todas
  as fases, e as demais colunas escondem as concluídas.
*/
export function tasksInColumn(tasks: TaskRow[], column: ProjectPhase): TaskRow[] {
  if (column === 'finished') return tasks.filter((task) => task.status === 'completed')
  return tasks.filter((task) => task.phase === column && task.status !== 'completed')
}

/*
  QUAL TAG CADA COLUNA OFERECE — e é OFERTA DE TELA, não regra de domínio.

  Porta de `COLUNAS_COM_TAGS` e `COLUNAS_SO_REVISAO` (TaskKanban.jsx:42-44 da
  versão nova): "Layout" e "Perspectivas" oferecem as duas tags, "Projeto Legal"
  e "Projeto Executivo" oferecem só "Em Revisão", e o submenu não aparece nas
  demais colunas.

  O BANCO NÃO REPETE ESTE RECORTE, DE PROPÓSITO — a migration 0074 explica por
  quê e a decisão está no COMMENT da coluna: `tasks.operational_tag` aceita
  qualquer tag em qualquer fase. Virar check faria um arraste legítimo virar erro
  de banco no dia em que esta lista e o check discordassem, e quem arrasta um
  cartão COM tag para fora do recorte está fazendo exatamente o gesto que esta
  fatia desenha (a tag é limpa no mesmo UPDATE da mudança de fase). Ou seja: isto
  aqui é o que o menu MOSTRA, e nada além disso — não é validação e não deve
  virar uma.

  Fica em `flow.ts` e não no JSX pelo mesmo motivo de `moveTaskToPhase`: a
  decisão de quadro se lê num arquivo só, e o componente desenha o que ela
  devolve.
*/
const COLUMNS_WITH_BOTH_TAGS: readonly ProjectPhase[] = ['layout', 'renderings']
const COLUMNS_REVIEW_ONLY: readonly ProjectPhase[] = ['legal_permit', 'construction_docs']

export function operationalTagOptions(column: ProjectPhase): OperationalTag[] {
  if (COLUMNS_WITH_BOTH_TAGS.includes(column)) return ['in_review', 'awaiting_client']
  if (COLUMNS_REVIEW_ONLY.includes(column)) return ['in_review']
  return []
}

/* Itens obrigatórios da etapa de origem que ainda não foram concluídos. */
function pendingRequired(checklist: TaskChecklistItem[], fromPhase: ProjectPhase): string[] {
  return checklist
    .filter((item) => item.is_required && item.phase === fromPhase && !item.is_completed)
    .map((item) => item.title)
}

export function moveTaskToPhase(
  task: TaskRow,
  fromPhase: ProjectPhase,
  toPhase: ProjectPhase,
): MoveOutcome {
  /*
    A trava vale só ao AVANÇAR, como no original: voltar uma tarefa para uma
    etapa anterior nunca é bloqueado por checklist pendente.
  */
  if (phaseIndex(toPhase) > phaseIndex(fromPhase)) {
    const pending = pendingRequired(task.checklist, fromPhase)
    if (pending.length > 0) return { kind: 'blocked', fromPhase, toPhase, pending }
  }

  const today = format(new Date(), 'yyyy-MM-dd')

  /*
    Soltar em "Finalizado" conclui a tarefa e NÃO mexe na etapa dela — é o
    `onStatusChange(taskId, task.phase, ..., 'Concluída')` do original
    (TaskKanban.jsx:231). A tarefa continua registrando em que etapa parou.

    O cast existe porque `tasks.phase` chega tipada com os doze valores do enum
    compartilhado; o check da tabela garante que `finished` nunca é um deles.
  */
  if (toPhase === 'finished') {
    return {
      kind: 'move',
      move: {
        id: task.id,
        phase: task.phase as TaskPhase,
        status: 'completed',
        completion_date: today,
        newChecklistItems: [],
        title: task.title,
        fromPhase,
        toPhase,
      },
    }
  }

  /*
    O mesmo cast da linha acima, e pelo mesmo motivo: `project_phase` ganhou
    `post_approval` na migration 0048, para o checklist de orçamento (módulo 8).
    O kanban não tem essa coluna — `tasksInColumn` é chamada com as fases que o
    original desenha — e `tasks_phase_no_post_approval_check` (0049) recusa o
    valor no banco.
  */
  return {
    kind: 'move',
    move: {
      id: task.id,
      phase: toPhase as TaskPhase,
      status: nextStatus(task.status),
      /*
        Sair de "Finalizado" limpa a data de conclusão, como no original
        (Tasks.jsx:157, `completion_date: ... : null`).
      */
      completion_date: null,
      /*
        O checklist da nova etapa é acrescentado ao mudar de coluna, como no
        original — a diferença é que lá o array inteiro da tarefa é reescrito, e
        aqui entram só as linhas que faltam.
      */
      newChecklistItems: missingChecklistItems(toPhase as TaskPhase, task.checklist),
      title: task.title,
      fromPhase,
      toPhase,
    },
  }
}

/*
  DIVERGÊNCIA CONSCIENTE, e a única deste módulo — sinalizada ao usuário.

  O original, ao tirar um cartão da coluna "Finalizado", grava a etapa nova e
  `completion_date: null` MAS mantém `status = 'Concluída'` (Tasks.jsx:156-157).
  Esse estado — concluída sem data de conclusão — é exatamente o que o banco
  recusa aqui (`tasks_completion_date_matches_status_check`, migration 0032), e
  o efeito dele na tela do original é a tarefa continuar na coluna "Finalizado":
  o cartão volta sozinho, porque `getTasksByPhase` seleciona a coluna por
  status, não por etapa. Ou seja, o gesto de reabrir uma tarefa não funciona lá.

  Como a gravação original é impossível, a tarefa passa a voltar para "Em
  andamento" ao sair de "Finalizado" — a única leitura do gesto que o banco
  aceita, e a que corresponde ao que a pessoa quis fazer ao arrastar. Efeito
  visível diferente do original: o cartão realmente muda de coluna.
*/
function nextStatus(current: TaskRow['status']): TaskRow['status'] {
  if (current === 'not_started') return 'in_progress'
  if (current === 'completed') return 'in_progress'
  return current
}

/* ── Os eventos automáticos do diário: a chave e o texto ───────────────── */

/*
  AS CHAVES, DERIVADAS DO FATO — id da tarefa e o que mudou nela. Nenhuma leva
  relógio, e é isso que faz a deduplicação existir (defeito 5 do plano): na
  versão nova as quatro carregam `Date.now()`, então a unicidade
  `(tenant_id, event_key)` nunca dispara e a consulta prévia que deveria
  deduplicar nunca acha nada.

  O ID DA TAREFA NÃO ESTÁ NA CHAVE DO ORIGINAL e entra aqui: lá a chave da
  mudança de etapa é `fase:<projeto>:<de>-><para>`, e duas tarefas do mesmo
  projeto percorrendo o mesmo caminho seriam o mesmo evento. O prefixo de cada
  uma é o do original, porque é o de/para registrado no COMMENT de
  `diary_system_event` (migration 0068).

  O QUE ISSO CUSTA, e é decisão consciente: a mesma tarefa refazendo o MESMO
  caminho (ir para Perspectivas, voltar para Layout e ir de novo) grava UM
  registro na linha do tempo, e a segunda ida devolve `already_recorded`. É o
  mesmo acordo que `useResolveProjectIssue` já fez na fatia 2 ("resolver, reabrir
  e resolver de novo grava UM registro"), e é o que idempotência significa quando
  a chave é o fato. NENHUM CARIMBO DE TEMPO entra na chave para contornar isso:
  seria a chave de idempotência do original de novo — a que existe por nome e não
  por efeito.

  FICAM AQUI, e não dentro do hook, porque são função pura do gesto: é o que
  permite conferir a chave sem subir a aplicação, e é o que garante que a chave
  escrita e a chave procurada sejam a mesma expressão.
*/
export const phaseEventKey = (projectId: string, move: TaskPhaseMove) =>
  `fase:${projectId}:${move.id}:${move.fromPhase}->${move.toPhase}`

export const responsibleEventKey = (projectId: string, taskId: string, responsibleId: string) =>
  `responsavel:${projectId}:${taskId}:${responsibleId}`

export const tagEventKey = (
  projectId: string,
  taskId: string,
  tag: OperationalTag,
  on: boolean,
) => `${on ? 'tag-on' : 'tag-off'}:${projectId}:${taskId}:${tag}`

/*
  O TEXTO DOS QUATRO EVENTOS, palavra por palavra de diaryAutoEvents.js:38-79 —
  com os rótulos em português vindos de `src/lib/enums.ts`, porque lá a coluna já
  guarda o rótulo e aqui ela guarda o valor do enum.

  As frases do original têm um `taskTitle ? ... : ...` porque nada garante que o
  gesto venha de uma tarefa. Aqui vem sempre, e `tasks.title` é NOT NULL — só o
  ramo com o título existe.

  O QUE A FRASE NÃO PRECISA MAIS CARREGAR: a etapa de origem, a de destino e a
  tag vão TAMBÉM em coluna (`from_phase`, `to_phase`, `operational_tag`, migration
  0069). O texto continua idêntico ao do original porque é o que a linha do tempo
  desenha; a diferença é que "Histórico de Revisões" e "Tempo por Etapa" deixam de
  precisar reler esse texto para saber o que aconteceu — o defeito 10 do plano.
*/
export function phaseChangeText(move: TaskPhaseMove): { title: string; description: string } {
  const from = labelOf(PROJECT_PHASE, move.fromPhase)
  const to = labelOf(PROJECT_PHASE, move.toPhase)

  return {
    title: `Projeto movido de ${from} → ${to}`,
    description: `Tarefa "${move.title}" movida. Etapa anterior: ${from}. Nova etapa: ${to}.`,
  }
}

export function responsibleChangeText(
  previousName: string | null,
  newName: string,
): { title: string; description: string } {
  return {
    title: `Responsável alterado: ${previousName ?? '—'} → ${newName}`,
    description: `O responsável da tarefa foi alterado de "${previousName ?? 'não definido'}" para "${newName}".`,
  }
}

export function tagEventText(
  taskTitle: string,
  tag: OperationalTag,
  on: boolean,
): { title: string; description: string } {
  const label = OPERATIONAL_TAG[tag]

  return {
    title: on ? `Marcado como ${label}` : `Retirado de ${label}`,
    description: on
      ? `Tarefa "${taskTitle}" marcada com a tag "${label}".`
      : `Tarefa "${taskTitle}" retirada da tag "${label}".`,
  }
}
