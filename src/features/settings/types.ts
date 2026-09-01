import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'

/*
  O tipo de serviço deixou de ser um valor de enum e virou uma LINHA (migration
  0084). A diferença que importa para quem lê este arquivo: a lista muda em
  tempo de execução, por escritório, e nada no TypeScript pode enumerá-la.

  Por isso `key` continua existindo ao lado de `id`: é ela que a importação do
  base44 e o de/para de `docs/ENUM-MAP.md` conhecem, e é ela que se lê num log
  sem precisar de um join.
*/
export type ServiceTypeRow = Tables<'service_types'>
export type ServiceTypeInsert = TablesInsert<'service_types'>
export type ServiceTypeUpdate = TablesUpdate<'service_types'>

export type ServiceContractGroup = ServiceTypeRow['contract_group']

/*
  A conexão com o Google Agenda (migration 0085). O recorte é o que a tela lê —
  `refresh_token_secret_id` fica de fora de propósito: o ponteiro para o segredo
  não tem por que passear pelo navegador.
*/
export type GoogleCalendarConnection = Pick<
  Tables<'google_calendar_connections'>,
  | 'id'
  | 'google_account_email'
  | 'calendar_id'
  | 'calendar_label'
  | 'granted_scopes'
  | 'connected_at'
  | 'last_success_at'
  | 'last_error'
  | 'last_error_at'
>

/* Uma agenda da conta conectada, como a Edge Function google-calendar-list
   devolve. Não vem do banco: é resposta do Google, viva. */
export type GoogleCalendarOption = {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

/*
  A chave de automação, sem a chave. `key_prefix` identifica; o valor completo
  existiu uma vez, na criação, e o banco guarda só o SHA-256.
*/
export type IntegrationApiKeyRow = Pick<
  Tables<'integration_api_keys'>,
  'id' | 'name' | 'scope' | 'key_prefix' | 'created_at' | 'last_used_at' | 'revoked_at'
>
