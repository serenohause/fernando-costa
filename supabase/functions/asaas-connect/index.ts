/*
  asaas-connect — liga a conta Asaas do escritório e registra o webhook.

  POR QUE EDGE FUNCTION, E NÃO A TELA
  A API Key do Asaas emite cobrança, consulta extrato e movimenta saldo: quem a
  tem, tem o caixa do escritório (0125). Ela vai para o Vault por
  `asaas_connect`, que é `security definer` com EXECUTE apenas para
  `service_role` (0128) — ou seja, a chave só pode entrar por aqui, e
  `authenticated` não tem caminho nenhum até ela, nem para gravar nem para ler.

  A AUTORIZAÇÃO NÃO É DECIDIDA NESTE ARQUIVO. `asaas_connect` confere por
  dentro `collaborator_can_edit_menu(p_user_id, 'settings')` FILTRADO pelo
  tenant recebido, e levanta 42501 com `not_authorized` para quem não pode. O
  que esta função faz com isso é traduzir em HTTP 403. O mesmo desenho de
  `google-calendar-start`, e pelo mesmo motivo: a autorização mora no banco
  porque aqui não há JWT do lado do Postgres (falamos como `service_role`), e
  reescrevê-la em TypeScript criaria uma segunda cópia da regra para
  desalinhar.

  A CHAMADA AO BANCO QUE DESCOBRE O ESCRITÓRIO NÃO É UMA SEGUNDA CÓPIA DA
  AUTORIZAÇÃO. `asaas_connect` recebe o tenant por parâmetro, então alguém tem
  de dizer qual é — e quem diz é o próprio banco, pela mesma função que decide,
  exatamente como `google-calendar-disconnect` e `google-calendar-list` fazem. A
  autoridade final continua sendo `asaas_connect`, que confere de novo depois,
  porque entre esta leitura e aquela escrita o mundo pode mudar.

  A ORDEM DOS QUATRO PASSOS É O CONTRATO, e cada um está onde está por um
  motivo:

    1. `asaas_connect` PRIMEIRO, porque é quem autoriza. Quem não pode conectar
       não tem direito nem a saber se a chave que mandou era aceita — e, mais
       concreto, não tem direito a fazer o sistema bater na API do Asaas com uma
       chave que ele trouxe. Recusa do banco para o fluxo aqui.
    2. O webhook no Asaas, com o token gerado AGORA.
    3. `asaas_set_webhook`, que guarda o id do webhook e o SHA-256 do token.
    4. `asaas_record_result`, com nulo no sucesso e a mensagem na falha.

  NÃO HÁ VALIDAÇÃO DE CHAVE SEPARADA, e isso é de propósito: a criação do
  webhook É a validação. Chave errada volta 401 do Asaas no passo 2, com a
  conexão já gravada e `last_error` carimbado no passo 4 — que é o estado que a
  tela de Configurações sabe mostrar. Uma chamada a mais só para "testar a
  chave" dobraria a superfície sem dizer nada novo.

  O TOKEN NÃO VOLTA NA RESPOSTA E NÃO VAI PARA LOG. Ele existe em memória por
  uma requisição, viaja para o Asaas no corpo do POST e sobrevive aqui só como
  hash, dentro do banco. Ver o cabeçalho de `_shared/asaas.ts` para por que a
  aleatoriedade dele é a condição de uma decisão da 0128.
*/

import { z } from 'npm:zod@4.6.7'
import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'
import {
  baseDoAsaas,
  corpoDoWebhook,
  EVENTOS_ASSINADOS,
  SEGREDO_BASE_PRODUCAO,
  tokenDoWebhook,
  urlDoWebhook,
} from '../_shared/asaas.ts'
import { criarWebhook, removerWebhook } from '../_shared/asaas-api.ts'

const FN = 'asaas-connect'

const lerSegredo = (nome: string) => Deno.env.get(nome)

/*
  A chave do Asaas é longa (o padrão atual passa de 150 caracteres) e o formato
  não é prometido em lugar nenhum da doc — então o schema não tenta adivinhar
  prefixo. O que ele faz é recusar vazio (que `asaas_connect` também recusa, com
  22023) e tamanho absurdo, antes de a chave ocupar transação no banco.

  `.trim()` porque chave colada do painel do Asaas vem com espaço na ponta mais
  vezes do que não vem, e espaço na ponta produz 401 na primeira emissão — erro
  que parece chave inválida e é só o recorte do copiar e colar.
*/
const BodySchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
  environment: z.enum(['sandbox', 'production']),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const parsed = BodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(
        400,
        'invalid_body',
        'Informe a API Key do Asaas e o ambiente (sandbox ou produção).',
      )
    }
    const { apiKey, environment } = parsed.data

    /*
      AS DUAS CONFIGURAÇÕES SÃO CONFERIDAS ANTES DE QUALQUER ESCRITA.

      Sem a URL do webhook, ou sem a base de produção quando o ambiente é
      produção, este fluxo não tem como terminar. Descobrir isso depois de a
      chave já estar no Vault deixaria o escritório com uma conexão ligada e
      nenhum aviso chegando — o estado mais caro deste módulo, porque o cliente
      paga e a parcela fica aberta.
    */
    let base: string
    let urlDoAviso: string
    try {
      base = baseDoAsaas(environment, lerSegredo)
      urlDoAviso = urlDoWebhook(lerSegredo)
    } catch (falha) {
      const codigo = falha instanceof Error ? falha.message : 'desconhecido'
      console.error(`[${FN}] configuracao ausente: ${codigo}`)

      if (codigo === 'asaas_base_producao_ausente' || codigo === 'asaas_base_producao_invalida') {
        throw new HttpError(
          503,
          'asaas_production_not_configured',
          `O endereço da API de produção do Asaas não está configurado neste ambiente (segredo ${SEGREDO_BASE_PRODUCAO}). Conecte em sandbox ou peça a configuração antes de ligar a conta de produção.`,
        )
      }
      throw new HttpError(
        503,
        'asaas_webhook_url_missing',
        'O endereço público do aviso do Asaas não está configurado neste ambiente.',
      )
    }

    /*
      `email` é obrigatório no POST de webhook e é o endereço que o Asaas usa
      para avisar que a FILA DE AVISOS foi interrompida. Vai o e-mail de quem
      está conectando: é alguém com permissão de editar Configurações naquele
      escritório, ou seja, exatamente quem religa a integração. Login sem
      e-mail não existe neste sistema (o e-mail É o login,
      `create-collaborator-login`), então a recusa abaixo é defesa, não fluxo.
    */
    const email = (user.email ?? '').trim()
    if (email === '') {
      throw new HttpError(
        409,
        'user_without_email',
        'Sua conta não tem e-mail, e o Asaas exige um endereço para avisar quando os avisos de pagamento falharem.',
      )
    }

    const { data: autorizado, error: authError } = await admin
      .rpc('collaborator_can_edit_menu', { p_user_id: user.id, p_menu_key: 'settings' })
      .maybeSingle()

    if (authError) {
      console.error(`[${FN}] falha ao verificar permissao: ${authError.code} ${authError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível verificar a permissão.')
    }
    if (!autorizado) {
      throw new HttpError(
        403,
        'forbidden',
        'É preciso permissão de edição em Configurações para conectar a conta Asaas.',
      )
    }

    const tenantId = (autorizado as { tenant_id: string }).tenant_id

    /* PASSO 1: quem autoriza. */
    const { data: connectionId, error: connectError } = await admin.rpc('asaas_connect', {
      p_tenant_id: tenantId,
      p_user_id: user.id,
      p_api_key: apiKey,
      p_environment: environment,
    })

    if (connectError) {
      if (connectError.code === '42501') {
        throw new HttpError(
          403,
          'forbidden',
          'É preciso permissão de edição em Configurações para conectar a conta Asaas.',
        )
      }
      if (connectError.code === '22023') {
        throw new HttpError(
          400,
          'invalid_api_key',
          'A API Key do Asaas veio em branco. Ela fica em Integrações > API Key, na conta Asaas do escritório.',
        )
      }
      console.error(`[${FN}] asaas_connect falhou: ${connectError.code} ${connectError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível ligar a conta agora.')
    }

    /*
      PASSO 2: o webhook, com o token nascendo aqui.

      O token é gerado DEPOIS da autorização e ANTES da chamada ao Asaas, e não
      é guardado em variável de módulo nem passado para log em nenhum ramo
      abaixo. Ver `tokenDoWebhook` em `_shared/asaas.ts`: a entropia dele é o
      que sustenta a decisão da 0128 de deixar o hash legível na tela de
      Configurações.
    */
    const token = tokenDoWebhook()

    const criado = await criarWebhook(
      base,
      apiKey,
      corpoDoWebhook({ url: urlDoAviso, authToken: token, email }),
    )

    if (!criado.ok) {
      /* PASSO 4 na falha: é por `last_error` que o escritório descobre. */
      await registrarResultado(admin, tenantId, `webhook: ${criado.erro ?? 'falha desconhecida'}`)

      if (criado.status === 401) {
        throw new HttpError(
          401,
          'asaas_invalid_api_key',
          'O Asaas recusou a API Key. Confira se ela é do ambiente escolhido e se foi copiada inteira.',
        )
      }
      throw new HttpError(
        502,
        'asaas_webhook_failed',
        'A chave foi guardada, mas o Asaas não aceitou registrar o aviso de pagamento. Sem ele a parcela não baixa sozinha: tente conectar de novo em instantes.',
      )
    }

    const webhookId = idDoWebhook(criado.json)
    if (webhookId === null) {
      /*
        O webhook existe do lado do Asaas e não sabemos o id dele, então não há
        como alterar nem remover depois — e a 0125 avisa o que isso custa:
        webhook velho vivo apontando para uma URL que talvez não exista mais, e
        o Asaas desativando por acúmulo de falha. Falha alto em vez de gravar
        meia verdade.
      */
      console.error(`[${FN}] resposta de criacao de webhook sem id`)
      await registrarResultado(admin, tenantId, 'webhook: resposta sem id')
      throw new HttpError(
        502,
        'asaas_webhook_failed',
        'O Asaas registrou o aviso mas não devolveu o identificador dele. Verifique os webhooks na conta Asaas do escritório antes de tentar de novo.',
      )
    }

    /* PASSO 3: o id e o HASH do token. O token em texto morre aqui. */
    const { data: guardado, error: setError } = await admin.rpc('asaas_set_webhook', {
      p_tenant_id: tenantId,
      p_webhook_id: webhookId,
      p_token: token,
    })

    if (setError || guardado !== true) {
      /*
        DESFAZER O QUE ESTA REQUISIÇÃO CRIOU, mesmo cuidado do rollback de
        `create-collaborator-login`. Sem isso sobra no Asaas um webhook ativo
        apontando para a nossa URL com um token que o nosso banco não conhece:
        todo aviso dele seria recusado com 401 por
        `asaas_resolve_webhook_token`, a fila do escritório seria interrompida
        por acúmulo de falha, e ninguém saberia de onde veio.

        Melhor esforço: se a remoção falhar, a recusa abaixo acontece do mesmo
        jeito, e `last_error` fica com o rastro.
      */
      const removido = await removerWebhook(base, apiKey, webhookId)
      const detalhe = setError ? `${setError.code} ${setError.message}` : 'sem conexao para gravar'
      console.error(`[${FN}] asaas_set_webhook falhou: ${detalhe} (webhook removido: ${removido})`)

      await registrarResultado(
        admin,
        tenantId,
        `webhook registrado e nao guardado${removido ? ' (removido no Asaas)' : ' (CONFIRA os webhooks na conta Asaas)'}`,
      )

      throw new HttpError(
        500,
        'internal_error',
        'Não foi possível concluir a ligação com o Asaas. Tente de novo em instantes.',
      )
    }

    /* PASSO 4 no sucesso: carimba `last_success_at` e LIMPA o erro anterior. */
    await registrarResultado(admin, tenantId, null)

    return jsonResponse(req, {
      connectionId: connectionId as string,
      environment,
      webhookId,
      webhookUrl: urlDoAviso,
      events: [...EVENTOS_ASSINADOS],
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

/*
  `asaas_record_result` é diagnóstico, e falha dele não pode derrubar o fluxo
  que ela descreve: numa falha de rede, deixar de responder porque o registro do
  erro também falhou troca uma mensagem ruim por nenhuma.
*/
async function registrarResultado(
  admin: ReturnType<typeof serviceClient>,
  tenantId: string,
  erro: string | null,
): Promise<void> {
  const { error } = await admin.rpc('asaas_record_result', {
    p_tenant_id: tenantId,
    p_error: erro,
  })
  if (error) {
    console.error(`[${FN}] asaas_record_result falhou: ${error.code} ${error.message}`)
  }
}

/* O id do webhook na resposta de criação. A doc mostra `id` no objeto de
   retorno; nada além disso é lido daqui, e `hasAuthToken` é deliberadamente
   ignorado — o token é nosso, não precisamos que eles confirmem. */
function idDoWebhook(json: unknown): string | null {
  const id = (json as { id?: unknown })?.id
  if (typeof id !== 'string') return null
  const limpo = id.trim()
  return limpo === '' ? null : limpo
}
