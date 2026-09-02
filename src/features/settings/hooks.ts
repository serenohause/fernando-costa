import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import type { ServiceContractGroup, ServiceTypeRow } from './types'

export const settingsKeys = {
  all: ['settings'] as const,
  serviceTypes: () => [...settingsKeys.all, 'service-types'] as const,
}

const SETTINGS_ERROR_MESSAGES: DatabaseErrorMessages = {
  service_types_tenant_id_key_key:
    'Já existe um tipo de serviço com esse nome neste escritório. Se ele foi desativado, reative em vez de criar outro.',
  service_types_key_format_check:
    'O nome do tipo precisa começar por uma letra. Use letras, números e espaços.',
  service_types_label_not_blank_check: 'Dê um nome ao tipo de serviço.',
  service_types_label_length_check: 'O nome do tipo é longo demais (máximo de 60 caracteres).',
  /*
    A tela não oferece exclusão — o gesto dela é desativar, que preserva o que já
    foi vendido. As duas frases abaixo cobrem quem chega ao DELETE por outro
    caminho (a API, um script): 42501 é falta de permissão no menu `settings`,
    e 23503 é a FK de `negotiation_services` protegendo o histórico.
  */
  integration_api_keys_name_not_blank_check: 'Dê um nome à chave de automação.',
  integration_api_keys_name_length_check:
    'O nome da chave é longo demais (máximo de 80 caracteres).',
  '42501': 'Sem permissão de edição em Configurações.',
  not_authorized: 'Sem permissão de edição em Configurações.',
  '23503': 'Este tipo de serviço está em uso por alguma negociação. Desative em vez de excluir.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, SETTINGS_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/*
  A LISTA DE TIPOS DE SERVIÇO, e ela é lida por duas telas com necessidades
  diferentes: Configurações mostra TUDO (inclusive o que foi desativado, para
  poder reativar), e o Pipeline mostra só o que está ativo.

  Uma consulta só, filtrada em memória por quem chama. São seis linhas hoje e
  algumas dezenas no pior caso — duas consultas com recortes diferentes é que
  dariam duas listas discordando na tela.
*/
export function useServiceTypes() {
  return useQuery({
    queryKey: settingsKeys.serviceTypes(),
    queryFn: async (): Promise<ServiceTypeRow[]> => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('display_order', { ascending: true })
        .order('label', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })
}

/*
  A CHAVE É DERIVADA DO NOME, e não digitada.

  `key` é o identificador estável — o que a importação do base44 conhece e o que
  sobrevive a um "renomear". Pedir os dois ao escritório seria pedir que ele
  entendesse a diferença; derivar do nome dá uma chave legível sem essa conversa.

  Colisão não é tratada aqui: o índice `(tenant_id, key)` recusa, e a mensagem
  correspondente já diz o que fazer. Inventar `paisagismo_2` seria criar em
  silêncio um segundo tipo com o mesmo nome na tela.
*/
export function serviceKeyFrom(label: string): string {
  const semAcento = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
  return semAcento
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export function useCreateServiceType() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: { label: string; contract_group: ServiceContractGroup }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const label = input.label.trim()
      const key = serviceKeyFrom(label)
      if (!key) {
        throw new WriteError('O nome precisa ter ao menos uma letra ou número.')
      }

      /* Entra no fim da lista: ordem é decisão de quem configura, e o lugar
         previsível para um item novo é o fim. */
      const { data: ultimo } = await supabase
        .from('service_types')
        .select('display_order')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data, error } = await supabase
        .from('service_types')
        .insert({
          tenant_id: tenantId,
          key,
          label,
          contract_group: input.contract_group,
          display_order: (ultimo?.display_order ?? 0) + 1,
        })
        .select('*')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all })
    },
  })
}

export function useUpdateServiceType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...columns
    }: {
      id: string
      label?: string
      contract_group?: ServiceContractGroup
      is_active?: boolean
      display_order?: number
    }) => {
      const { data, error } = await supabase
        .from('service_types')
        .update(columns)
        .eq('id', id)
        .select('id')

      if (error) throw error
      /*
        `service_types_update_settings_editor` filtra por USING: sem can_edit no
        menu `settings`, nenhuma linha é alcançada e o PostgREST devolve zero
        linhas SEM erro. Sem esta conferência a tela diria "salvo" e nada teria
        mudado.
      */
      assertRowAffected(
        data,
        'O tipo de serviço não foi alterado. É preciso permissão de edição em Configurações.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all })
      /* O Pipeline desenha os checkboxes com esta lista: renomear um tipo aqui
         precisa aparecer lá sem recarregar a página. */
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })
}
