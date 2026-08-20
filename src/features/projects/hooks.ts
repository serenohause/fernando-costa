import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import {
  diaryKeys,
  recordDiaryEvent,
  type RecordedDiaryEvent,
} from '@/features/diary/hooks'
import type { OperationalTag } from '@/lib/enums'
import {
  phaseChangeText,
  phaseEventKey,
  responsibleChangeText,
  responsibleEventKey,
  tagEventKey,
  tagEventText,
} from './flow'
import { projectInputSchema, taskInputSchema } from './schemas'
import { allTasksCompleted, calculateProjectPhase, type TaskPhaseSource } from './project-phase'
import type {
  PersonRef,
  ProjectInput,
  ProjectProgress,
  ProjectRow,
  TaskInput,
  TaskPhaseMove,
  TaskRow,
} from './types'

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  progress: () => [...projectKeys.all, 'progress'] as const,
  tasks: () => [...projectKeys.all, 'tasks'] as const,
}

/* `Project.list('-created_date')` e `Task.list('-created_date')` são como o
   original carrega as duas telas. */
const LIST_LIMIT = 500

const PROJECTS_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    APAGAR UM PROJETO esbarra no que aponta para ele sem cascade. Dinheiro e
    histórico não somem junto com o projeto — é a mesma regra que vale para
    cliente e colaborador.
  */
  accounts_receivable_project_id_fkey:
    'Este projeto tem parcelas em Contas a Receber. Dinheiro a receber não é excluído junto — resolva as parcelas antes.',
  accounts_payable_project_id_fkey:
    'Este projeto tem lançamentos em Contas a Pagar. Resolva os lançamentos antes de excluir o projeto.',
  activities_project_id_fkey:
    'Este projeto tem atividades vinculadas. Exclua ou desvincule as atividades antes.',
  budget_checklists_project_id_fkey:
    'Este projeto tem checklist em Orçamento por Cliente. Exclua o checklist antes.',
  project_checklist_items_project_id_title_key:
    'Este projeto já tem um item de checklist com este título. Renomeie um dos dois para eles não se confundirem na conferência.',
  project_land_types_project_id_land_type_key:
    'Este tipo de terreno já está marcado neste projeto.',
  project_purposes_project_id_purpose_key:
    'Esta finalidade já está marcada neste projeto.',
  /*
    POR NOME DE CONSTRAINT, e não por código: `23503` aqui são duas situações
    opostas. A frase do código descreve o projeto apontando para algo que sumiu;
    esta descreve algo que aponta para o projeto e continua de pé.

    `map_properties.project_id` não tem cascade (migration 0057), de propósito:
    apagar um projeto não pode apagar em silêncio o pino que a equipe posicionou
    no mapa. A recusa é o comportamento certo — o que faltava era dizer o que
    aconteceu e onde a pessoa resolve.
  */
  map_properties_project_id_fkey:
    'Este projeto tem propriedade marcada no Mapa, e ela não é excluída junto. Remova ou desvincule a propriedade no Mapa antes de excluir o projeto.',

  '23505': 'Já existe um registro com esses dados neste escritório.',
  '23503':
    'O cliente, o contrato ou o responsável informado não existe mais neste escritório.',
  '23502': 'Falta um campo obrigatório: nome do projeto e tipo de projeto.',
  /*
    Os checks da migration 0032. Os schemas normalizam antes de gravar, então
    chegar aqui significa gravação vinda de outro caminho — a frase existe para
    não virar nome de constraint na tela.
  */
  '23514':
    'Algum campo está fora do que o sistema aceita. Confira as datas, as áreas e os prazos.',
}

const TASKS_ERROR_MESSAGES: DatabaseErrorMessages = {
  task_checklist_items_task_id_title_key:
    'Esta tarefa já tem um item de checklist com este título. Renomeie um dos dois para eles não se confundirem na conferência.',
  ...PROJECTS_ERROR_MESSAGES,
  '23502': 'Falta um campo obrigatório: título da tarefa.',
  /*
    Três checks caem aqui, e todos são estado que o base44 aceita:
    `tasks_phase_not_finished_check`, `tasks_priority_not_urgent_check` e
    `tasks_completion_date_matches_status_check` (concluída exige data, e data
    exige concluída, nos dois sentidos).
  */
  '23514':
    'A tarefa está num estado que o sistema não aceita. Confira a etapa, o prazo e a data de conclusão.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, PROJECTS_ERROR_MESSAGES)
}

export function describeTaskError(error: unknown): string {
  return describeError(error, TASKS_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  UMA consulta traz a lista com o que a tela mostra.

  As desnormalizações do base44 (`client_name`, `contract_number`,
  `commercial_responsible_name`, `responsible_name`) não existem no schema — a
  migration 0032 as removeu porque a lista quer o nome ATUAL. Voltam como embed,
  e o nome do relacionamento é o da CONSTRAINT, não o da tabela: as FK deste
  módulo são compostas (`(client_id, tenant_id)`), e `clients!inner(...)` não
  desambigua sozinho. Dois embeds saem da MESMA tabela (`collaborators`), o que
  torna o nome da constraint obrigatório e não só preferível.

  Leitura larga por decisão da policy `projects_select_active_collaborator`
  (migration 0033): qualquer colaborador ativo do escritório lê. Quem esconde o
  item Projetos da sidebar é a permissão de menu, não a RLS.
*/
const PROJECTS_SELECT = `
  *,
  client:clients!projects_client_id_fkey(id, name),
  commercial_responsible:collaborators!projects_commercial_responsible_id_fkey(id, name),
  operational_responsible:collaborators!projects_operational_responsible_id_fkey(id, name),
  contract:contracts!projects_contract_id_fkey(id, contract_number)
`

/*
  Só projeto visível, como nas DUAS telas do original (Projects.jsx:56 e
  Tasks.jsx:82, os dois filtrando `visivel_em_projetos === true`).

  A diferença é onde o filtro roda: lá a lista inteira desce para o navegador e é
  peneirada em memória; aqui é `WHERE visible_in_list`, que é justamente o
  recorte do índice parcial `projects_tenant_id_display_order_idx`. Mesmo
  resultado em tela, sem trazer o que a tela vai jogar fora.
*/
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECTS_SELECT)
        .eq('visible_in_list', true)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as ProjectRow[]
    },
  })
}

/*
  O progresso, que no original era COLUNA de `Project` e agora é a view
  `project_progress` (migrations 0034/0035).

  Consulta separada, e não embed: `projects` não tem FK para a view, então o
  PostgREST não a encaixa no select de cima. O cruzamento acontece por
  `project_id` na tela, que é o mesmo `find` que o original faz
  (TaskKanban.jsx:191-194) — a diferença é que o número vem calculado do banco em
  vez de gravado pelo navegador.

  A view é SECURITY INVOKER: as policies da 0033 valem para quem consulta, e não
  para o dono. Ninguém lê o progresso de projeto de outro escritório por aqui.
*/
export function useProjectProgress() {
  return useQuery({
    queryKey: projectKeys.progress(),
    queryFn: async (): Promise<Map<string, ProjectProgress>> => {
      const { data, error } = await supabase
        .from('project_progress')
        .select(
          'project_id, progress_percent, phase_percent, tasks_total, tasks_completed, required_items_total, required_items_completed',
        )
        .limit(LIST_LIMIT)

      if (error) throw error

      const byProject = new Map<string, ProjectProgress>()
      for (const row of data ?? []) {
        if (row.project_id) byProject.set(row.project_id, row)
      }
      return byProject
    },
  })
}

/*
  O quadro inteiro numa consulta, com o checklist junto.

  No original o checklist é array dentro da linha da tarefa; aqui é
  `task_checklist_items`, uma linha por item, com id próprio (item C do módulo).
  O embed traz os itens completos porque a tela precisa de `is_required`,
  `is_completed` e `phase` para desenhar o contador e para saber se pode avançar.

  A ORDEM dos itens não é pedida ao banco: `display_order` é anulável e o
  original ordena em memória (`.sort((a,b) => (a.ordem||0)-(b.ordem||0))`,
  TaskKanban.jsx:549). Continua em memória, no componente.
*/
const TASKS_SELECT = `
  *,
  project:projects!tasks_project_id_fkey(id, name),
  responsible:collaborators!tasks_responsible_id_fkey(id, name),
  checklist:task_checklist_items(*)
`

export function useTasks() {
  return useQuery({
    queryKey: projectKeys.tasks(),
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASKS_SELECT)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as TaskRow[]
    },
  })
}

/* ── Efeito colateral compartilhado ────────────────────────────────────── */

/*
  Recalcular a fase do projeto depois de mexer nas tarefas dele.

  É o `updateProjectPhase` que Tasks.jsx chama em toda criação, edição, exclusão
  e mudança de coluna. Continua existindo porque `projects.current_phase` é
  coluna gravada de propósito (ver project-phase.ts) — diferente do PROGRESSO,
  que virou view e não precisa de ninguém para se manter em dia.

  TRÊS DIFERENÇAS EM RELAÇÃO AO ORIGINAL:

  1. O original relista TODAS as tarefas do escritório para recalcular uma fase
     (`Task.list()` a cada gesto). Aqui a consulta é das tarefas DAQUELE projeto,
     e de três colunas.
  2. Falhar aqui NÃO derruba o gesto. Esta escrita é em `projects`, e quem está
     no Fluxo do Projeto tem `can_edit_menu('project_flow')` — não
     necessariamente `can_edit_menu('projects')`. Nesse caso a RLS não alcança a
     linha, o PostgREST devolve zero linhas sem erro, e a fase simplesmente não
     acompanha. Recusar a tarefa por causa disso seria pior: a tarefa já mudou.
  3. "Todas as tarefas concluídas → projeto concluído" (Tasks.jsx:170-179) entra
     no MESMO update, e não numa segunda chamada. No original são duas escritas,
     e uma falha no meio deixa a fase em "Finalizado" com o status por atualizar.
*/
async function syncProjectFromTasks(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from('tasks')
    .select('project_id, phase, status')
    .eq('project_id', projectId)

  if (error) {
    console.error('[projects] falha ao reler as tarefas do projeto:', error)
    return
  }

  const tasks = (data ?? []) as TaskPhaseSource[]
  const patch: { current_phase: ReturnType<typeof calculateProjectPhase>; status?: 'completed' } = {
    current_phase: calculateProjectPhase(projectId, tasks),
  }
  if (allTasksCompleted(projectId, tasks)) patch.status = 'completed'

  const { error: updateError } = await supabase.from('projects').update(patch).eq('id', projectId)
  if (updateError) {
    console.error('[projects] falha ao atualizar a fase do projeto:', updateError)
  }
}

/* ── Escrita: projetos ─────────────────────────────────────────────────── */

/*
  O QUE O ORIGINAL FAZ AQUI E ESTE MÓDULO NÃO FAZ (Projects.jsx:90-114): projeto
  criado já visível e com cliente dispara a criação automática de uma `Task`
  homônima no kanban. O gatilho não chega a acontecer pela tela — o formulário
  não escreve `visivel_em_projetos`, e a coluna nasce falsa (migration 0032) —,
  então portar o encadeamento significaria escrever código que nenhum gesto
  alcança. Quem levanta `visible_in_list` é a aprovação do contrato, e é lá que a
  criação automática precisa acontecer, numa transação só. Está registrado como
  pendência do módulo 4/5.
*/
export function useCreateProject() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = projectInputSchema.parse(input)

      const { data, error } = await supabase
        .from('projects')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/*
  O original faz mais duas coisas neste mesmo gesto (Projects.jsx:123-147):
  quando o nome do projeto muda, ele varre `Contract` e `Task` e reescreve
  `project_name` em cada linha encontrada. As duas cópias deixaram de existir —
  `tasks.project_name` virou join, e `contracts.project_name` é texto digitado no
  formulário do contrato, que não é o nome deste projeto. Renomear aqui já
  aparece renomeado em toda tela que lê o nome pelo join, sem escrita nenhuma.
*/
export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ProjectInput }) => {
      const parsed = projectInputSchema.parse(input)

      const { data, error } = await supabase
        .from('projects')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      /*
        `projects_update_projects_editor` filtra por USING: sem can_edit no menu
        `projects` (nem ser Diretor), nenhuma linha é alcançada e o PostgREST
        devolve zero linhas, SEM erro. Sem esta conferência a tela diria
        "atualizado com sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhum projeto foi alterado. É preciso permissão de edição em Projetos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/*
  Exclusão do projeto. As tarefas vão junto, mas quem as leva é o banco:
  `tasks_project_id_fkey` tem ON DELETE CASCADE (migration 0032), e o mesmo vale
  para o checklist e para as tags.

  No original isso é uma segunda varredura no navegador depois de apagar o
  projeto, e uma falha no meio deixa tarefa apontando para projeto que não existe
  mais.
*/
export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum projeto foi excluído. É preciso permissão de edição em Projetos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/*
  O arrastar da lista, que grava `display_order` (Projects.jsx:229-248).

  DUAS DIFERENÇAS EM RELAÇÃO AO ORIGINAL, as mesmas já decididas na lista de
  Contratos (módulo 4), e as duas são sobre não escrever à toa:

  1. Só as linhas que MUDARAM de posição são gravadas. O original manda um update
     por projeto da lista inteira, em `Promise.all`, mesmo para as que ficaram
     onde estavam.
  2. A ordem gravada é a da lista COMPLETA, e não a da filtrada. No original o
     índice sai de `filteredProjects` (linha 232): arrastar com um filtro de
     status ativo reescreve a ordem de todo mundo usando a posição dentro do
     filtro, e os projetos escondidos herdam índices repetidos.
*/
export function useReorderProjects() {
  const queryClient = useQueryClient()

  return useMutation({
    /*
      A ORDEM MUDA ANTES DA IDA AO BANCO — mesmo defeito visual dos quadros (ver
      `useMoveTaskPhase`). A lista é ordenada por `display_order` no cliente
      (`list.ts`), então basta escrever no cache a posição nova de cada linha
      para a linha arrastada pousar onde foi solta em vez de voltar ao lugar de
      origem e pular depois.
    */
    onMutate: async (ordered: { id: string; display_order: number | null }[]) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.list() })

      const previous = queryClient.getQueryData<ProjectRow[]>(projectKeys.list())
      if (previous) {
        /* A mesma conta que o `mutationFn` grava: a posição no array VIRA o
           `display_order`. Repetir a regra em dois lugares é o que faz o palpite
           bater com o que o servidor vai devolver. */
        const positions = new Map(ordered.map((project, index) => [project.id, index]))
        queryClient.setQueryData<ProjectRow[]>(
          projectKeys.list(),
          previous.map((project) => {
            const position = positions.get(project.id)
            return position === undefined ? project : { ...project, display_order: position }
          }),
        )
      }

      return { previous }
    },
    mutationFn: async (ordered: { id: string; display_order: number | null }[]) => {
      const changed = ordered
        .map((project, index) => ({ id: project.id, index }))
        .filter(({ index }) => ordered[index].display_order !== index)

      if (changed.length === 0) return 0

      const results = await Promise.all(
        changed.map(({ id, index }) =>
          supabase.from('projects').update({ display_order: index }).eq('id', id).select('id'),
        ),
      )

      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error

      assertRowAffected(
        results[0]?.data,
        'A ordem não foi alterada. É preciso permissão de edição em Projetos.',
      )
      return changed.length
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(projectKeys.list(), context.previous)
      }
    },
    /*
      `onSettled`, e aqui há um motivo extra: a gravação são vários UPDATE em
      paralelo, um por linha que mudou de posição. Se o terceiro falhar, os dois
      primeiros já passaram — a ordem no banco não é nem a antiga nem a nova.
      Só o servidor sabe em que estado ficou.
    */
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/* ── Escrita: tarefas ──────────────────────────────────────────────────── */

export function useCreateTask() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: TaskInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = taskInputSchema.parse(input)

      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('id, project_id')
        .single()

      if (error) throw error
      if (data.project_id) await syncProjectFromTasks(data.project_id)
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TaskInput }) => {
      const parsed = taskInputSchema.parse(input)

      const { data, error } = await supabase
        .from('tasks')
        .update(parsed)
        .eq('id', id)
        .select('id, project_id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma tarefa foi alterada. É preciso permissão de edição no Fluxo do Projeto.',
      )

      const projectId = data![0].project_id
      if (projectId) await syncProjectFromTasks(projectId)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string | null }) => {
      const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma tarefa foi excluída. É preciso permissão de edição no Fluxo do Projeto.',
      )

      if (projectId) await syncProjectFromTasks(projectId)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/* ── Os eventos automáticos do diário ──────────────────────────────────── */

/*
  QUATRO GESTOS DO FLUXO DO PROJETO SE ESCREVEM NO DIÁRIO SOZINHOS: mover o
  cartão, trocar o responsável, ligar e desligar a tag operacional. Quem grava é
  `recordDiaryEvent` (src/features/diary/hooks.ts), que chama a função
  `record_project_diary_event` do banco.

  POR QUE AQUI, E NUNCA NO COMPONENTE: na versão nova as quatro chamadas estão
  dentro do JSX do cartão (TaskKanban.jsx:216-232, :385-393, :534-570), e é de lá
  que vêm dois dos defeitos do plano — o evento do arraste é gravado ANTES da
  validação de checklist que pode barrar o movimento (defeito 4: o diário
  registra o que não aconteceu), e cada chamada monta a sua própria chave, todas
  com `Date.now()` (defeito 5). Aqui o evento é passo do MESMO hook que grava, e
  vem sempre DEPOIS do `assertRowAffected`: só é registrado o que o banco
  confirmou ter mudado.

  A PERMISSÃO É A DO FLUXO, e a tela não acrescenta trava nenhuma. A função do
  banco confere `can_edit_menu('project_flow')` por dentro — a mesma permissão de
  quem move o cartão — e não a do diário: uma Arquiteta ativa com permissão de
  Fluxo grava o evento automático sem poder escrever no diário à mão, que é
  exatamente o desenho da migration 0070 e o modo de falha silenciosa que ela
  existe para evitar.

  TAREFA SEM PROJETO NÃO GERA EVENTO: o diário é do projeto, e a função recusaria
  com `project_not_found`. O evento volta `null`, e `null` não é falha — a tela só
  avisa quando `outcome` é `failed`.
*/
type TaskDiaryEvent = RecordedDiaryEvent | null

/*
  A mudança de coluna do kanban — o gesto central da tela.

  Grava a etapa, o andamento, a data de conclusão, a limpeza da tag operacional e
  os itens de checklist que a nova etapa acrescenta. O QUE decidir vive em
  `moveTaskToPhase` (flow.ts), que é função pura; o que está aqui é só a gravação
  e o registro no diário.

  A TAG SAI NO MESMO UPDATE, e isso conserta um estado que a versão nova produz:
  lá são duas escritas (TaskKanban.jsx:217-219 limpa a tag, e só depois vem a
  validação de checklist que pode barrar o movimento), então a tarefa PERDE A TAG
  SEM TER SAÍDO DO LUGAR — o cartão continua na coluna, sem o crachá que dizia
  por que ele estava parado. Numa escrita só, ou as duas coisas acontecem ou
  nenhuma.

  A LIMPEZA É INCONDICIONAL, como lá: a tag diz "parada esperando alguém" e o
  cartão acabou de se mover. Escrever nulo sobre nulo não muda nada.

  MUDAR DE COLUNA NÃO GERA `tag_off`, também como lá (a limpeza do arraste não
  chama `registrarTagDesativada`): o evento da coluna já conta o que aconteceu, e
  dois registros para um gesto só encheriam a linha do tempo.

  DUAS DIFERENÇAS EM RELAÇÃO AO ORIGINAL:

  1. O original manda a LINHA INTEIRA de volta (`{ ...task, ... }`,
     Tasks.jsx:153-161), o que reescreve todas as colunas com o que estava em
     memória — inclusive o que outra pessoa mudou no meio. Aqui vão as quatro
     colunas do gesto.
  2. O checklist da nova etapa é INSERIDO como linha, em vez de o array inteiro
     ser reescrito. `task_checklist_items_task_id_title_key` garante que o mesmo
     item não entre duas vezes; no original quem garante isso é o filtro por
     título no navegador, e só ele.

  A inserção do checklist não derruba o movimento: a tarefa já mudou de etapa, e
  o item que faltou pode ser acrescentado no próximo movimento.
*/
export function useMoveTaskPhase() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    /*
      A COLUNA MUDA ANTES DA IDA AO BANCO. Mesmo defeito visual do quadro do
      Pipeline (ver `useMoveNegotiationStage`), e aqui ele era pior: além do
      UPDATE, esta mutação grava o evento do diário, cria o checklist da etapa
      nova e recalcula a fase do projeto. O cartão ficava voltando para a coluna
      de origem durante essa fila inteira, para só então aparecer no destino.

      O palpite copia os QUATRO campos que o UPDATE grava, não só a etapa: o
      cartão mostra prazo, atraso e crachá de status operacional a partir deles,
      e adivinhar só a coluna deixaria o cartão pousar certo com o crachá errado
      por um instante.
    */
    onMutate: async ({ move }: { move: TaskPhaseMove; projectId: string | null }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.tasks() })

      const previous = queryClient.getQueryData<TaskRow[]>(projectKeys.tasks())
      if (previous) {
        queryClient.setQueryData<TaskRow[]>(
          projectKeys.tasks(),
          previous.map((task) =>
            task.id === move.id
              ? {
                  ...task,
                  phase: move.phase,
                  status: move.status,
                  completion_date: move.completion_date,
                  operational_tag: null,
                }
              : task,
          ),
        )
      }

      return { previous }
    },
    mutationFn: async ({
      move,
      projectId,
    }: {
      move: TaskPhaseMove
      projectId: string | null
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          phase: move.phase,
          status: move.status,
          completion_date: move.completion_date,
          operational_tag: null,
        })
        .eq('id', move.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A tarefa não foi movida. É preciso permissão de edição no Fluxo do Projeto.',
      )

      /*
        DEPOIS DO `assertRowAffected`, e é o defeito 4 do plano. Na versão nova o
        evento é gravado no começo do `handleDragEnd`, antes da conferência do
        checklist obrigatório — e quando ela barra o movimento o cartão fica onde
        estava com o diário dizendo que ele andou. Aqui só chega a esta linha o
        que o banco já confirmou: a validação roda antes (em `moveTaskToPhase`) e
        a gravação já respondeu.
      */
      let event: TaskDiaryEvent = null
      if (projectId) {
        event = await recordDiaryEvent({
          projectId,
          systemEvent: 'phase_change',
          fromPhase: move.fromPhase,
          toPhase: move.toPhase,
          ...phaseChangeText(move),
          eventKey: phaseEventKey(projectId, move),
          /* O original não registra responsável no evento de etapa: quem moveu o
             cartão não é necessariamente quem responde pela tarefa. */
          responsibleId: null,
        })
      }

      if (move.newChecklistItems.length > 0 && tenantId) {
        const { error: checklistError } = await supabase.from('task_checklist_items').insert(
          move.newChecklistItems.map((item) => ({
            ...item,
            tenant_id: tenantId,
            task_id: move.id,
          })),
        )
        if (checklistError) {
          console.error('[projects] falha ao criar o checklist da etapa:', checklistError)
        }
      }

      if (projectId) await syncProjectFromTasks(projectId)
      return { id: move.id, event }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(projectKeys.tasks(), context.previous)
      }
    },
    /*
      `onSettled` importa mais aqui do que no Pipeline. Esta mutação tem etapas
      DEPOIS do UPDATE que podem falhar por conta própria — o evento do diário e
      o recálculo da fase. Se uma delas cair, a tarefa JÁ MUDOU de etapa no banco;
      desfazer o palpite e parar por aí deixaria a tela mostrando o cartão na
      coluna velha, que é mentira. Buscar do servidor nos dois desfechos põe a
      tela no que de fato aconteceu.
    */
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      /* A gaveta do diário pode estar aberta sobre o mesmo projeto — o evento
         que acabou de nascer é uma linha nova na Timeline dela. */
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  Marcar e desmarcar item do checklist.

  No original é `novoChecklist[itemIndex] = {...}` seguido da reescrita do array
  inteiro (TaskKanban.jsx:260-270): o item é identificado pela POSIÇÃO, que muda
  quando a lista é reordenada ou um item some, e duas pessoas marcando ao mesmo
  tempo sobrescrevem uma à outra. Aqui é um UPDATE por id.

  `completed_at` acompanha `is_completed` porque o banco cobra os dois juntos em
  item obrigatório (`task_checklist_items_required_completed_needs_date_check`):
  item obrigatório concluído é o que libera a tarefa a avançar, e sem data não há
  como auditar quando a trava caiu.
*/
export function useToggleChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      const { data, error } = await supabase
        .from('task_checklist_items')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O item não foi alterado. É preciso permissão de edição no Fluxo do Projeto.',
      )
      /* Não recalcula a fase do projeto: item de checklist não muda etapa nem
         andamento de tarefa. O que ele muda é a contagem de obrigatórios da view
         `project_progress`, que se atualiza sozinha na próxima leitura. */
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/*
  Os itens do template que a tarefa ainda não tem, criados de uma vez.

  No original isso acontece DENTRO do render (`getTasksByPhase` chama
  `onUpdateTask` enquanto monta a coluna, TaskKanban.jsx:299-301), o que é
  escrita disparada por leitura, a cada montagem do quadro, em todo mundo que
  abre a tela. Aqui é uma mutação explícita, chamada uma vez por tarefa pela tela
  do Fluxo e só por quem pode editar — mesmo desfecho visível (o checklist da
  etapa aparece sozinho), sem gravar no meio da renderização.
*/
export function useSeedTaskChecklist() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async ({
      taskId,
      items,
    }: {
      taskId: string
      items: TaskPhaseMove['newChecklistItems']
    }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      if (items.length === 0) return 0

      const { error } = await supabase
        .from('task_checklist_items')
        .insert(items.map((item) => ({ ...item, tenant_id: tenantId, task_id: taskId })))

      if (error) throw error
      return items.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.tasks() })
    },
  })
}

/*
  "Alterar Responsável" do menu do cartão (TaskKanban.jsx:446-465). Um UPDATE de
  uma coluna: `responsible_name` era a segunda metade desse gesto no original e
  não existe mais — o nome vem do join.

  O NOME AINDA IMPORTA, mas só para o TEXTO do evento: o do responsável que sai
  vem do embed da própria tarefa (`task.responsible`), o do que entra vem da
  lista de colaboradores da tela. Nenhum dos dois é gravado como coluna; o que a
  entrada do diário guarda é o `responsible_id`, e o nome dela também vem de
  join.
*/
export function useChangeTaskResponsible() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ task, responsible }: { task: TaskRow; responsible: PersonRef }) => {
      const previousName = task.responsible?.name ?? null

      const { data, error } = await supabase
        .from('tasks')
        .update({ responsible_id: responsible.id })
        .eq('id', task.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O responsável não foi alterado. É preciso permissão de edição no Fluxo do Projeto.',
      )

      let event: TaskDiaryEvent = null
      if (task.project_id) {
        event = await recordDiaryEvent({
          projectId: task.project_id,
          systemEvent: 'responsible_change',
          ...responsibleChangeText(previousName, responsible.name),
          eventKey: responsibleEventKey(task.project_id, task.id, responsible.id),
          /* Aqui o responsável do evento É o fato: a entrada aponta para quem
             passou a responder pela tarefa. */
          responsibleId: responsible.id,
        })
      }

      return { id: task.id, event }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.tasks() })
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  O STATUS OPERACIONAL DA TAREFA — o submenu do cartão (TaskKanban.jsx:522-576 da
  versão nova).

  UM UPDATE DE UMA COLUNA, e ele aceita qualquer tag em qualquer fase, como o
  banco (migration 0074). O recorte "Layout e Perspectivas têm as duas, Projeto
  Legal e Projeto Executivo só Em Revisão" é oferta de MENU e vive em
  `operationalTagOptions` (flow.ts) — repeti-lo aqui como validação faria a tela
  recusar o que o banco aceita, e transformaria em erro o dia em que as duas
  listas discordassem.

  QUAL EVENTO NASCE DE QUAL GESTO, como no original:
  - escolher uma tag grava `tag_on` com a tag escolhida;
  - escolher "Sem status" com tag ativa grava `tag_off` com a tag que SAIU — é a
    informação que se perderia depois da escrita, e por isso ela é lida da
    tarefa antes;
  - escolher "Sem status" sem tag ativa não gera evento nenhum. O UPDATE
    acontece do mesmo jeito, como lá, e não muda nada.

  Escolher a tag que já está ativa também grava — e a chave devolve
  `already_recorded`, sem segunda linha na Timeline.
*/
export function useSetTaskOperationalTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ task, tag }: { task: TaskRow; tag: OperationalTag | null }) => {
      const previous = task.operational_tag

      const { data, error } = await supabase
        .from('tasks')
        .update({ operational_tag: tag })
        .eq('id', task.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O status operacional não foi alterado. É preciso permissão de edição no Fluxo do Projeto.',
      )

      let event: TaskDiaryEvent = null
      if (task.project_id && (tag ?? previous)) {
        const changed = tag ?? (previous as OperationalTag)

        event = await recordDiaryEvent({
          projectId: task.project_id,
          systemEvent: tag ? 'tag_on' : 'tag_off',
          operationalTag: changed,
          ...tagEventText(task.title, changed, tag !== null),
          eventKey: tagEventKey(task.project_id, task.id, changed, tag !== null),
          responsibleId: null,
        })
      }

      return { id: task.id, event }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.tasks() })
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}
