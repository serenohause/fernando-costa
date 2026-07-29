import { INDIVIDUAL_CONTRIBUTOR_ROLES, type CollaboratorRole } from '@/lib/enums'

/*
  Regras de redirecionamento do Layout.jsx original. Elas continuam sendo só
  conveniência de navegação: a autoridade sobre o dado é a RLS.
*/
export const FORBIDDEN_PAGES_FOR_INDIVIDUAL_CONTRIBUTORS = [
  'AccountsPayable',
  'AccountsReceivable',
  'Dashboard',
  'DashboardExecutivo',
  'DashboardComercial',
]

export function redirectTargetFor(
  role: CollaboratorRole | null | undefined,
  currentPageName: string,
): string | null {
  if (!role) return null

  if (INDIVIDUAL_CONTRIBUTOR_ROLES.includes(role)) {
    return FORBIDDEN_PAGES_FOR_INDIVIDUAL_CONTRIBUTORS.includes(currentPageName)
      ? 'MinhasAtividades'
      : null
  }

  if (role === 'coordinator' && currentPageName === 'Dashboard') {
    return 'DashboardExecutivo'
  }

  return null
}

/* Páginas cujo nome o original grava como "último menu" visitado. */
export const MAIN_MENU_PAGES = [
  'Dashboard',
  'DashboardExecutivo',
  'DashboardComercial',
  'Clients',
  'Negociacoes',
  'Contracts',
  'Projects',
  'Tasks',
  'Atividades',
  'AccountsReceivable',
  'AccountsPayable',
  'Collaborators',
  'AprovacoesAcesso',
  'MinhasAtividades',
]
