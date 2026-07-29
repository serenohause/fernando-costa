/*
  Fonte única dos rótulos em português.

  O banco guarda o valor em inglês; a tela mostra o rótulo daqui. Nenhum
  componente escreve "Em andamento" à mão — sempre `labelOf(collaboratorRole, value)`
  ou o mapa correspondente.

  O de/para completo com os valores do base44 está em docs/ENUM-MAP.md.
  Este arquivo cobre só os enums do módulo já implementado; cada módulo novo
  acrescenta os seus.
*/

export type LabelMap<T extends string> = Readonly<Record<T, string>>

/** Ordem de exibição em select e filtro. Não é ordem alfabética de propósito. */
export function optionsOf<T extends string>(map: LabelMap<T>) {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }))
}

export function labelOf<T extends string>(map: LabelMap<T>, value: T | null | undefined) {
  if (value == null) return '—'
  return map[value] ?? value
}

// ── Fundação ────────────────────────────────────────────────────────────

export const COLLABORATOR_ROLE = {
  director: 'Diretor',
  coordinator: 'Coordenador',
  admin_staff: 'Administrativo',
  finance: 'Financeiro',
  architect: 'Arquiteto',
  intern: 'Estagiário',
} as const satisfies LabelMap<string>

export type CollaboratorRole = keyof typeof COLLABORATOR_ROLE

export const COLLABORATOR_AREA = {
  commercial: 'Comercial',
  projects: 'Projetos',
  operations: 'Operacional',
  administrative: 'Administrativo',
  finance: 'Financeiro',
} as const satisfies LabelMap<string>

export type CollaboratorArea = keyof typeof COLLABORATOR_AREA

export const COLLABORATOR_STATUS = {
  active: 'Ativo',
  vacation: 'Férias',
  on_leave: 'Afastado',
} as const satisfies LabelMap<string>

export type CollaboratorStatus = keyof typeof COLLABORATOR_STATUS

export const ACCESS_REQUEST_STATUS = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada',
} as const satisfies LabelMap<string>

export type AccessRequestStatus = keyof typeof ACCESS_REQUEST_STATUS

export const TENANT_ROLE = {
  owner: 'Proprietário',
  member: 'Membro',
} as const satisfies LabelMap<string>

export type TenantRole = keyof typeof TENANT_ROLE

/*
  Funções que enxergam apenas as próprias atividades. Vem do Layout.jsx do
  original, que redireciona Arquiteto e Estagiário para MinhasAtividades e
  bloqueia dashboards e financeiro para eles.
*/
export const INDIVIDUAL_CONTRIBUTOR_ROLES: readonly CollaboratorRole[] = [
  'architect',
  'intern',
]
