import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { buildNavigation } from './navigation'
import type { MenuRow, PermissionRow } from './types'

export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
  collaborator: (userId: string | undefined) => [...authKeys.all, 'collaborator', userId] as const,
  menus: () => [...authKeys.all, 'menus'] as const,
  permissions: (collaboratorId: string | undefined) =>
    [...authKeys.all, 'permissions', collaboratorId] as const,
}

export function useSession() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
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
