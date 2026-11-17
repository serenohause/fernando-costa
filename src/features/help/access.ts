import type { CollaboratorRole } from '@/lib/enums'
import type { MenuRow, NavItem, PermissionRow } from '@/features/auth/types'
import { GUIDES, TRAILS } from './guides/index.ts'
import type {
  AccessKind,
  Guide,
  GuideStep,
  GuideTask,
  HelpAccess,
  TourStep,
  Trail,
} from './types'

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

/*
  O ÚLTIMO PASSO DE TODO TOUR é o próprio "?" do cabeçalho: diz onde repetir e
  onde está o texto completo, e é para ele que o foco volta ao fechar.
*/
export const HELP_TOUR_STEP: TourStep = {
  target: 'header-help',
  title: 'Ver de novo',
  body: 'Este botão repete o tour desta tela. O passo a passo completo fica na Central de ajuda.',
}

/* O guia que tem tour para a tela atual, pelo nome da rota. */
export function tourGuideKeyForPage(page: string): string | null {
  return Object.keys(GUIDES).find((k) => GUIDES[k].page === page && GUIDES[k].tour) ?? null
}

export type TourStepStatus = 'shown' | 'edit' | 'absent'

export type ResolvedTour = {
  /* Só os passos que ficam, já com o "?" no fim. O contador conta estes. */
  steps: TourStep[]
  /* Todos os passos declarados, com o motivo de cada um que saiu. */
  all: { step: TourStep; status: TourStepStatus }[]
  /* Passos de edição que saíram porque o acesso é só ver: a linha do 1º balão. */
  editOut: number
}

/*
  OS PASSOS SÃO FILTRADOS ANTES DE O TOUR COMEÇAR, e não pelo
  `skipMissingElement` do driver: o contador dele conta o total declarado, e
  "2 de 7" com três pulados mostraria um 7 falso. Dois motivos, mesma conta:

  - `edit` e a pessoa só vê (a mesma regra de `visibleTasks`): sai, mesmo que o
    elemento continue na tela. Vem primeiro, para a linha de acesso contar
    também o botão que a tela escondeu (Novo Projeto).
  - o elemento não está na tela (`isPresent` falso): sai.
*/
export function resolveTour(
  access: HelpAccess,
  guide: Guide,
  isPresent: (target: string) => boolean,
): ResolvedTour {
  const declared = [...(guide.tour ?? []), HELP_TOUR_STEP]
  const canEdit = guideAccessKind(access, guide) !== 'view'
  const all = declared.map((step) => {
    let status: TourStepStatus = 'shown'
    if (step.edit && !canEdit) status = 'edit'
    else if (!isPresent(step.target)) status = 'absent'
    return { step, status }
  })
  return {
    steps: all.filter((s) => s.status === 'shown').map((s) => s.step),
    all,
    editOut: all.filter((s) => s.status === 'edit').length,
  }
}
