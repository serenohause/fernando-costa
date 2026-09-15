import type { ObjectiveTemplateGroup } from '@/features/kanban/objectives'
import type { PhaseKey } from '@/lib/enums'
import type { TaskChecklistItem } from './types'

/*
  OS OBJETIVOS QUE A TAREFA GANHA AO ENTRAR NUMA ETAPA.

  Até a migration 0099 a lista morava aqui, numa constante (`CHECKLIST_BY_PHASE`,
  porta de `checklistPorEtapa` do original, TaskKanban.jsx:42-118). Passou para o
  banco (`kanban_column_objectives`), com o mesmo conteúdo, porque o escritório
  pediu para editá-la em Configurações — com seções nomeadas — e porque a etapa
  criada em Configurações nunca ganhava objetivo: a chave dela não existia na
  constante.

  Este arquivo ficou só com a regra de "o que falta", que não mudou.
*/

/*
  Os objetivos do modelo da etapa que a tarefa ainda NÃO tem.

  O original compara por título e ignora a etapa (TaskKanban.jsx:243-244), e é
  exatamente o que `task_checklist_items_task_id_title_key` cobra do banco. A
  comparação aqui é a mesma, para que a tela não tente inserir o que a
  constraint recusaria: "Elaborar plantas técnicas" existe em `legal_permit` e em
  `hoa_approval`, e a tarefa que passa pelas duas fica com um item só.

  O nome da seção vai junto, copiado: é texto no item da tarefa, e não chave,
  para renomear a seção do modelo não reescrever o que já foi entregue.
*/
/* A seção em que os objetivos de ambiente aparecem no cartão. */
export const ROOMS_SECTION = 'Ambientes'

export type RoomRef = { id: string; name: string }

export function missingChecklistItems(
  phase: PhaseKey,
  groups: ObjectiveTemplateGroup[] | undefined,
  existing: (Pick<TaskChecklistItem, 'title'> & Partial<Pick<TaskChecklistItem, 'room_id' | 'phase'>>)[],
  /*
    OS AMBIENTES DO PROJETO, quando a etapa os mostra (0100) — quem chama passa a
    lista vazia quando não mostra. Cada ambiente vira um objetivo obrigatório na
    seção "Ambientes", uma vez POR ETAPA: "Sala" se marca de novo em cada etapa
    que exibe ambientes. Por isso a comparação é por (ambiente, etapa), e não por
    título como a do modelo.
  */
  rooms: RoomRef[] = [],
) {
  /* Só objetivos comuns contam para o título: o de ambiente pode ter o mesmo
     nome de um objetivo do modelo sem colidir (índice parcial da 0100). */
  const titles = new Set(existing.filter((item) => !item.room_id).map((item) => item.title))

  const doModelo = (groups ?? [])
    .flatMap((group) => group.objectives.map((objective) => ({ ...objective, section: group.name })))
    .filter((objective) => !titles.has(objective.title))
    .map((objective) => ({
      title: objective.title,
      phase,
      section: objective.section,
      is_required: objective.is_required,
      room_id: null as string | null,
    }))

  const deAmbiente = rooms
    .filter((room) => !existing.some((item) => item.room_id === room.id && item.phase === phase))
    .map((room) => ({
      title: room.name,
      phase,
      section: ROOMS_SECTION as string | null,
      is_required: true,
      room_id: room.id as string | null,
    }))

  return [...doModelo, ...deAmbiente].map((item, index) => ({
    ...item,
    display_order: existing.length + index + 1,
  }))
}

/*
  TUDO O QUE DECIDE OS OBJETIVOS DE UMA TAREFA, lido do quadro e dos ambientes:
  o modelo de cada etapa, quais etapas mostram ambientes e os ambientes de cada
  projeto. Montado uma vez por render, e não por tarefa.
*/
export type ChecklistSources = {
  templates: ReadonlyMap<string, ObjectiveTemplateGroup[]>
  roomColumns: ReadonlySet<string>
  roomsByProject: ReadonlyMap<string, RoomRef[]>
}

export function buildChecklistSources(
  columns: { key: string; objectiveGroups: ObjectiveTemplateGroup[]; shows_project_rooms: boolean }[],
  rooms: { id: string; project_id: string; name: string; display_order: number }[],
): ChecklistSources {
  const roomsByProject = new Map<string, RoomRef[]>()
  for (const room of [...rooms].sort((a, b) => a.display_order - b.display_order)) {
    const lista = roomsByProject.get(room.project_id) ?? []
    lista.push({ id: room.id, name: room.name })
    roomsByProject.set(room.project_id, lista)
  }
  return {
    templates: new Map(columns.map((column) => [column.key, column.objectiveGroups])),
    roomColumns: new Set(columns.filter((column) => column.shows_project_rooms).map((column) => column.key)),
    roomsByProject,
  }
}

/* Os objetivos que faltam para UMA tarefa numa etapa, com as três fontes. */
export function missingItemsForTask(
  task: { project_id: string | null; checklist: Parameters<typeof missingChecklistItems>[2] },
  phase: PhaseKey,
  sources: ChecklistSources,
) {
  const rooms =
    task.project_id && sources.roomColumns.has(phase)
      ? (sources.roomsByProject.get(task.project_id) ?? [])
      : []
  return missingChecklistItems(phase, sources.templates.get(phase), task.checklist, rooms)
}

/*
  Os objetivos da tarefa agrupados por seção, para o cartão aberto. Soltos
  primeiro; as seções na ordem em que o primeiro item de cada uma aparece — a
  lista chega ordenada por `display_order`, que é a ordem do modelo.
*/
export function groupChecklistBySection<T extends { section: string | null }>(
  items: T[],
): { name: string | null; items: T[] }[] {
  const grupos: { name: string | null; items: T[] }[] = []
  const soltos = items.filter((item) => item.section === null)
  if (soltos.length > 0) grupos.push({ name: null, items: soltos })

  for (const item of items) {
    if (item.section === null) continue
    let grupo = grupos.find((candidate) => candidate.name === item.section)
    if (!grupo) {
      grupo = { name: item.section, items: [] }
      grupos.push(grupo)
    }
    grupo.items.push(item)
  }
  return grupos
}
