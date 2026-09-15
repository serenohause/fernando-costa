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
export function missingChecklistItems(
  phase: PhaseKey,
  groups: ObjectiveTemplateGroup[] | undefined,
  existing: Pick<TaskChecklistItem, 'title'>[],
) {
  if (!groups || groups.length === 0) return []

  const titles = new Set(existing.map((item) => item.title))

  return groups
    .flatMap((group) => group.objectives.map((objective) => ({ ...objective, section: group.name })))
    .filter((objective) => !titles.has(objective.title))
    .map((objective, index) => ({
      title: objective.title,
      phase,
      section: objective.section,
      is_required: objective.is_required,
      display_order: existing.length + index + 1,
    }))
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
