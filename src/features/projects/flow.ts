import { format } from 'date-fns'
import type { ProjectPhase, TaskPhase } from '@/lib/enums'
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
      },
    }
  }

  return {
    kind: 'move',
    move: {
      id: task.id,
      phase: toPhase,
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
      newChecklistItems: missingChecklistItems(toPhase, task.checklist),
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
