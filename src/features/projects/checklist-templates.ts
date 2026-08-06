import type { TaskChecklistItem, TaskPhase } from './types'

/*
  Porta de `checklistPorEtapa`, de
  projeto-original/src/components/tasks/TaskKanban.jsx (linhas 42-118).

  É a lista de itens que a tarefa ganha ao entrar em cada etapa. Os títulos são
  os do original, letra por letra — são procedimento do escritório, não texto de
  interface. As oito etapas que o original cobre continuam sendo oito: `revision`,
  `building_permit`, `under_construction` e `awaiting_client` não têm template lá,
  e a tarefa que entra nelas não ganha item nenhum. `under_construction` é a fase
  que a migration 0061 acrescentou, e o original não tem procedimento escrito para
  ela — inventar um checklist de obra seria inventar procedimento.

  `opcionais` é array vazio nas oito etapas do original. A distinção continua
  existindo no banco (`task_checklist_items.is_required`) porque é ela que trava
  o avanço da tarefa, mas nenhum template traz item opcional hoje.
*/
export const CHECKLIST_BY_PHASE: Partial<Record<TaskPhase, { required: string[]; optional: string[] }>> = {
  not_started: {
    required: ['Criar grupo de Whatsapp com os clientes', 'Marcar data de briefing de projetos'],
    optional: [],
  },
  briefing: {
    required: [
      'Solicitar topografia, documentos e informações do terreno',
      'Enviar data de apresentação de Layout',
    ],
    optional: [],
  },
  layout: {
    required: [
      'Realizar estudo do terreno',
      'Elaborar estudo de layout',
      'Realizar humanização e apresentação de layout',
    ],
    optional: [],
  },
  renderings: {
    required: [
      'Iniciar modelagem 3D',
      'Modelagem final com humanização e acabamentos',
      'Renderização',
      'Pós produção e humanização',
      'Vídeo tour virtual',
      'Criar branding, conceito e nome do projeto',
      'Montar apresentação completa',
    ],
    optional: [],
  },
  legal_permit: {
    required: [
      'Elaborar plantas técnicas',
      'Elaborar cortes técnicos',
      'Elaborar memoriais e padrões de condomínios',
    ],
    optional: [],
  },
  hoa_approval: {
    required: [
      'Elaborar plantas técnicas',
      'Elaborar cortes técnicos',
      'Elaborar memoriais e padrões de condomínios',
    ],
    optional: [],
  },
  construction_docs: {
    required: [
      'Emitir RRT de projeto',
      'Acrescentar detalhes construtivos ampliados',
      'Elaborar detalhes isométricos',
      'Detalhamento de esquadrias',
      'Detalhamento de piscina',
      'Detalhamento de escada',
      'Projeto de iluminação externa',
      'Projeto de paginação de piso externo e interno',
      'Projeto de paginação de forro externo e interno',
      'Detalhamento básico de bancadas',
      'Elaborar memorial descritivo',
    ],
    optional: [],
  },
  engineering_docs: {
    required: [
      'Enviar para elaboração de Projeto Estrutural',
      'Enviar para elaboração de Projetos de Instalações',
      'Compatibilização de Projetos',
      'Enviar para orçamentos',
    ],
    optional: [],
  },
}

/*
  Os itens do template da etapa que a tarefa ainda NÃO tem.

  O original compara por título e ignora a etapa (TaskKanban.jsx:243-244), e é
  exatamente o que `task_checklist_items_task_id_title_key` passou a cobrar do
  banco. A comparação aqui é a mesma, para que a tela não tente inserir o que a
  constraint recusaria: "Elaborar plantas técnicas" existe em `legal_permit` e em
  `hoa_approval`, e a tarefa que passa pelas duas fica com um item só.
*/
export function missingChecklistItems(
  phase: TaskPhase,
  existing: Pick<TaskChecklistItem, 'title'>[],
) {
  const template = CHECKLIST_BY_PHASE[phase]
  if (!template) return []

  const titles = new Set(existing.map((item) => item.title))

  return [...template.required, ...template.optional]
    .filter((title) => !titles.has(title))
    .map((title, index) => ({
      title,
      phase,
      is_required: template.required.includes(title),
      display_order: existing.length + index + 1,
    }))
}
