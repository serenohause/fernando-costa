/*
  O que a busca global devolve, e para onde cada tipo leva.

  A ROTA MORA AQUI, e não no banco: `search_platform` devolve `tipo` e `id`
  porque para onde um projeto leva é decisão de navegação, muda quando a
  navegação muda, e não tem por que estar gravado numa função de banco.
*/

export type SearchKind =
  | 'cliente'
  | 'projeto'
  | 'contrato'
  | 'proposta'
  | 'negociacao'
  | 'tarefa'
  | 'atividade'
  | 'fornecedor'

export type SearchHit = {
  kind: SearchKind
  id: string
  title: string
  subtitle: string
  detail: string
  /* A ordem entre os grupos, definida no banco junto com a consulta — cliente
     antes de projeto, projeto antes de contrato. */
  order: number
}

/*
  O rótulo do grupo, o menu que governa o acesso e a página de destino.

  `menu` é o que a tela usa para NÃO oferecer um caminho que a barra lateral
  daquela pessoa não tem. A busca já não devolve o que ela não pode ler (a RLS
  cuida); isto é sobre coerência de navegação, o mesmo critério do `ClientLink`.
*/
export const SEARCH_KIND_META: Record<
  SearchKind,
  { label: string; plural: string; menu: string; page: string }
> = {
  cliente: { label: 'Cliente', plural: 'Clientes', menu: 'crm', page: 'ClientDetail' },
  projeto: { label: 'Projeto', plural: 'Projetos', menu: 'projects', page: 'Projects' },
  contrato: { label: 'Contrato', plural: 'Contratos', menu: 'contracts', page: 'Contracts' },
  proposta: { label: 'Proposta', plural: 'Propostas', menu: 'contracts', page: 'Contracts' },
  negociacao: {
    label: 'Negociação',
    plural: 'Negociações',
    menu: 'pipeline',
    page: 'Negociacoes',
  },
  tarefa: { label: 'Tarefa', plural: 'Tarefas', menu: 'project_flow', page: 'Tasks' },
  atividade: { label: 'Atividade', plural: 'Atividades', menu: 'activities', page: 'Atividades' },
  fornecedor: {
    label: 'Fornecedor',
    plural: 'Fornecedores',
    menu: 'suppliers',
    page: 'Fornecedores',
  },
}

/*
  O CLIENTE TEM ROTA PRÓPRIA (`?id=`, como no original); os outros sete abrem a
  tela do módulo com `?focus=<id>`, que rola até o registro e o destaca. É o
  mesmo parâmetro que a lista de Projetos já entendia antes desta busca existir.
*/
export function searchHitParam(hit: SearchHit): string {
  return hit.kind === 'cliente' ? `?id=${hit.id}` : `?focus=${hit.id}`
}
