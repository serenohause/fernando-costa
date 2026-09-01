import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Briefcase,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  TrendingUp,
  UserCircle,
  Users,
  Wallet,
} from 'lucide-react'
import type { CollaboratorRole } from '@/lib/enums'
import type { MenuMeta, MenuRow, NavItem, NavSubItem, PermissionRow } from './types'

/*
  De/para de `menus.key` para a rota e o ícone que o Layout.jsx original usa,
  mais as regras de função (`onlyForRoles` / `hideForRoles`) que lá são
  propriedades do array `allNavigation`. Os valores de função vêm em inglês
  (docs/ENUM-MAP.md); os rótulos continuam vindo de `menus.label_pt`.
*/
export const MENU_META: Record<string, MenuMeta> = {
  dashboard_overview: { page: 'Dashboard', icon: LayoutDashboard },
  dashboard_executive: { page: 'DashboardExecutivo', icon: TrendingUp },
  dashboard_commercial: { page: 'DashboardComercial', icon: Briefcase },
  crm: { page: 'Clients', icon: Users },
  pipeline: { page: 'Negociacoes', icon: Handshake },
  contracts: { page: 'Contracts', icon: FileText },
  projects: { page: 'Projects', icon: FolderKanban },
  map: { page: 'MapaProjetos', icon: MapPin },
  project_flow: { page: 'Tasks', icon: CheckSquare },
  my_activities: {
    page: 'MinhasAtividades',
    icon: Activity,
    onlyForRoles: ['architect', 'intern', 'coordinator'],
  },
  activities: { page: 'Atividades', icon: Activity, hideForRoles: ['architect', 'intern'] },
  suppliers: { page: 'Fornecedores', icon: Store },
  client_budget: { page: 'OrcamentoCliente', icon: ClipboardList },
  financial: {
    page: null,
    icon: Wallet,
    onlyForRoles: ['director', 'finance', 'admin_staff'],
  },
  receivables: { page: 'AccountsReceivable', icon: ArrowDownCircle },
  payables: { page: 'AccountsPayable', icon: ArrowUpCircle },
  team_group: {
    page: null,
    icon: UserCircle,
    onlyForRoles: ['director', 'finance', 'admin_staff'],
  },
  team: { page: 'Collaborators', icon: UserCircle },
  access_control: { page: 'AprovacoesAcesso', icon: ShieldCheck },
  /* Não vem do original: módulo novo, com a rota nomeada no mesmo padrão dos
     demais (`/<NomeDaPagina>`). */
  settings: { page: 'Settings', icon: SlidersHorizontal },
}

/*
  "Minhas Atividades" é liberada por função, nunca por permissão — não tem
  linha em `menus`. O sort_order 95 a coloca entre `project_flow` (90) e
  `activities` (100), que é a posição dela no `allNavigation` do original.
*/
export const MY_ACTIVITIES_MENU: MenuRow = {
  key: 'my_activities',
  label_pt: 'Minhas Atividades',
  sort_order: 95,
  parent_key: null,
}

/* Chaves cuja visibilidade o original resolve só por função. */
const ROLE_ONLY_KEYS = new Set(['my_activities', 'activities'])

function byOrder(a: MenuRow, b: MenuRow) {
  return a.sort_order - b.sort_order
}

function passesRoleFilter(meta: MenuMeta, role: CollaboratorRole | null) {
  if (!role) return true
  if (meta.onlyForRoles) return meta.onlyForRoles.includes(role)
  if (meta.hideForRoles) return !meta.hideForRoles.includes(role)
  return true
}

export function buildNavigation({
  menus,
  permissions,
  role,
}: {
  menus: MenuRow[]
  permissions: PermissionRow[]
  role: CollaboratorRole | null
}): NavItem[] {
  const rows = [...menus, MY_ACTIVITIES_MENU]
  const canView = new Set(permissions.filter((p) => p.can_view).map((p) => p.menu_key))

  const all: NavItem[] = rows
    .filter((row) => row.parent_key === null)
    .sort(byOrder)
    .flatMap((row) => {
      const meta = MENU_META[row.key]
      if (!meta) return []

      const subItems: NavSubItem[] = rows
        .filter((child) => child.parent_key === row.key)
        .sort(byOrder)
        .flatMap((child) => {
          const childMeta = MENU_META[child.key]
          if (!childMeta?.page) return []
          return [
            { key: child.key, name: child.label_pt, page: childMeta.page, icon: childMeta.icon },
          ]
        })

      if (!meta.page && subItems.length === 0) return []

      return [
        {
          key: row.key,
          name: row.label_pt,
          page: meta.page,
          icon: meta.icon,
          ...(subItems.length > 0 ? { subItems } : {}),
        },
      ]
    })

  const byRole = all.filter((item) => passesRoleFilter(MENU_META[item.key], role))

  /*
    Diretor não passa pelo filtro de permissão — é o ramo `isAdmin` do
    Layout.jsx, que também não filtra os subitens.
  */
  if (role === 'director') return byRole

  return byRole
    .filter((item) => {
      if (ROLE_ONLY_KEYS.has(item.key)) return true
      if (item.subItems) return item.subItems.some((sub) => canView.has(sub.key))
      return canView.has(item.key)
    })
    .map((item) =>
      item.subItems
        ? { ...item, subItems: item.subItems.filter((sub) => canView.has(sub.key)) }
        : item,
    )
}
