import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { activityInputSchema } from './schemas'
import { applyStatus, completePatch, softDeletePatch, startPatch } from './execution'
import type { Activity, ActivityInput, ActivityRow } from './types'

export const activityKeys = {
  all: ['activities'] as const,
  list: () => [...activityKeys.all, 'list'] as const,
  completed: () => [...activityKeys.all, 'completed'] as const,
}

/* `Atividade.list('-prazo_termino')` é como o original carrega as telas. */
const LIST_LIMIT = 500

const ACTIVITIES_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    `activities_tenant_id_collaborator_id_execution_order_key`. A fila é POR
    PESSOA (migration 0037, item 4), e duas atividades do mesmo responsável não
    ocupam a mesma posição. No original nada impede isso, e a lista passa a
    depender do critério de desempate.
  */
  '23505': 'Duas atividades do mesmo responsável ficaram na mesma posição da fila.',
  '23503': 'O responsável, o coordenador, o projeto ou o cliente não existe mais neste escritório.',
  '23502': 'Falta um campo obrigatório: descrição, responsável e os dois prazos.',
  /*
    Os checks da migration 0037. `activityInputSchema` e `execution.ts` normalizam
    antes de gravar, então chegar aqui significa gravação vinda de outro caminho
    — a frase existe para não virar nome de constraint na tela.
  */
  '23514':
    'A atividade está num estado que o sistema não aceita. Confira os prazos, o andamento e a data de conclusão.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, ACTIVITIES_ERROR_MESSAGES)
}

function useCurrentIds() {
  const { data } = useCurrentCollaborator()
  return { tenantId: data?.tenant_id, collaboratorId: data?.id }
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  UMA consulta traz a lista com os quatro nomes que as telas mostram.

  Os quatro `*_name` do base44 saíram do schema (migration 0037, item 1) e voltam
  como embed; o nome do relacionamento é o da CONSTRAINT porque as FK são
  compostas e porque DOIS embeds saem de `collaborators`.

  O RECORTE POR PESSOA NÃO ESTÁ AQUI, e é de propósito. Este é o único módulo do
  sistema em que a leitura não é larga: `activities_select_own_or_activities_editor`
  (migration 0038) devolve todas as atividades do escritório a quem tem
  `can_edit_menu('activities')` — ou é Diretor, pelo atalho da 0019 — e SÓ as
  próprias (ou as de quem a pessoa coordena) para os demais. No original esse
  recorte é filtro de navegador (MinhasAtividades.jsx:58), que nada impede de
  contornar chamando a entidade direto.

  `deleted_at is null` É filtro de consulta, e não de policy: a atividade
  excluída continua legível porque quem administra precisa poder recuperá-la
  (migration 0037). Quem a esconde da listagem é este `.is()` — e o índice
  parcial `activities_tenant_id_end_date_idx` é exatamente este recorte.
*/
const ACTIVITIES_SELECT = `
  *,
  collaborator:collaborators!activities_collaborator_id_fkey(id, name),
  coordinator:collaborators!activities_coordinator_id_fkey(id, name),
  project:projects!activities_project_id_fkey(id, name),
  client:clients!activities_client_id_fkey(id, name)
`

export function useActivities() {
  return useQuery({
    queryKey: activityKeys.list(),
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select(ACTIVITIES_SELECT)
        .is('deleted_at', null)
        .order('end_date', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as ActivityRow[]
    },
  })
}

/*
  O que o Relatório de Produtividade lê: só atividade concluída COM execução
  registrada, que é o filtro do original (RelatorioProdutividade.jsx:57-65) — sem
  os dois carimbos não há tempo total para somar.

  A diferença é onde o filtro roda: lá a lista inteira desce para o navegador e é
  peneirada em memória; aqui é WHERE. `total_minutes` não precisa entrar na
  condição: ele é derivado dos dois carimbos e é nulo exatamente quando um deles
  falta.
*/
export function useCompletedActivities() {
  return useQuery({
    queryKey: activityKeys.completed(),
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select(ACTIVITIES_SELECT)
        .is('deleted_at', null)
        .eq('status', 'completed')
        .not('started_at', 'is', null)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as ActivityRow[]
    },
  })
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

/*
  Criar exige `can_edit_menu('activities')`, e não basta ser o responsável: a
  policy de INSERT (migration 0038) continua sendo a do padrão dos módulos
  anteriores, porque criar atividade é ATRIBUIR trabalho. Só o UPDATE foi
  afrouxado para o dono da linha (migration 0039).

  `execution_order` nasce nula, como no original (AtividadeForm.jsx:69) —
  atividade nova entra sem posição na fila e cai no critério de prazo.
*/
export function useCreateActivity() {
  const queryClient = useQueryClient()
  const { tenantId, collaboratorId } = useCurrentIds()

  return useMutation({
    mutationFn: async (input: ActivityInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = activityInputSchema.parse(input)

      const { data, error } = await supabase
        .from('activities')
        .insert({
          ...parsed,
          ...applyStatus(parsed.status, null, collaboratorId),
          tenant_id: tenantId,
        })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
  })
}

/*
  Editar alcança quem tem o menu OU o responsável OU o coordenador da linha
  (migration 0039) — o mesmo recorte da leitura.

  DUAS COLUNAS QUE O FORMULÁRIO NÃO TEM E ESTE GESTO GRAVA:

  1. `completed_at` / `completed_by`, amarradas ao status por `applyStatus` — ver
     execution.ts.
  2. `execution_order`, zerada quando o responsável muda. É o que o original faz
     no próprio formulário (AtividadeForm.jsx:132), e aqui é obrigatório: a fila é
     por pessoa, e a posição 3 do antigo responsável não significa nada na fila
     do novo — pior, colide com a posição 3 que já existe lá.
*/
export function useUpdateActivity() {
  const queryClient = useQueryClient()
  const { collaboratorId } = useCurrentIds()

  return useMutation({
    mutationFn: async ({
      id,
      input,
      current,
    }: {
      id: string
      input: ActivityInput
      current: Activity
    }) => {
      const parsed = activityInputSchema.parse(input)
      const reassigned = parsed.collaborator_id !== current.collaborator_id

      const { data, error } = await supabase
        .from('activities')
        .update({
          ...parsed,
          ...applyStatus(parsed.status, current, collaboratorId),
          ...(reassigned ? { execution_order: null } : {}),
        })
        .eq('id', id)
        .select('id')

      if (error) throw error
      /*
        Escrita negada pela RLS em UPDATE não vira erro: a linha só não é
        alcançada e o PostgREST devolve zero linhas. Sem esta conferência a tela
        diria "atualizada com sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhuma atividade foi alterada. É preciso ser o responsável, o coordenador ou ter permissão de edição em Atividades.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
  })
}

/*
  A exclusão, que é UPDATE (migration 0037, item 2). A policy de DELETE existe no
  banco e nenhuma tela a usa.

  Quem exclui precisa de `can_edit_menu('activities')` — não porque o UPDATE o
  exija (a 0039 aceita o responsável), mas porque excluir remove da auditoria de
  quem fez o quê, e a tela do original também só oferece o botão a gestor
  (Atividades.jsx:415-419). Quem decide é a tela; o banco aceitaria o dono.
*/
export function useSoftDeleteActivity() {
  const queryClient = useQueryClient()
  const { collaboratorId } = useCurrentIds()

  return useMutation({
    mutationFn: async (id: string) => {
      if (!collaboratorId) throw new WriteError('Colaborador não identificado na sua sessão.')

      const { data, error } = await supabase
        .from('activities')
        .update(softDeletePatch(collaboratorId))
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma atividade foi excluída. É preciso permissão de edição em Atividades.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
  })
}

/* "Começar agora" — o botão que a migration 0039 existe para destravar: sem ela,
   Arquiteto e Estagiário liam as próprias atividades e não conseguiam iniciá-las. */
export function useStartActivity() {
  const queryClient = useQueryClient()
  const { collaboratorId } = useCurrentIds()

  return useMutation({
    mutationFn: async (activity: Activity) => {
      if (!collaboratorId) throw new WriteError('Colaborador não identificado na sua sessão.')

      const { data, error } = await supabase
        .from('activities')
        .update(startPatch(activity, collaboratorId))
        .eq('id', activity.id)
        .select('id')

      if (error) throw error
      assertRowAffected(data, 'A atividade não foi iniciada. Ela não está sob sua responsabilidade.')
      return activity.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
  })
}

/* "Concluir". `total_minutes` NÃO vai no patch: quem o calcula é o banco. */
export function useCompleteActivity() {
  const queryClient = useQueryClient()
  const { collaboratorId } = useCurrentIds()

  return useMutation({
    mutationFn: async (activity: Activity) => {
      if (!collaboratorId) throw new WriteError('Colaborador não identificado na sua sessão.')

      const { data, error } = await supabase
        .from('activities')
        .update(completePatch(collaboratorId))
        .eq('id', activity.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A atividade não foi concluída. Ela não está sob sua responsabilidade.',
      )
      return activity.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
  })
}

/*
  O arrastar de ReordenarAtividades: reescrever 1..n a fila de UMA pessoa.

  POR QUE ISTO É UM ÚNICO UPSERT, E NÃO N UPDATES COMO NA LISTA DE PROJETOS

  `activities_tenant_id_collaborator_id_execution_order_key` é DEFERRABLE
  INITIALLY DEFERRED: a unicidade é conferida no COMMIT, e não a cada linha. É o
  que permite trocar duas posições sem inventar uma posição temporária. Mas isso
  só vale DENTRO de uma transação — N requisições paralelas são N transações, e a
  troca de 1 por 2 colidiria na segunda delas. Por isso a lista inteira vai numa
  chamada só.

  E o árbitro do ON CONFLICT é `id`, a chave primária: constraint diferível não
  serve de árbitro (o Postgres recusa), como a própria migration 0037 registra.

  O payload leva as colunas NOT NULL da tabela junto porque `upsert` é
  `INSERT ... ON CONFLICT`; como a linha sempre existe, o caminho tomado é o de
  UPDATE, e elas são regravadas com o valor que já tinham. `total_minutes` fica
  de fora — é gerada, e enviá-la é 428C9.
*/
export function useReorderActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ordered: ActivityRow[]) => {
      const changed = ordered
        .map((activity, index) => ({ activity, position: index + 1 }))
        .filter(({ activity, position }) => activity.execution_order !== position)

      if (changed.length === 0) return 0

      const { data, error } = await supabase
        .from('activities')
        .upsert(
          changed.map(({ activity, position }) => ({
            id: activity.id,
            tenant_id: activity.tenant_id,
            description: activity.description,
            collaborator_id: activity.collaborator_id,
            start_date: activity.start_date,
            end_date: activity.end_date,
            execution_order: position,
          })),
          { onConflict: 'id' },
        )
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A ordem não foi alterada. É preciso permissão de edição em Atividades.',
      )
      return changed.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
  })
}
