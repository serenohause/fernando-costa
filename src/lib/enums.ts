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

// ── CRM ─────────────────────────────────────────────────────────────────

export const CLIENT_TYPE = {
  individual: 'Pessoa Física',
  company: 'Pessoa Jurídica',
} as const satisfies LabelMap<string>

export type ClientType = keyof typeof CLIENT_TYPE

/* Ordem do select de ClientForm.jsx do original, não alfabética. */
export const LEAD_SOURCE = {
  instagram: 'Instagram',
  referral: 'Indicação',
  website: 'Site',
  other: 'Outros',
} as const satisfies LabelMap<string>

export type LeadSource = keyof typeof LEAD_SOURCE

// ── Pipeline ────────────────────────────────────────────────────────────

/* Ordem dos checkboxes de NegociacaoForm.jsx do original, não alfabética. */
export const SERVICE_TYPE = {
  architecture: 'Arquitetura',
  interiors: 'Interiores',
  structural: 'Estrutura',
  plumbing: 'Hidrosanitário',
  electrical: 'Elétrico',
  consulting: 'Consultoria',
} as const satisfies LabelMap<string>

export type ServiceType = keyof typeof SERVICE_TYPE

export const NEGOTIATION_STATUS = {
  active: 'Ativa',
  won: 'Ganha',
  lost: 'Perdida',
} as const satisfies LabelMap<string>

export type NegotiationStatus = keyof typeof NEGOTIATION_STATUS

/* Ordem das colunas do quadro (NegociacaoKanban.jsx), que é a ordem do funil. */
export const FUNNEL_STAGE = {
  lead_received: 'Lead recebido',
  qualified: 'Qualificado',
  proposal_sent: 'Proposta enviada',
  negotiating: 'Em negociação',
  closing: 'Fechamento',
} as const satisfies LabelMap<string>

export type FunnelStage = keyof typeof FUNNEL_STAGE

/*
  SUPERCONJUNTO de LEAD_SOURCE (CRM): o pipeline tem `event` e o CRM não, e os
  quatro valores comuns têm a mesma grafia de propósito — é o que permite a
  conversão `lead_source::text::lead_origin` da migration 0021.
*/
export const LEAD_ORIGIN = {
  instagram: 'Instagram',
  referral: 'Indicação',
  website: 'Site',
  event: 'Evento',
  other: 'Outro',
} as const satisfies LabelMap<string>

export type LeadOrigin = keyof typeof LEAD_ORIGIN

export const LOSS_REASON = {
  price: 'Valor',
  timeline: 'Prazo',
  chose_competitor: 'Escolheu outro escritório',
  postponed: 'Vai adiar o projeto',
  no_response: 'Não respondeu',
  other: 'Outro',
} as const satisfies LabelMap<string>

export type LossReason = keyof typeof LOSS_REASON

export const CLIENT_INTAKE_STATUS = {
  active: 'Ativo',
  expired: 'Expirado',
  submitted: 'Enviado',
} as const satisfies LabelMap<string>

export type ClientIntakeStatus = keyof typeof CLIENT_INTAKE_STATUS

/*
  Coluna de auditoria do link público (`client_intakes.last_validation_status`).
  Não aparece em nenhuma tela hoje — existe para investigar link que "não
  funciona" sem depender do relato de quem tentou. O rótulo vem de
  docs/ENUM-MAP.md, seção Pipeline, e fica aqui para que a primeira tela que
  precisar dele não invente texto novo.
*/
export const CLIENT_INTAKE_VALIDATION_STATUS = {
  created: 'Link criado',
  ok: 'Link aberto',
  expired: 'Link expirado',
  already_submitted: 'Link já utilizado',
  expired_on_submit: 'Expirou antes do envio',
  submitted: 'Enviado com sucesso',
} as const satisfies LabelMap<string>

export type ClientIntakeValidationStatus = keyof typeof CLIENT_INTAKE_VALIDATION_STATUS

/*
  Funções que enxergam apenas as próprias atividades. Vem do Layout.jsx do
  original, que redireciona Arquiteto e Estagiário para MinhasAtividades e
  bloqueia dashboards e financeiro para eles.
*/
export const INDIVIDUAL_CONTRIBUTOR_ROLES: readonly CollaboratorRole[] = [
  'architect',
  'intern',
]
