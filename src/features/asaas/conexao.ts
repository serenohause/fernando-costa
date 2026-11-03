import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/edge-functions'
import type { Enums } from '@/lib/database.types'
import { asaasKeys } from './hooks'

/*
  A CONEXÃO COM A CONTA ASAAS DO ESCRITÓRIO, do lado do navegador.

  O QUE NÃO ESTÁ AQUI, e é o ponto do desenho: a API Key. Ela vive no Vault
  (0128) e só Edge Function a alcança — não existe coluna com o valor e não
  existe caminho de leitura para a tela. Ela existe em texto uma vez só, no
  campo do formulário de conectar, e vai direto para `asaas-connect`. Nada
  neste arquivo a guarda em cache, em estado de módulo ou em log.

  A 0126 dá à tela SOMENTE leitura do estado: `select` em `asaas_connections`
  para quem vê o menu `settings`, no tenant do JWT. Não há policy nem grant de
  INSERT, UPDATE ou DELETE — ligar, religar o aviso e desligar são as três Edge
  Functions abaixo, porque as três mexem no cofre e falam com o Asaas.

  NENHUM `tenant_id` APARECE NESTE ARQUIVO, de propósito: repetir o recorte da
  RLS aqui criaria uma segunda cópia da regra para desalinhar. Quem não pode
  ver recebe nada, e a tela mostra "não conectado".
*/

export type AsaasEnvironment = Enums<'asaas_environment'>

export const asaasConnectionKeys = {
  all: [...asaasKeys.all, 'connection'] as const,
}

/* O nome do ambiente onde o botão de conectar o diz, e onde o toast o repete. */
export const AMBIENTE_LABEL: Record<AsaasEnvironment, string> = {
  sandbox: 'Sandbox',
  production: 'Produção',
}

/* Como o cartão conectado nomeia o ambiente no <dl>. */
export const AMBIENTE_DESCRICAO: Record<AsaasEnvironment, string> = {
  sandbox: 'Sandbox (conta de teste)',
  production: 'Produção (conta real)',
}

/*
  O estado da conexão como o bloco de Configurações o lê.

  `webhook_token_hash` NÃO ENTRA NO OBJETO, e a diferença é deliberada: a única
  pergunta da tela é "o aviso de pagamento está registrado?", que é "a coluna é
  nula?". O hash não tem uso em tela nenhuma, então ele é consultado e
  descartado dentro do queryFn em vez de ficar no cache do React Query.

  `connected_by_name` é o nome ATUAL de quem ligou, e não uma cópia congelada:
  vem por embed, como o resto do sistema resolve nome de colaborador. Nulo
  quando a pessoa saiu do cadastro — a FK da 0125 é `on delete set null
  (connected_by_id)`.
*/
export type AsaasConnectionState = {
  id: string
  environment: AsaasEnvironment
  asaas_webhook_id: string | null
  connected_at: string
  connected_by_name: string | null
  last_success_at: string | null
  last_error: string | null
  last_error_at: string | null
  webhook_registered: boolean
}

/*
  O nome do relacionamento é o da CONSTRAINT, e não o da tabela: a FK é composta
  (`(connected_by_id, tenant_id)`) e `collaborators(...)` não desambigua sozinho.
  Mesma leitura já feita em features/activities/types.ts.
*/
const CONNECTION_SELECT = `
  id, environment, asaas_webhook_id, connected_at, last_success_at,
  last_error, last_error_at, webhook_token_hash,
  connected_by:collaborators!asaas_connections_connected_by_fkey(id, name)
`

type ConnectionRow = {
  id: string
  environment: AsaasEnvironment
  asaas_webhook_id: string | null
  connected_at: string
  last_success_at: string | null
  last_error: string | null
  last_error_at: string | null
  webhook_token_hash: string | null
  connected_by: { id: string; name: string } | null
}

/*
  `maybeSingle` porque a 0125 garante NO MÁXIMO UMA linha por escritório (a FK
  de tenant é one-to-one). Sem linha é o caso comum hoje: devolve `null`, e
  `null` é o estado "não conectado" da seção 1 do protótipo. Falha de leitura
  é outra coisa, e a tela as distingue — uma convida a colar a chave, a outra
  pede uma recarga.
*/
export function useAsaasConnection() {
  return useQuery({
    queryKey: asaasConnectionKeys.all,
    queryFn: async (): Promise<AsaasConnectionState | null> => {
      const { data, error } = await supabase
        .from('asaas_connections')
        .select(CONNECTION_SELECT)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      const row = data as unknown as ConnectionRow
      return {
        id: row.id,
        environment: row.environment,
        asaas_webhook_id: row.asaas_webhook_id,
        connected_at: row.connected_at,
        connected_by_name: row.connected_by?.name ?? null,
        last_success_at: row.last_success_at,
        last_error: row.last_error,
        last_error_at: row.last_error_at,
        webhook_registered: row.webhook_token_hash !== null,
      }
    },
  })
}

export type AsaasConnectResult = {
  connectionId: string
  environment: AsaasEnvironment
  webhookId: string
  webhookUrl: string
  events: string[]
}

/*
  LIGAR A CONTA.

  O `onSettled` RECARREGA O ESTADO TAMBÉM NO ERRO, e isso não é zelo genérico:
  `asaas_webhook_failed` (502) é a resposta em que a chave FOI guardada e o
  aviso de pagamento NÃO foi registrado. A conexão existe, pela metade, e sem
  este recarregamento o cartão continuaria mostrando o formulário de conectar
  enquanto o escritório já pode emitir cobrança que não baixa sozinha.
*/
export function useConnectAsaas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { apiKey: string; environment: AsaasEnvironment }) => {
      return await invokeEdgeFunction<AsaasConnectResult>('asaas-connect', {
        apiKey: input.apiKey,
        environment: input.environment,
      })
    },
    onSettled: () => {
      void recarregarConexao(queryClient)
    },
  })
}

export type AsaasRenewWebhookResult = {
  environment: AsaasEnvironment
  webhookId: string
  webhookUrl: string
  /* Verdadeiro quando foi preciso criar um webhook novo. */
  webhookCreated: boolean
  /* Verdadeiro quando adotou um que já existia na conta Asaas. */
  webhookAdopted: boolean
  /* Zero é o normal. Mais do que zero é webhook sobrando na conta Asaas,
     entregando aviso com token que o nosso banco não conhece. */
  otherWebhooksWithSameUrl: number
  events: string[]
}

/*
  RELIGAR O AVISO DE PAGAMENTO, sem pedir a chave de novo: ela já está no cofre
  e quem a lê é a função. Nenhum parâmetro, por isso.

  Mesmo `onSettled` do conectar, e pelo mesmo motivo: há caminhos de erro em que
  o aviso mudou de um lado e não do outro, e o que a tela precisa fazer depois
  de qualquer desfecho é reler o estado.
*/
export function useRenewAsaasWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return await invokeEdgeFunction<AsaasRenewWebhookResult>('asaas-renew-webhook', {})
    },
    onSettled: () => {
      void recarregarConexao(queryClient)
    },
  })
}

export type AsaasDisconnectResult = {
  disconnected: boolean
  alreadyDisconnected: boolean
  /*
    FALSO AQUI É A ÚNICA NOTÍCIA de que sobrou um webhook na conta Asaas: a linha
    que guardaria o erro acabou de ser apagada, então não existe `last_error`
    para ler depois. A tela diz isso na hora ou não diz nunca.
  */
  webhookRemoved: boolean
  /* Nulo quando não havia nada para desligar (segundo clique, duas abas). */
  webhookId: string | null
}

export function useDisconnectAsaas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return await invokeEdgeFunction<AsaasDisconnectResult>('asaas-disconnect', {})
    },
    onSettled: () => {
      void recarregarConexao(queryClient)
    },
  })
}

/*
  A MENSAGEM DE ERRO DAS TRÊS FUNÇÕES JÁ VEM PRONTA PARA SER LIDA.

  `code` e `message` são escritos à mão em supabase/functions/_shared/http.ts, e
  a `message` de cada recusa do Asaas já diz o que fazer ("confira o ambiente",
  "tente de novo em instantes"). Reescrevê-la aqui criaria uma segunda verdade
  para desalinhar quando a função mudar. Mesmo raciocínio de
  `descreverErroAcessarComo` em features/impersonation/hooks.ts.
*/
export function descreverErroDaConexaoAsaas(error: unknown): string {
  if (error instanceof EdgeFunctionError) return error.message
  if (error instanceof Error) return error.message
  return 'Não foi possível concluir a operação. Tente novamente.'
}

/*
  AS DUAS CHAVES, E POR QUE UMA NÃO PUXA A OUTRA.

  `asaasConnectionKeys.all` é `['asaas', 'connection']` e carrega a linha inteira
  da conexão, que é o que esta tela mostra. `asaasKeys.connectionStatus()` é
  `['asaas', 'connection-status']` e carrega os dois campos que a tela de Contas
  a Receber consegue ler (0129): o ambiente e se o aviso de pagamento está de pé.

  O React Query casa chave por ELEMENTO do array, não por prefixo de texto:
  invalidar `['asaas', 'connection']` NÃO alcança `['asaas', 'connection-status']`,
  porque 'connection' e 'connection-status' são elementos diferentes. São irmãs,
  e não mãe e filha.

  O QUE QUEBRARIA SEM ISTO: alguém registra o aviso aqui, volta para Contas a
  Receber, e o painel da cobrança continua mostrando a tarja âmbar dizendo que a
  parcela não vai baixar sozinha. O conserto teria funcionado e a tela
  continuaria acusando o problema.
*/
function recarregarConexao(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: asaasConnectionKeys.all })
  void queryClient.invalidateQueries({ queryKey: asaasKeys.connectionStatus() })
}
