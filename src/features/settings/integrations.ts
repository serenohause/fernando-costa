import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/edge-functions'
import { assertRowAffected, WriteError } from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { settingsKeys } from './hooks'
import type { GoogleCalendarConnection, GoogleCalendarOption, IntegrationApiKeyRow } from './types'

/*
  A integração com o Google Agenda, do lado do navegador.

  DUAS COISAS QUE NÃO ESTÃO AQUI, e é o ponto do desenho:

  - o `refresh_token`, que vive no Vault e só é alcançável por Edge Function;
  - a chave de integração já criada, que o banco guarda como SHA-256. Ela existe
    em texto uma única vez, na resposta de `create_integration_api_key`, e a
    tela mostra naquele momento. Não há como reexibi-la depois — de propósito.

  Conectar e desconectar passam por Edge Function porque envolvem falar com o
  Google (trocar o code, revogar o token). A única escrita que a tela faz direto
  é a escolha da agenda, e o banco limita isso por GRANT DE COLUNA.
*/

export const integrationKeys = {
  all: [...settingsKeys.all, 'integrations'] as const,
  googleConnection: () => [...integrationKeys.all, 'google-calendar'] as const,
  googleCalendars: () => [...integrationKeys.all, 'google-calendar', 'calendars'] as const,
  apiKeys: () => [...integrationKeys.all, 'api-keys'] as const,
}

export function useGoogleCalendarConnection() {
  return useQuery({
    queryKey: integrationKeys.googleConnection(),
    queryFn: async (): Promise<GoogleCalendarConnection | null> => {
      const { data, error } = await supabase
        .from('google_calendar_connections')
        .select(
          'id, google_account_email, calendar_id, calendar_label, granted_scopes, connected_at, last_success_at, last_error, last_error_at',
        )
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}

/*
  Só busca quando alguém abre o seletor de agenda: a chamada sai daqui para uma
  Edge Function que fala com o Google, e disparar isso no carregamento da tela
  gastaria uma ida ao Google toda vez que Configurações abrisse.
*/
export function useGoogleCalendarOptions(enabled: boolean) {
  return useQuery({
    queryKey: integrationKeys.googleCalendars(),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<GoogleCalendarOption[]> => {
      const data = await invokeEdgeFunction<{ calendars: GoogleCalendarOption[] }>(
        'google-calendar-list',
        {},
      )
      return data.calendars
    },
  })
}

/*
  A URL de autorização NÃO é montada aqui. Ela nasce no servidor porque o
  `state` precisa ser gravado antes de a viagem começar — e porque montá-la no
  navegador exigiria o client_id no bundle.
*/
export function useStartGoogleConnection() {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const data = await invokeEdgeFunction<{ authUrl: string }>('google-calendar-start', {})
      return data.authUrl
    },
  })
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return await invokeEdgeFunction<{ disconnected: boolean; revokedAtGoogle: boolean }>(
        'google-calendar-disconnect',
        {},
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.all })
    },
  })
}

export function useSelectGoogleCalendar() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async (calendar: { id: string; label: string }) => {
      if (!collaborator?.tenant_id) {
        throw new WriteError('Escritório não identificado na sua sessão.')
      }

      const { data, error } = await supabase
        .from('google_calendar_connections')
        .update({ calendar_id: calendar.id, calendar_label: calendar.label })
        .eq('tenant_id', collaborator.tenant_id)
        .select('id')

      if (error) throw error
      /* A policy filtra por USING: sem can_edit em Configurações nenhuma linha é
         alcançada e o PostgREST devolve zero linhas SEM erro. */
      assertRowAffected(
        data,
        'A agenda não foi alterada. É preciso permissão de edição em Configurações.',
      )
      return calendar
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.googleConnection() })
    },
  })
}

export function useIntegrationApiKeys() {
  return useQuery({
    queryKey: integrationKeys.apiKeys(),
    queryFn: async (): Promise<IntegrationApiKeyRow[]> => {
      const { data, error } = await supabase
        .from('integration_api_keys')
        .select('id, name, scope, key_prefix, created_at, last_used_at, revoked_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })
}

/*
  A CHAVE VOLTA UMA VEZ SÓ. O retorno desta mutação é o único momento em que ela
  existe em texto neste sistema — a tela mostra, quem gerou copia, e a partir
  daí só resta o hash no banco. Não guardar em estado global, não logar.
*/
export function useCreateIntegrationApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string): Promise<{ id: string; apiKey: string }> => {
      const { data, error } = await supabase
        .rpc('create_integration_api_key', { p_name: name })
        .maybeSingle()

      if (error) throw error
      if (!data) throw new WriteError('A chave não foi criada.')
      return { id: data.id, apiKey: data.api_key }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.apiKeys() })
    },
  })
}

export function useRevokeIntegrationApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('revoke_integration_api_key', { p_id: id })
      if (error) throw error
      if (data !== true) {
        throw new WriteError('A chave não foi revogada. Ela pode já estar revogada.')
      }
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.apiKeys() })
    },
  })
}

/*
  A URL que a automação chama. Montada a partir da mesma variável de ambiente
  que o cliente Supabase usa, para não haver duas verdades sobre qual projeto
  responde — é ela que vai no documento de entrega para quem cuida do n8n.
*/
export function agendaEndpointUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? ''
  return `${base.replace(/\/$/, '')}/functions/v1/google-calendar-agenda`
}
