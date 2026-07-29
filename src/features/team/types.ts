import type { Tables } from '@/lib/database.types'
import type { CollaboratorArea, CollaboratorRole, CollaboratorStatus } from '@/lib/enums'

export type Collaborator = Tables<'collaborators'>
export type AccessRequest = Tables<'access_requests'>

/* O que o formulário de colaborador do original edita, já em valores do banco. */
export type CollaboratorInput = {
  name: string
  role: CollaboratorRole
  area: CollaboratorArea | null
  email: string
  status: CollaboratorStatus
  weekly_hours: number | null
}

/* Uma linha da matriz do PermissoesManager, antes de virar UPSERT. */
export type PermissionDraft = {
  can_view: boolean
  can_edit: boolean
}

export type PermissionDraftMap = Record<string, PermissionDraft>
