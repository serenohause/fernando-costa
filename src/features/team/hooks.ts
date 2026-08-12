import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/edge-functions'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { authKeys, useCurrentCollaborator } from '@/features/auth/hooks'
import { MENUS_SISTEMA } from './permissions-matrix'
import {
  approveAccessRequestSchema,
  collaboratorInputSchema,
  type ApproveAccessRequestInput,
} from './schemas'
import type { AccessRequest, Collaborator, CollaboratorInput, PermissionDraftMap } from './types'

export const teamKeys = {
  all: ['team'] as const,
  collaborators: () => [...teamKeys.all, 'collaborators'] as const,
  accessRequests: (status: string) => [...teamKeys.all, 'access-requests', status] as const,
}

/*
  As constraints desta feature, em português. A mecânica (Zod primeiro, SQLSTATE
  depois, `error.message` como último recurso) mora em src/lib/db-errors.ts e é a
  mesma de todos os módulos — aqui ficam só as frases que dependem das tabelas
  daqui.
*/
const TEAM_ERROR_MESSAGES: DatabaseErrorMessages = {
  access_requests_tenant_id_email_pending_key:
    'Já existe um pedido de acesso pendente para este e-mail. Aprove ou recuse o que está na fila antes de abrir outro.',
  collaborators_tenant_id_user_id_key:
    'Esta conta de login já está ligada a outro colaborador deste escritório. Uma pessoa tem um cadastro só — abra o que já existe em vez de criar um segundo.',
  /*
    APAGAR UM COLABORADOR esbarra em tudo que registra QUEM fez o quê. Nenhum
    tem cascade, e é isso que preserva o histórico: quem foi responsável por um
    projeto continua tendo sido, mesmo depois de sair do escritório. Por isso a
    saída certa quase nunca é excluir — é marcar como Afastado, que já tira o
    acesso e mantém o registro.
  */
  projects_operational_responsible_id_fkey:
    'Esta pessoa é responsável operacional de projeto. Passe o projeto para outra pessoa, ou marque este colaborador como Afastado em vez de excluir — Afastado perde o acesso e preserva o histórico.',
  projects_commercial_responsible_id_fkey:
    'Esta pessoa é responsável comercial de projeto. Passe o projeto para outra pessoa, ou marque o colaborador como Afastado em vez de excluir.',
  negotiations_commercial_owner_id_fkey:
    'Esta pessoa é responsável por negociação no Pipeline. Passe a negociação para outra pessoa, ou marque o colaborador como Afastado em vez de excluir.',
  tasks_responsible_id_fkey:
    'Esta pessoa é responsável por tarefa no Fluxo do Projeto. Passe a tarefa para outra pessoa, ou marque o colaborador como Afastado.',
  activities_collaborator_id_fkey:
    'Esta pessoa tem atividades registradas. O histórico de produtividade não é excluído junto — marque o colaborador como Afastado em vez de excluir.',
  activities_coordinator_id_fkey:
    'Esta pessoa coordena atividades de outras. Troque o coordenador dessas atividades, ou marque o colaborador como Afastado.',
  collaborators_coordinator_id_fkey:
    'Esta pessoa é coordenadora de outros colaboradores. Troque o coordenador deles antes de excluir.',
  budget_checklists_responsible_id_fkey:
    'Esta pessoa é responsável por checklist de orçamento. Troque o responsável antes de excluir.',
  budget_checklist_items_responsible_id_fkey:
    'Esta pessoa é responsável por item de orçamento. Troque o responsável antes de excluir.',
  /*
    Estes quatro guardam AUTORIA de um ato passado — quem iniciou, quem
    concluiu, quem excluiu, quem aprovou. Não há "trocar o responsável": o ato
    aconteceu. A saída é Afastado.
  */
  activities_started_by_fkey:
    'Esta pessoa iniciou atividades, e isso é registro do que aconteceu — não dá para transferir. Marque o colaborador como Afastado em vez de excluir.',
  activities_completed_by_fkey:
    'Esta pessoa concluiu atividades, e isso é registro do que aconteceu. Marque o colaborador como Afastado em vez de excluir.',
  activities_deleted_by_fkey:
    'Esta pessoa excluiu atividades, e isso é registro do que aconteceu. Marque o colaborador como Afastado em vez de excluir.',
  access_requests_decided_by_fkey:
    'Esta pessoa aprovou ou recusou pedidos de acesso, e isso é registro do que aconteceu. Marque o colaborador como Afastado em vez de excluir.',
  collaborators_tenant_id_email_key:
    'Já existe um colaborador com este e-mail no escritório. Se a pessoa mudou de função ou voltou, edite o cadastro que já existe em vez de criar um segundo.',
  '23505': 'Já existe um colaborador com esse e-mail no escritório.',
  '23514': 'Algum campo está fora do formato aceito. Confira e-mail e carga horária.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, TEAM_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Colaboradores ─────────────────────────────────────────────────────── */

export function useCollaborators() {
  return useQuery({
    queryKey: teamKeys.collaborators(),
    queryFn: async (): Promise<Collaborator[]> => {
      const { data, error } = await supabase
        .from('collaborators')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateCollaborator() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: CollaboratorInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = collaboratorInputSchema.parse(input)

      const { data, error } = await supabase
        .from('collaborators')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.collaborators() })
    },
  })
}

export function useUpdateCollaborator() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CollaboratorInput }) => {
      const parsed = collaboratorInputSchema.parse(input)

      const { data, error } = await supabase
        .from('collaborators')
        .update(parsed)
        .eq('id', id)
        .select('*')
      if (error) throw error
      assertRowAffected(data, 'Nenhum colaborador foi alterado. Apenas o Diretor pode editar.')
      return data![0]
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.collaborators() })
      /* Editar a si mesmo muda função e área que a sidebar já leu. */
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
    },
  })
}

export function useDeleteCollaborator() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('collaborators')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      /*
        A policy 0012 impede o Diretor de apagar a própria linha — sem isso o
        escritório poderia ficar sem nenhum Diretor e sem volta pelo cliente.
      */
      assertRowAffected(
        data,
        'Nenhum colaborador foi excluído. Um Diretor não pode excluir o próprio cadastro.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.collaborators() })
    },
  })
}

/* ── Permissões ────────────────────────────────────────────────────────── */

/*
  Grava a matriz inteira de uma vez. O original faz um create/update por menu e
  dispara tudo em Promise.all — falha no meio deixa metade salva. Aqui é um
  UPSERT único: ou a matriz inteira entra, ou nenhuma linha entra.

  Linha com can_view e can_edit falsos é gravada de propósito, e não removida:
  é o mesmo estado que approve_access_request semeia na aprovação (migration
  0013), e o buildNavigation só olha can_view.
*/
export function useSaveCollaboratorPermissions(collaborator: Collaborator | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (draft: PermissionDraftMap) => {
      if (!collaborator) throw new WriteError('Colaborador não identificado.')

      const rows = MENUS_SISTEMA.map((menuKey) => {
        const perm = draft[menuKey] ?? { can_view: false, can_edit: false }
        return {
          tenant_id: collaborator.tenant_id,
          collaborator_id: collaborator.id,
          menu_key: menuKey,
          can_view: perm.can_view,
          /* O check do banco recusa can_edit sem can_view; a UI já impede, isto é a rede. */
          can_edit: perm.can_view && perm.can_edit,
        }
      })

      const { error } = await supabase
        .from('collaborator_permissions')
        .upsert(rows, { onConflict: 'collaborator_id,menu_key' })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.permissions(collaborator?.id) })
      void queryClient.invalidateQueries({ queryKey: teamKeys.collaborators() })
    },
  })
}

/* ── Fila de acesso ────────────────────────────────────────────────────── */

/*
  Só Diretor lê (policy access_requests_select_director, migration 0011/0012).
  Para quem não é Diretor a RLS devolve lista VAZIA, não erro — por isso quem
  distingue "não pode ver" de "não há nada" é o guarda de função da tela, nunca
  o resultado desta consulta.
*/
export function useAccessRequests(enabled = true) {
  return useQuery({
    queryKey: teamKeys.accessRequests('pending'),
    enabled,
    queryFn: async (): Promise<AccessRequest[]> => {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

type ApproveResponse = {
  status: 'approved'
  collaboratorId: string
  created: boolean
  permissionsSeeded: number
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ApproveAccessRequestInput) => {
      const body = approveAccessRequestSchema.parse(input)
      return invokeEdgeFunction<ApproveResponse>('approve-access-request', body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all })
    },
  })
}

type RejectResponse = { status: 'rejected'; requestId: string }

export function useRejectAccessRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) =>
      invokeEdgeFunction<RejectResponse>('reject-access-request', { requestId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.accessRequests('pending') })
    },
  })
}
