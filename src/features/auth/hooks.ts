import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { buildNavigation } from './navigation'
import type { MenuRow, PermissionRow, Tenant } from './types'

export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
  collaborator: (userId: string | undefined) => [...authKeys.all, 'collaborator', userId] as const,
  tenant: (tenantId: string | undefined) => [...authKeys.all, 'tenant', tenantId] as const,
  menus: () => [...authKeys.all, 'menus'] as const,
  permissions: (collaboratorId: string | undefined) =>
    [...authKeys.all, 'permissions', collaboratorId] as const,
}

export function useSession() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      /*
        Limpar o cache aqui, e não só no botão de sair.

        `useSignOut` chama queryClient.clear(), mas só quando alguém clica em
        Sair. Sessão também termina por outro caminho: refresh token expirado
        ou falha ao renovar, que emitem SIGNED_OUT sem passar por mutation
        nenhuma. Nesse caso o cache continuava de pé, e outro colaborador
        logando na mesma aba dentro dos 5 minutos de gcTime recebia os dados do
        usuário anterior enquanto o refetch corria — as chaves de dado não
        carregam o usuário dentro.

        Hoje o dano seria dentro do mesmo escritório, onde a leitura já é larga
        por decisão. No dia em que existir o segundo escritório, isso é
        vazamento de dado pessoal entre tenants sem nenhuma falha de policy: a
        RLS nem é consultada, o dado já está na memória do navegador.

        Troca de usuário sem SIGNED_OUT no meio (raro, mas possível com sessão
        restaurada) é coberta pela comparação de id.
      */
      const previous = queryClient.getQueryData<Session | null>(authKeys.session())
      const userChanged = previous?.user?.id && previous.user.id !== session?.user?.id

      if (event === 'SIGNED_OUT' || userChanged) {
        queryClient.clear()
      }

      queryClient.setQueryData(authKeys.session(), session)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  return useQuery<Session | null>({
    queryKey: authKeys.session(),
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return data.session
    },
    staleTime: Infinity,
  })
}

export function useCurrentUser() {
  const sessionQuery = useSession()
  return {
    ...sessionQuery,
    data: sessionQuery.data?.user ?? null,
  }
}

export function useCurrentCollaborator() {
  const sessionQuery = useSession()
  const userId = sessionQuery.data?.user?.id

  const collaboratorQuery = useQuery({
    queryKey: authKeys.collaborator(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collaborators')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  return {
    ...collaboratorQuery,
    isLoading: sessionQuery.isLoading || collaboratorQuery.isLoading,
  }
}

/*
  O escritório da sessão. Existe porque o nome no topo da barra lateral e na tela
  de entrada era a string "FERNANDO COSTA" no código, e o sistema é multitenant:
  o nome é dado do tenant, igual ao nome de qualquer outra linha.

  O `tenant_id` sai do colaborador logado — o mesmo caminho que os `useTenantId()`
  de cada feature já usam para escrever. Nenhuma migration foi necessária: a
  policy `tenants_select_own_tenant` (migration 0008) já libera a leitura, e ela
  devolve no máximo uma linha, a do próprio escritório, e só para colaborador
  `active`.

  `maybeSingle`, não `single`: quem ainda não foi aprovado, ou teve o vínculo
  revogado, lê zero linhas por força da mesma policy. Isso é ausência de dado, e
  não falha — `single` transformaria a situação prevista em erro na tela.

  `staleTime: Infinity` porque nome de escritório não muda durante uma sessão;
  quando mudar, é por outra tela, que invalida a chave.
*/
export function useCurrentTenant() {
  const collaboratorQuery = useCurrentCollaborator()
  const tenantId = collaboratorQuery.data?.tenant_id

  const tenantQuery = useQuery({
    queryKey: authKeys.tenant(tenantId),
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('id', tenantId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: Infinity,
  })

  return {
    ...tenantQuery,
    data: tenantQuery.data ?? null,
    isLoading: collaboratorQuery.isLoading || tenantQuery.isLoading,
    isError: Boolean(collaboratorQuery.error ?? tenantQuery.error),
  }
}

/* Catálogo de menus: a sidebar usa para montar a navegação, e o PermissoesManager
   para rotular a matriz de permissões — o rótulo nunca é escrito na tela à mão. */
export function useMenus(enabled = true) {
  return useQuery({
    queryKey: authKeys.menus(),
    enabled,
    queryFn: async (): Promise<MenuRow[]> => {
      const { data, error } = await supabase
        .from('menus')
        .select('key, label_pt, sort_order, parent_key')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: Infinity,
  })
}

export function useCollaboratorPermissions(collaboratorId: string | undefined) {
  return useQuery({
    queryKey: authKeys.permissions(collaboratorId),
    enabled: Boolean(collaboratorId),
    queryFn: async (): Promise<PermissionRow[]> => {
      const { data, error } = await supabase
        .from('collaborator_permissions')
        .select('menu_key, can_view, can_edit')
        .eq('collaborator_id', collaboratorId!)
      if (error) throw error
      return data ?? []
    },
  })
}

/*
  Porta de projeto-original/src/components/shared/usePermissions.jsx, que o
  original chama por rótulo de menu (`usePermissions('CRM')`) e aqui é chamado
  pela chave estável (`useMenuPermissions('crm')`).

  A regra é a MESMA do banco, e isso é o ponto: `can_edit_menu()` (migration
  0019) libera Diretor sem consultar a matriz e, para os demais, exige a linha
  gravada. É a regra do original (usePermissions.jsx:36-49) portada literalmente.
  Se a tela usasse outro critério, o resultado seria frontend e banco discordando
  sobre quem escreve — a tela prometendo o botão e o banco devolvendo 403, ou o
  contrário.

  O que continua não sendo trabalho daqui: autorizar. Quem autoriza é a RLS.
  Isto só decide o que aparece na tela — e o `status !== 'active'` reproduz o
  `auth_collaborator_id()`, que devolve nulo para quem está em Férias ou
  Afastado.

  Não custa requisição nova: a chave de `useCollaboratorPermissions` é a mesma
  que o AppLayout já usa para montar a sidebar.
*/
export function useMenuPermissions(menuKey: string) {
  const collaboratorQuery = useCurrentCollaborator()
  const collaborator = collaboratorQuery.data ?? null
  const isActive = collaborator?.status === 'active'

  const permissionsQuery = useCollaboratorPermissions(isActive ? collaborator!.id : undefined)
  const row = permissionsQuery.data?.find((permission) => permission.menu_key === menuKey)
  const isDirector = isActive && collaborator?.role === 'director'

  return {
    canView: Boolean(isDirector || row?.can_view),
    canEdit: Boolean(isDirector || row?.can_edit),
    isDirector,
    isLoading: collaboratorQuery.isLoading || permissionsQuery.isLoading,
    isError: Boolean(collaboratorQuery.error ?? permissionsQuery.error),
  }
}

/*
  Menu montado: `menus` cruzado com as permissões do colaborador logado,
  respeitando parent_key, sort_order, can_view e as regras por função.
  Os três estados (carregando / vazio / erro) saem daqui prontos para a UI.
*/
export function useAppNavigation() {
  const collaboratorQuery = useCurrentCollaborator()
  const collaborator = collaboratorQuery.data ?? null
  const isActive = collaborator?.status === 'active'

  const menusQuery = useMenus(isActive)
  const permissionsQuery = useCollaboratorPermissions(isActive ? collaborator!.id : undefined)

  const items = useMemo(() => {
    if (!collaborator || !menusQuery.data || !permissionsQuery.data) return []
    return buildNavigation({
      menus: menusQuery.data,
      permissions: permissionsQuery.data,
      role: collaborator.role,
    })
  }, [collaborator, menusQuery.data, permissionsQuery.data])

  const isLoading = menusQuery.isLoading || permissionsQuery.isLoading
  const error = menusQuery.error ?? permissionsQuery.error ?? null

  return {
    items,
    /* O original libera qualquer "último menu" a quem não tem nenhuma linha de permissão. */
    permissionCount: permissionsQuery.data?.length ?? 0,
    isLoading,
    isError: Boolean(error),
    error,
    isEmpty: !isLoading && !error && items.length === 0,
  }
}

export function useSignOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.clear()
    },
  })
}

export function useSignInWithPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword(credentials)
      if (error) throw error
      return data.session
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session(), session)
    },
  })
}
