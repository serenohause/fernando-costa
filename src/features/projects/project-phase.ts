import { PROJECT_PHASE, type ProjectPhase } from '@/lib/enums'
import type { Task } from './types'

/* A ordem das colunas do kanban, que é a ordem de declaração do enum. */
export const PHASE_ORDER = Object.keys(PROJECT_PHASE) as ProjectPhase[]

export function phaseIndex(phase: ProjectPhase): number {
  return PHASE_ORDER.indexOf(phase)
}

/*
  Porta de projeto-original/src/components/utils/projectPhaseCalculator.jsx.

  Diferente do PROGRESSO, que virou a view `project_progress`, a FASE do projeto
  continua sendo coluna gravada — e de propósito (migration 0032): ela também é
  arrastada à mão no kanban de projetos do original, ou seja, nem toda mudança
  vem das tarefas. Uma view não teria como representar as duas origens.

  A regra é a do original, inclusive na ordem em que ele testa:

  1. Projeto sem tarefa nenhuma está em "Não iniciado".
  2. Tarefa em "Aguardando Cliente" não concluída vence tudo — é a fase do
     projeto, mesmo havendo tarefa mais avançada.
  3. Fora isso, a fase é a MAIS AVANÇADA que ainda tem tarefa por concluir,
     varrida da mais avançada para a mais inicial.
  4. Tudo concluído é "Finalizado" — o único lugar do sistema onde
     `project_phase` recebe esse valor.

  `not_started` não entra na varredura do item 3, como no original: tarefa não
  iniciada não puxa o projeto de volta para o começo.

  `under_construction` (migration 0061) ENTRA NA VARREDURA, e entra no TOPO dela:
  obra é a fase mais avançada que uma tarefa pode ter, então um projeto com
  qualquer tarefa aberta em "Em Obra" está em "Em Obra" — vence inclusive
  "Alvará de Construção", que é o passo anterior. O que NÃO muda é a regra 2:
  "Aguardando Cliente" continua vencendo tudo, obra inclusive, porque ela não é
  um degrau do fluxo e sim um bloqueio dele.

  Sem essa entrada, a fase nunca seria devolvida e — pior — o projeto cuja única
  tarefa aberta está em obra caía direto no `return 'finished'` do fim da função,
  ou seja, era calculado como CONCLUÍDO com trabalho em andamento.

  `preliminary_study` e `preliminary_design` (migration 0079) ENTRAM PELA MESMA
  RAZÃO, e a falta delas aqui foi um defeito real: a 0079 acrescentou os dois
  valores ao enum sem tocar nesta lista, e 4 projetos do escritório cujas únicas
  tarefas abertas estão em "Estudo preliminar" cairiam no `return 'finished'` —
  calculados como CONCLUÍDOS com o projeto ainda por começar. Medido antes de
  corrigir.

  A POSIÇÃO É A DO FLUXO, invertida: briefing → estudo preliminar → layout →
  anteprojeto → perspectivas. Esta lista vai da fase mais avançada para a mais
  inicial, então as duas entram logo ANTES das suas sucessoras.

  A LIÇÃO, escrita para a próxima: valor novo em `project_phase` precisa de três
  coisas, e nenhuma delas o compilador cobra — percentual na escala de
  `project_progress`, lugar nesta lista, e (se for para aparecer) coluna no
  kanban. Faltar a primeira dá progresso zerado; faltar a segunda dá projeto
  concluído por engano; faltar a terceira some com a tarefa da tela.
*/
const ADVANCED_TO_INITIAL: ProjectPhase[] = [
  'under_construction',
  'building_permit',
  'engineering_docs',
  'construction_docs',
  'hoa_approval',
  'legal_permit',
  'revision',
  'renderings',
  'preliminary_design',
  'layout',
  'preliminary_study',
  'briefing',
]

/* Só o que o cálculo lê. Deixa a função servir tanto à lista completa do kanban
   quanto ao recorte de três colunas que o hook busca depois de gravar. */
export type TaskPhaseSource = Pick<Task, 'project_id' | 'phase' | 'status'>

export function calculateProjectPhase(
  projectId: string,
  allTasks: TaskPhaseSource[],
): ProjectPhase {
  const projectTasks = allTasks.filter((task) => task.project_id === projectId)

  if (projectTasks.length === 0) return 'not_started'

  const hasWaitingClient = projectTasks.some(
    (task) => task.phase === 'awaiting_client' && task.status !== 'completed',
  )
  if (hasWaitingClient) return 'awaiting_client'

  for (const phase of ADVANCED_TO_INITIAL) {
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
