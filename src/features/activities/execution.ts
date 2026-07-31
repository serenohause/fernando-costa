import type { WorkStatus } from '@/lib/enums'
import type { Activity } from './types'

/*
  Os gestos de execução da atividade, como colunas a gravar. Função pura: o QUE
  decidir vive aqui, a gravação vive em hooks.ts — mesmo desenho de
  src/features/projects/flow.ts.

  NENHUM dos patches carrega `total_minutes`. No original o tempo é calculado no
  navegador no clique de Concluir (Atividades.jsx:197) e gravado; aqui é coluna
  GERADA de `started_at` e `completed_at` (migration 0037, item 3), e escrita
  direta é recusada pelo Postgres com 428C9.
*/

export type ExecutionPatch = Partial<
  Pick<
    Activity,
    | 'status'
    | 'started_at'
    | 'started_by'
    | 'completed_at'
    | 'completed_by'
    | 'execution_order'
    | 'deleted_at'
    | 'deleted_by'
  >
>

/*
  "Começar agora" (Atividades.jsx:181-192). `started_at` só é gravada na primeira
  vez — recomeçar uma atividade já iniciada não zera o relógio, como no original
  (`data_inicio_real: atividade.data_inicio_real || now`). `started_by` é sempre
  quem clicou, também como no original.
*/
export function startPatch(activity: Activity, collaboratorId: string): ExecutionPatch {
  return {
    status: 'in_progress',
    started_at: activity.started_at ?? new Date().toISOString(),
    started_by: collaboratorId,
  }
}

/*
  "Concluir" (Atividades.jsx:194-209), mais uma coluna que o original não toca:
  `execution_order` volta a ser nula.

  Atividade concluída sai da fila do responsável. O banco cobra isso da EXCLUÍDA
  por check (`activities_deleted_has_no_execution_order_check`) e não da
  concluída, mas o raciocínio é o mesmo — a próxima reordenação daquela pessoa
  colidiria com uma posição ocupada por uma linha que a fila não mostra mais.
*/
export function completePatch(collaboratorId: string): ExecutionPatch {
  return {
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: collaboratorId,
    execution_order: null,
  }
}

/*
  A exclusão, que é UPDATE e não DELETE (migration 0037, item 2).

  O original tem quatro campos para isto — bandeira, data e dois de autor — e
  nenhuma amarração entre eles. Aqui são dois, presos por check
  (`activities_deleted_pair_check`): os dois nulos, ou os dois preenchidos.
  `execution_order` vai junto porque o banco a exige nula na linha excluída.
*/
export function softDeletePatch(collaboratorId: string): ExecutionPatch {
  return {
    deleted_at: new Date().toISOString(),
    deleted_by: collaboratorId,
    execution_order: null,
  }
}

/*
  O acoplamento que o select de Status do formulário obriga.

  `activities_completed_at_matches_status_check` cobra a igualdade nos DOIS
  sentidos: concluída exige data/hora de conclusão, e data/hora de conclusão
  exige status concluída. No original o select marca "Concluída" sem tocar em
  `data_conclusao_real` (Atividades.jsx:175), e a atividade concluída por ali
  fica fora de qualquer relatório por período e sem tempo total. Aqui a mesma
  escolha na tela grava as duas colunas juntas — do contrário o banco recusaria a
  gravação inteira com 23514.

  Marcar como concluída também tira a atividade da fila, pelo mesmo motivo de
  `completePatch`. Desmarcar limpa o par de conclusão inteiro: data sem autor (ou
  o contrário) é registro de auditoria que não diz quem entregou.
*/
export function applyStatus(
  status: WorkStatus,
  current: Activity | null,
  collaboratorId: string | undefined,
): ExecutionPatch {
  if (status !== 'completed') {
    return { completed_at: null, completed_by: null }
  }

  if (current?.completed_at) {
    return { completed_at: current.completed_at, completed_by: current.completed_by }
  }

  return {
    completed_at: new Date().toISOString(),
    completed_by: collaboratorId ?? null,
    execution_order: null,
  }
}
