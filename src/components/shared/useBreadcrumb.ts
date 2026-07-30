export type BreadcrumbItem = {
  label: string
  page?: string | null
}

/*
  Porta de projeto-original/src/components/shared/useBreadcrumb.jsx. As
  entradas de Marketing do original não vieram: aquelas páginas estão fora de
  escopo (ver docs/ARCHITECTURE.md).
*/
const breadcrumbMap: Record<string, BreadcrumbItem[]> = {
  // Dashboards
  Dashboard: [{ label: 'Visão Geral' }],
  DashboardExecutivo: [{ label: 'Painel Executivo' }],
  DashboardComercial: [{ label: 'Painel Comercial' }],
  MinhasAtividades: [{ label: 'Minhas Atividades' }],
  Welcome: [{ label: 'Boas-vindas' }],

  // CRM e Pipeline
  Clients: [{ label: 'CRM' }],
  /*
    O original não tem entrada para ClientDetail e cai no nome da rota, então a
    trilha exibia "ClientDetail" para quem usa. Nome de arquivo aparecendo na
    tela não é decisão de layout do original — é a ausência de uma entrada no
    mapa. A trilha aponta para /Clients porque é de onde se chega aqui.
  */
  ClientDetail: [{ label: 'CRM', page: 'Clients' }, { label: 'Detalhes do Cliente' }],
  Negociacoes: [{ label: 'Pipeline' }],

  // Contratos e Projetos
  Contracts: [{ label: 'Contratos & Propostas' }],
  Projects: [{ label: 'Projetos' }],
  Tasks: [{ label: 'Fluxo do Projeto' }],

  // Atividades
  Atividades: [{ label: 'Atividades' }],

  // Financeiro
  AccountsReceivable: [{ label: 'Financeiro', page: null }, { label: 'Recebíveis' }],
  AccountsPayable: [{ label: 'Financeiro', page: null }, { label: 'Pagamentos' }],

  // Equipe
  Collaborators: [{ label: 'Equipe', page: null }, { label: 'Colaboradores' }],
  AprovacoesAcesso: [{ label: 'Equipe', page: null }, { label: 'Controle de Acesso' }],
}

export function useBreadcrumb(currentPageName: string | undefined): BreadcrumbItem[] {
  if (!currentPageName) return []
  return breadcrumbMap[currentPageName] || [{ label: currentPageName }]
}
