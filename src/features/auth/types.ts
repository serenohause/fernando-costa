import type { LucideIcon } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import type { CollaboratorRole } from '@/lib/enums'

export type Collaborator = Tables<'collaborators'>

/* Só o que a tela usa do escritório. `status` e as datas não têm leitor no
   frontend — a policy de 0008 já só devolve o próprio tenant. */
export type Tenant = Pick<Tables<'tenants'>, 'id' | 'name' | 'slug'>

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
