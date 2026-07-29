import type { PermissionDraftMap } from './types'

/*
  Estrutura da matriz de PermissoesManager.jsx, com o texto livre do menu
  trocado pelo slug estável de `menus.key` (docs/ENUM-MAP.md). Os agrupadores da
  sidebar (`financial`, `team_group`) não entram: não recebem permissão.

  Os nomes dos grupos abaixo ("Dashboards", "Comercial"…) são rótulo de tela do
  original e não existem no banco — são outro recorte, só desta matriz, e não os
  agrupadores de `menus.parent_key`. O rótulo de cada item continua vindo de
  `menus.label_pt`; aqui só há a ordem e o agrupamento.
*/
export const GRUPOS_MODULOS: { grupo: string; menuKeys: string[] }[] = [
  {
    grupo: 'Dashboards',
    menuKeys: ['dashboard_overview', 'dashboard_executive', 'dashboard_commercial'],
  },
  {
    grupo: 'Comercial',
    menuKeys: ['pipeline', 'crm', 'suppliers', 'client_budget'],
  },
  {
    grupo: 'Projetos & Operações',
    menuKeys: ['projects', 'map', 'project_flow', 'activities'],
  },
  {
    grupo: 'Financeiro',
    menuKeys: ['contracts', 'receivables', 'payables'],
  },
  {
    grupo: 'Administração',
    menuKeys: ['team', 'access_control'],
  },
]

/* MENUS_SISTEMA do original, na mesma ordem. */
export const MENUS_SISTEMA: string[] = [
  'dashboard_overview',
  'dashboard_executive',
  'dashboard_commercial',
  'pipeline',
  'crm',
  'suppliers',
  'client_budget',
  'projects',
  'map',
  'contracts',
  'receivables',
  'payables',
  'project_flow',
  'activities',
  'team',
  'access_control',
]

type PresetEntry = { menuKey: string; can_view: boolean; can_edit: boolean }

const todosOsMenus: PresetEntry[] = MENUS_SISTEMA.map((menuKey) => ({
  menuKey,
  can_view: true,
  can_edit: true,
}))

/*
  PRESETS do original, valor por valor. "Perfil Diretor" e "Administrador do
  Sistema" são iguais lá também — os dois liberam tudo.
*/
export const PRESETS: Record<string, PresetEntry[]> = {
  'Perfil Comercial': [
    { menuKey: 'dashboard_commercial', can_view: true, can_edit: true },
    { menuKey: 'pipeline', can_view: true, can_edit: true },
    { menuKey: 'crm', can_view: true, can_edit: true },
    { menuKey: 'suppliers', can_view: true, can_edit: false },
    { menuKey: 'client_budget', can_view: true, can_edit: true },
    { menuKey: 'contracts', can_view: true, can_edit: false },
    { menuKey: 'projects', can_view: true, can_edit: false },
  ],
  'Perfil Projetos': [
    { menuKey: 'projects', can_view: true, can_edit: true },
    { menuKey: 'map', can_view: true, can_edit: true },
    { menuKey: 'project_flow', can_view: true, can_edit: true },
    { menuKey: 'activities', can_view: true, can_edit: true },
    { menuKey: 'crm', can_view: true, can_edit: false },
    { menuKey: 'suppliers', can_view: true, can_edit: false },
    { menuKey: 'client_budget', can_view: true, can_edit: false },
  ],
  'Perfil Financeiro': [
    { menuKey: 'dashboard_executive', can_view: true, can_edit: false },
    { menuKey: 'receivables', can_view: true, can_edit: true },
    { menuKey: 'payables', can_view: true, can_edit: true },
    { menuKey: 'contracts', can_view: true, can_edit: true },
    { menuKey: 'suppliers', can_view: true, can_edit: false },
    { menuKey: 'client_budget', can_view: true, can_edit: true },
  ],
  'Perfil Diretor': todosOsMenus,
  'Administrador do Sistema': todosOsMenus,
}

export function applyPreset(current: PermissionDraftMap, presetName: string): PermissionDraftMap {
  const preset = PRESETS[presetName] ?? []
  const next: PermissionDraftMap = {}

  for (const menuKey of MENUS_SISTEMA) {
    next[menuKey] = { ...current[menuKey], can_view: false, can_edit: false }
  }

  for (const entry of preset) {
    if (next[entry.menuKey]) {
      next[entry.menuKey] = { can_view: entry.can_view, can_edit: entry.can_edit }
    }
  }

  return next
}
