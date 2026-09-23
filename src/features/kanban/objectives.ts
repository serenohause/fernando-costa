/*
  O MODELO DE OBJETIVOS DE UMA ETAPA, sem banco e sem tela (migration 0099).

  Duas tabelas no banco — seções e objetivos — e uma forma só aqui: a lista de
  GRUPOS, na ordem em que a tela os mostra. O primeiro grupo pode ter nome nulo:
  são os objetivos soltos, sem seção. É a mesma forma que
  `replace_kanban_column_objectives` recebe, então a tela lê e grava sem
  tradução no meio.
*/

export type ObjectiveTemplate = { title: string; is_required: boolean }
export type ObjectiveTemplateGroup = { name: string | null; objectives: ObjectiveTemplate[] }

type SectionRow = { id: string; column_id: string; name: string; display_order: number }
type ObjectiveRow = {
  column_id: string
  section_id: string | null
  title: string
  is_required: boolean
  display_order: number
}

/*
  Monta os grupos de cada etapa a partir das linhas do banco.

  Objetivos soltos vêm primeiro, e só aparecem como grupo se existirem. Seção
  vazia continua aparecendo: é o estado de quem acabou de criá-la e ainda não
  escreveu nada dentro.
*/
export function groupObjectivesByColumn(
  sections: SectionRow[],
  objectives: ObjectiveRow[],
): Map<string, ObjectiveTemplateGroup[]> {
  const porColuna = new Map<string, ObjectiveTemplateGroup[]>()
  const ordenados = [...objectives].sort((a, b) => a.display_order - b.display_order)
  const colunas = new Set([...sections.map((s) => s.column_id), ...objectives.map((o) => o.column_id)])

  for (const columnId of colunas) {
    const grupos: ObjectiveTemplateGroup[] = []
    const soltos = ordenados.filter((o) => o.column_id === columnId && o.section_id === null)
    if (soltos.length > 0) grupos.push({ name: null, objectives: soltos.map(toTemplate) })

    for (const section of sections
      .filter((s) => s.column_id === columnId)
      .sort((a, b) => a.display_order - b.display_order)) {
      grupos.push({
        name: section.name,
        objectives: ordenados.filter((o) => o.section_id === section.id).map(toTemplate),
      })
    }
    porColuna.set(columnId, grupos)
  }
  return porColuna
}

function toTemplate(row: ObjectiveRow): ObjectiveTemplate {
  return { title: row.title, is_required: row.is_required }
}

export function countObjectives(groups: ObjectiveTemplateGroup[]): number {
  return groups.reduce((total, group) => total + group.objectives.length, 0)
}

/*
  O que vai para o banco: títulos e nomes aparados, objetivo em branco
  descartado (é a linha que a pessoa abriu e não usou) e seção sem nome
  recusada antes — ver `objectiveGroupsError`.
*/
export function normalizeObjectiveGroups(groups: ObjectiveTemplateGroup[]): ObjectiveTemplateGroup[] {
  return groups.map((group) => ({
    name: group.name === null ? null : group.name.trim(),
    objectives: group.objectives
      .map((objective) => ({ title: objective.title.trim(), is_required: objective.is_required }))
      .filter((objective) => objective.title !== ''),
  }))
}

/*
  AS RECUSAS QUE A TELA JÁ SABE, ditas antes de ir ao banco. O banco recusaria
  as três também (constraints da 0099), mas com uma frase só para o modelo
  inteiro; aqui a frase diz qual seção ou qual título.
*/
export function objectiveGroupsError(groups: ObjectiveTemplateGroup[]): string | null {
  const normalizados = normalizeObjectiveGroups(groups)

  if (normalizados.some((group) => group.name !== null && group.name === '')) {
    return 'Dê um nome a cada seção, ou remova a seção sem nome.'
  }

  const nomes = new Set<string>()
  for (const group of normalizados) {
    if (group.name === null) continue
    const chave = group.name.toLocaleLowerCase('pt-BR')
    if (nomes.has(chave)) return `Há duas seções chamadas “${group.name}”. Use nomes diferentes.`
    nomes.add(chave)
  }

  /* Título único na ETAPA, e não por seção: a tarefa não aceita dois itens com
     o mesmo título, e o segundo sumiria sem aviso. */
  const titulos = new Set<string>()
  for (const group of normalizados) {
    for (const objective of group.objectives) {
      if (titulos.has(objective.title)) {
        return `O objetivo “${objective.title}” aparece duas vezes nesta etapa. Cada título precisa ser único.`
      }
      titulos.add(objective.title)
    }
  }

  return null
}

/* O modelo de cada etapa por CHAVE, que é como a tarefa conhece a etapa dela. */
export function objectiveTemplatesByKey(
  columns: { key: string; objectiveGroups: ObjectiveTemplateGroup[] }[],
): ReadonlyMap<string, ObjectiveTemplateGroup[]> {
  return new Map(columns.map((column) => [column.key, column.objectiveGroups]))
}

/*
  Dois modelos são o mesmo? Serve para Configurações não regravar o modelo de
  quem só mudou a cor da etapa. O grupo "sem seção" vazio não conta: a tela o
  mostra sempre, e o banco não o guarda.
*/
export function sameObjectiveGroups(a: ObjectiveTemplateGroup[], b: ObjectiveTemplateGroup[]): boolean {
  const limpa = (groups: ObjectiveTemplateGroup[]) =>
    normalizeObjectiveGroups(groups).filter((group) => group.name !== null || group.objectives.length > 0)
  return JSON.stringify(limpa(a)) === JSON.stringify(limpa(b))
}
