import type { Tables } from '@/lib/database.types'
import type {
  ContractType,
  ProjectPhase,
  ProjectStatus,
  TaskPhase,
  TaskPriority,
  TaskType,
  WorkStatus,
} from '@/lib/enums'

export type Project = Tables<'projects'>
export type Task = Tables<'tasks'>
export type TaskChecklistItem = Tables<'task_checklist_items'>

/*
  A linha da view `project_progress` (migrations 0034/0035).

  TODAS as colunas chegam anuláveis do gerador de tipos — view não declara NOT
  NULL — mas nenhuma delas é nula de fato: a view devolve uma linha por projeto,
  inclusive projeto sem tarefa nenhuma, e o `coalesce`/`case` garante 0 em vez de
  nulo. O `?? 0` de quem lê existe para o compilador, não para o dado.

  `progresso_percentual`, `tarefas_total_obrigatorias` e
  `tarefas_concluidas_obrigatorias` NÃO existem em `projects`: eram colunas que o
  frontend do base44 calculava e gravava de volta
  (components/utils/projectProgressCalculator.jsx). Aquele arquivo não foi
  portado — o cálculo é do banco agora.
*/
export type ProjectProgress = {
  project_id: string | null
  progress_percent: number | null
  phase_percent: number | null
  tasks_total: number | null
  tasks_completed: number | null
  required_items_total: number | null
  required_items_completed: number | null
}

/* Um colaborador como as telas deste módulo o exibem: só o nome. */
export type PersonRef = { id: string; name: string }

/*
  O projeto como a lista o lê: a linha mais os três nomes que a tela mostra.

  `client_name`, `contract_number`, `commercial_responsible_name` e
  `responsible_name` saíram do schema (migration 0032, item 3): a lista quer o
  nome ATUAL, e no original ele congela no momento em que o projeto foi criado.
  Voltam como embed.

  Os DOIS responsáveis são colunas distintas de propósito (item E do módulo):
  `commercial_responsible_id` é quem vendeu, definido aqui; e
  `operational_responsible_id` é quem executa, definido no Fluxo do Projeto.
*/
export type ProjectRow = Project & {
  client: PersonRef | null
  commercial_responsible: PersonRef | null
  operational_responsible: PersonRef | null
  /* `contract_number` era coluna copiada em `Project` e saiu do schema. Vem pelo
     `contract_id`, que é o LADO ÚNICO da ligação: `contracts` não tem
     `project_id` (item D do módulo). É por este número que a lista ordena
     quando ninguém arrastou a linha — ver list.ts. */
  contract: { id: string; contract_number: string } | null
}

/*
  A tarefa como o kanban a lê.

  `project_name` e `responsible_name` viram embed, pelo mesmo motivo de cima.
  `checklist_tarefa` era array de objeto DENTRO da linha, com o item marcado por
  ÍNDICE (TaskKanban.jsx:260-270) — o que erra o alvo assim que a lista é
  reordenada ou um item é removido. Agora é `task_checklist_items`, uma linha por
  item, com id próprio: marcar é UPDATE por id.
*/
export type TaskRow = Task & {
  project: PersonRef | null
  responsible: PersonRef | null
  checklist: TaskChecklistItem[]
}

/*
  O que o formulário de projeto edita — e é MENOS do que a tabela tem, como no
  original.

  ProjectForm.jsx tem dois modos. O que a tela de Projetos abre é o modo comum;
  o outro (`isMapMode`) é o formulário de propriedade do mapa, e é ele que edita
  `terreno_tipo`, `finalidade_projeto`, loteamento e as áreas em m². Aquelas
  quatro coisas viram `project_land_types`, `project_purposes` e as colunas
  `subdivision_*`/`*_area_m2`, e quem as escreve é o MÓDULO 9.

  FORA DAQUI TAMBÉM, e cada um por um motivo:

  - `current_phase` — no original é mantida pelo cálculo sobre as tarefas
    (projectPhaseCalculator) e pelo arrastar do kanban, nunca por este
    formulário.
  - `visible_in_list` — o original também não a expõe. Projeto nasce invisível e
    é a aprovação do contrato que o mostra (migration 0032).
  - `contract_id`, `operational_responsible_id`, `total_value` e os cinco
    `*_days` — chegam do contrato quando o projeto nasce da aprovação, ou do
    Fluxo do Projeto. Como o UPDATE manda só as colunas deste objeto, salvar
    pelo formulário não apaga nenhuma delas.
  - Os OITO campos `obra_*` de geolocalização — MÓDULO 9 (decisão 1 do
    SCHEMA-PLAN). `site_address_text` fica porque é a ENTRADA da geocodificação,
    não o resultado dela.
*/
export type ProjectInput = {
  name: string
  client_id: string | null
  project_type: ContractType
  city: string | null
  state: string | null
  site_address_text: string | null
  commercial_responsible_id: string | null
  start_date: string | null
  status: ProjectStatus
  notes: string | null
}

/*
  O que o formulário de tarefa edita.

  `phase` e `status` estão no `useState` do TaskForm.jsx do original e NENHUM dos
  dois tem campo na tela — quem os move é o arrastar do kanban. Ficam aqui para
  que salvar uma tarefa não devolva a fase para o começo.

  `completion_date` não entra: ela é amarrada a `status` por check nos dois
  sentidos (migration 0032), e quem os escreve juntos é a mudança de coluna do
  kanban. `spent_hours` também não — o original não a edita em lugar nenhum
  (alimenta o relatório do módulo 6).
*/
export type TaskInput = {
  title: string
  project_id: string | null
  responsible_id: string | null
  task_type: TaskType | null
  priority: TaskPriority
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  description: string | null
  phase: TaskPhase
  status: WorkStatus
}

/* O que a mudança de coluna do kanban grava. Ver `useMoveTaskPhase`. */
export type TaskPhaseMove = {
  id: string
  phase: TaskPhase
  status: WorkStatus
  completion_date: string | null
  /* Itens do template da nova etapa que a tarefa ainda não tem. */
  newChecklistItems: { title: string; phase: TaskPhase; is_required: boolean; display_order: number }[]
  /*
    O GESTO, e não a gravação — quem precisa destes três é o evento automático do
    diário (`phase_change`), que registra de ONDE para ONDE em coluna própria
    (`from_phase`/`to_phase`, migration 0069) em vez de deixar a etapa dentro do
    texto do título, que é o defeito 10 do plano.

    `toPhase` NÃO É `phase`, e a diferença aparece numa coluna só: soltar em
    "Finalizado" conclui a tarefa sem mexer na etapa dela (ver `moveTaskToPhase`),
    então ali `phase` continua sendo a etapa em que a tarefa parou e `toPhase` é
    `finished` — a coluna para onde o cartão foi, que é o que a versão nova
    registra no diário (TaskKanban.jsx:220-227).
  */
  title: string
  fromPhase: ProjectPhase
  toPhase: ProjectPhase
}

export type { ProjectPhase, TaskPhase }
