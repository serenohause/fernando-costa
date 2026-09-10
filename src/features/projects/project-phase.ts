import type { PhaseKey } from '@/lib/enums'
import type { Task } from './types'

/*
  Porta de projeto-original/src/components/utils/projectPhaseCalculator.jsx.

  Diferente do PROGRESSO, que virou a view `project_progress`, a FASE do projeto
  continua sendo coluna gravada — e de propósito (migration 0032): ela também é
  arrastada à mão no kanban de projetos do original, ou seja, nem toda mudança
  vem das tarefas. Uma view não teria como representar as duas origens.

  A ESCADA DE ETAPAS VEM DE FORA desde a migration 0094, e essa é a mudança que
  vale entender. Antes ela era uma lista escrita aqui, na ordem de declaração do
  enum `project_phase`. Agora a etapa é uma linha de `kanban_columns` que o
  escritório cria, renomeia e reordena — então a ordem certa é a
  `display_order` do quadro, e quem a lê é quem chama (`syncProjectFromTasks`).

  Isso apagou uma armadilha antiga. A lista daqui precisava ser atualizada à mão
  a cada valor novo do enum, e não foi: a 0079 acrescentou `preliminary_study` e
  `preliminary_design` sem tocar nela, e 4 projetos cujas únicas tarefas abertas
  estavam em "Estudo preliminar" caíam no `return 'finished'` do fim — eram
  calculados como CONCLUÍDOS com o projeto ainda por começar. Com a escada vindo
  do quadro, etapa nova entra na conta no instante em que passa a existir.

  A regra é a do original, inclusive na ordem em que ele testa:

  1. Projeto sem tarefa nenhuma está em "Não iniciado".
  2. Tarefa em "Aguardando Cliente" não concluída vence tudo — é a fase do
     projeto, mesmo havendo tarefa mais avançada. Não é um degrau do fluxo, é um
     bloqueio dele.
  3. Fora isso, a fase é a MAIS AVANÇADA que ainda tem tarefa por concluir,
     varrida da mais avançada para a mais inicial.
  4. Tudo concluído é "Finalizado" — o único lugar do sistema, junto com o item
     1, onde `projects.current_phase` recebe um valor que ninguém arrastou. É por
     isso que a 0094 protege essas duas etapas contra exclusão.

  `not_started` não entra na varredura do item 3, como no original: tarefa não
  iniciada não puxa o projeto de volta para o começo. `finished` também não —
  não é fase de tarefa (`tasks_phase_not_finished_check`).
*/

/* Só o que o cálculo lê. Deixa a função servir tanto à lista completa do kanban
   quanto ao recorte de três colunas que o hook busca depois de gravar. */
export type TaskPhaseSource = Pick<Task, 'project_id' | 'phase' | 'status'>

/*
  A CHAVE QUE O ORIGINAL TRATA COMO BLOQUEIO, e não como degrau. Continua sendo
  um literal porque a regra é do domínio, não do desenho do quadro: um escritório
  que oculte ou renomeie "Aguardando Cliente" não muda o fato de que esperar o
  cliente pausa o projeto. Se a etapa for apagada, nenhuma tarefa poderá estar
  nela (a chave estrangeira garante), e a regra deixa de ter o que fazer sozinha.
*/
const AWAITING_CLIENT = 'awaiting_client'

export function calculateProjectPhase(
  projectId: string,
  allTasks: TaskPhaseSource[],
  /* As chaves das etapas do quadro, na ordem em que ele as desenha. Inclui as
     ocultas: tarefa numa etapa fora do quadro ainda é trabalho aberto. */
  orderedKeys: string[],
): PhaseKey {
  const projectTasks = allTasks.filter((task) => task.project_id === projectId)

  if (projectTasks.length === 0) return 'not_started'

  const hasWaitingClient = projectTasks.some(
    (task) => task.phase === AWAITING_CLIENT && task.status !== 'completed',
  )
  if (hasWaitingClient) return AWAITING_CLIENT

  const advancedToInitial = orderedKeys
    .filter((key) => key !== 'not_started' && key !== 'finished')
    .reverse()

  for (const phase of advancedToInitial) {
    /* O original testa `phaseTasks.length > 0 &&` antes do `some`, o que não
       muda nada: `some` já é falso em lista vazia. */
    if (projectTasks.some((task) => task.phase === phase && task.status !== 'completed')) {
      return phase
    }
  }

  return 'finished'
}

/* "Se todas as tarefas do projeto estão concluídas, o projeto está concluído"
   (Tasks.jsx:170-179). Projeto sem tarefa nenhuma não conta como concluído. */
export function allTasksCompleted(projectId: string, allTasks: TaskPhaseSource[]): boolean {
  const projectTasks = allTasks.filter((task) => task.project_id === projectId)
  return projectTasks.length > 0 && projectTasks.every((task) => task.status === 'completed')
}
