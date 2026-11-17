import type { CollaboratorRole } from '@/lib/enums'
import type { MenuRow, NavItem, PermissionRow } from '@/features/auth/types'
import { GUIDES, TRAILS } from './guides/index.ts'
import type { AccessKind, Guide, GuideStep, GuideTask, HelpAccess, Trail } from './types'

/*
  QUEM VÊ QUAL GUIA. Nada aqui é regra nova: o guia só lê o que a barra lateral
  já decidiu.

  - "Consegue abrir a tela" = o menu está no resultado de `buildNavigation`
    (navigation.ts), que o AppLayout já monta. Mesmo filtro por função
    (`onlyForRoles`/`hideForRoles`) e por `can_view`.
  - "Consegue editar" = a regra de `useMenuPermissions` e de `can_edit_menu()`
    no banco: Diretor sem consultar a matriz, os demais pela linha gravada.

  Isso decide só o que o guia MOSTRA. Quem autoriza continua sendo a RLS.
*/
export function buildHelpAccess({
  items,
  permissions,
  role,
  menus,
}: {
  items: NavItem[]
  permissions: PermissionRow[]
  role: CollaboratorRole | null
  menus: MenuRow[]
}): HelpAccess {
  const openMenus = new Set<string>()
  for (const item of items) {
    if (item.subItems) item.subItems.forEach((sub) => openMenus.add(sub.key))
    else openMenus.add(item.key)
  }

  const isDirector = role === 'director'
  const editMenus = new Set(permissions.filter((p) => p.can_edit).map((p) => p.menu_key))
  const menuLabels = new Map(menus.map((m) => [m.key, m.label_pt]))

  return { role, openMenus, editMenus, isDirector, menuLabels }
}

export function canEditMenu(access: HelpAccess, menuKey: string): boolean {
  return access.isDirector || access.editMenus.has(menuKey)
}

export function guideVisible(access: HelpAccess, key: string): boolean {
  const g = GUIDES[key]
  if (!g) return false
  if (g.always) return true
  if (g.needsMenu) return access.openMenus.has(g.needsMenu)
  if (g.special === 'productivity') {
    return access.openMenus.has('activities') && canEditMenu(access, 'activities')
  }
  if (g.special === 'impersonate') return access.openMenus.has('team') && access.isDirector
  if (g.menu) return access.openMenus.has(g.menu)
  return false
}

/* O que a etiqueta "Seu acesso" do topo do guia anuncia. */
export function guideAccessKind(access: HelpAccess, guide: Guide): AccessKind {
  if (guide.byRole) return 'role'
  if (!guide.menu) return 'none'
  return canEditMenu(access, guide.menu) ? 'edit' : 'view'
}

export function isFullGuide(guide: Guide): boolean {
  return Array.isArray(guide.tasks)
}

/*
  As tarefas que o guia mostra. Tarefa `edit` some para quem só vê, porque a
  tela esconde o botão dela; `hidden` é quantas saíram, para a linha que diz
  quem libera.
*/
export function visibleTasks(
  access: HelpAccess,
  guide: Guide,
): { tasks: GuideTask[]; hidden: number } {
  const all = guide.tasks ?? []
  const kind = guideAccessKind(access, guide)
  const edit = kind !== 'view'
  const tasks = all.filter((t) => !t.edit || edit)
  return { tasks, hidden: all.length - tasks.length }
}

/*
  O passo com cadeado: a tela DESABILITA o botão e avisa, então o guia mostra o
  passo e diz em que menu falta edição.
*/
export function stepBlockedBy(access: HelpAccess, step: GuideStep): string | null {
  if (typeof step === 'string') return null
  return canEditMenu(access, step.needs) ? null : step.needs
}

export function stepText(step: GuideStep): string {
  return typeof step === 'string' ? step : step.t
}

export function menuLabel(access: HelpAccess, menuKey: string): string {
  return access.menuLabels.get(menuKey) ?? GUIDES[menuKey]?.title ?? menuKey
}

export type LinkView =
  | { kind: 'off'; guide: Guide; why: string }
  | { kind: 'go'; guide: Guide; page: string; why: string }
  | { kind: 'plain'; guide: Guide; why: string }

/* "Ligação com outros módulos": fora do acesso, navegável ou só texto. */
export function linkView(
  access: HelpAccess,
  link: { key: string; why: string; via?: string },
): LinkView | null {
  const target = GUIDES[link.key]
  if (!target) return null
  const can =
    guideVisible(access, link.key) || (Boolean(link.via) && target.menu === 'activities')
  const openTarget = target.menu ? access.openMenus.has(target.menu) : false
  const navigable = Boolean(target.page) && (openTarget || Boolean(target.always))
  const via = link.via && !openTarget ? ` (${link.via})` : ''

  if (!can) return { kind: 'off', guide: target, why: `${link.why} Fora do seu acesso.` }
  if (navigable) return { kind: 'go', guide: target, page: target.page!, why: link.why }
  return { kind: 'plain', guide: target, why: `${link.why}${via}` }
}

export type TrailView = Trail & { visible: string[]; full: string[] }

/* As trilhas da Central, já filtradas. Trilha sem nenhum guia visível sai. */
export function buildTrails(access: HelpAccess): { trails: TrailView[]; hiddenTrails: number } {
  const trails = TRAILS.map((t) => {
    const visible = t.guides.filter((k) => guideVisible(access, k))
    const full = visible.filter((k) => isFullGuide(GUIDES[k]))
    return { ...t, visible, full }
  }).filter((t) => t.visible.length > 0)
  return { trails, hiddenTrails: TRAILS.length - trails.length }
}

/* O guia da tela atual, pelo nome da rota. */
export function guideKeyForPage(page: string): string | null {
  return Object.keys(GUIDES).find((k) => GUIDES[k].page === page) ?? null
}
