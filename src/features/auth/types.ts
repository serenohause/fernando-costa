import type { LucideIcon } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import type { CollaboratorRole } from '@/lib/enums'

export type Collaborator = Tables<'collaborators'>

export type MenuRow = Pick<Tables<'menus'>, 'key' | 'label_pt' | 'sort_order' | 'parent_key'>

export type PermissionRow = Pick<
  Tables<'collaborator_permissions'>,
  'menu_key' | 'can_view' | 'can_edit'
>

/*
  Ícone, rota e regras por função não vivem no banco — no original elas estão
  no array `allNavigation` do Layout.jsx. `menus` fornece rótulo, ordem e
  aninhamento; o resto vem de MENU_META.
*/
export type MenuMeta = {
  page: string | null
  icon: LucideIcon
  onlyForRoles?: readonly CollaboratorRole[]
  hideForRoles?: readonly CollaboratorRole[]
}

export type NavSubItem = {
  key: string
  name: string
  page: string
  icon: LucideIcon
}

export type NavItem = {
  key: string
  name: string
  page: string | null
  icon: LucideIcon
  subItems?: NavSubItem[]
}
