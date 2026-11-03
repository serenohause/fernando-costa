/*
  asaas-renew-webhook — religa o aviso de pagamento sem pedir a chave de novo.

  O ESTADO QUE ESTA FUNÇÃO EXISTE PARA CONSERTAR, e por que ele é caro.

  Enquanto a conexão existe e o aviso não funciona, o escritório está no pior
  estado deste módulo: a cobrança sai, o cliente paga, e a parcela fica aberta.
  Ninguém percebe pelo sistema — percebe pelo cliente ligando para reclamar de
  uma segunda cobrança. A 0125 já escreve isso no comentário de
  `webhook_token_hash`, e `asaas-charge` devolve `webhookRegistered: false` para
  a tela poder avisar na hora da emissão. O que não existia era a saída.

  SÃO QUATRO CAMINHOS PARA CHEGAR NESSE ESTADO, e todos são reais:

    1. `asaas-connect` guardou a chave e o Asaas recusou registrar o webhook
       (502 de lá). A chave está no cofre, o aviso não existe.
    2. A fila foi INTERROMPIDA por acúmulo de falha. Com `SEQUENTIALLY` o Asaas
       para a fila em vez de pular aviso (ver `corpoDoWebhook`), e nada do nosso
       lado religa isso sozinho.
    3. Alguém apagou ou desligou o webhook no painel do Asaas, para
       investigar, e não religou.
    4. A URL pública mudou e o webhook velho aponta para um endereço que não
       responde mais.

  ANTES DESTA FUNÇÃO A ÚNICA SAÍDA ERA DESCONECTAR E CONECTAR DE NOVO, o que
  obriga a buscar a API Key no painel do Asaas e colar outra vez. Pedir a
  credencial do caixa do escritório para consertar algo que não tem nada a ver
  com ela é o tipo de passo que leva alguém a copiar a chave para um bloco de
  notas — e aí ela vive em dois lugares. A chave já está no Vault; esta função
  a lê por `asaas_api_key` (0128), que é `security definer` com EXECUTE apenas
  para `service_role`.

  A ORDEM DOS PASSOS, E O QUE CADA UM PROTEGE:

    1. Autorização no banco, como em `asaas-connect`: quem EDITA
       Configurações. Não é reescrita aqui.
    2. A conexão. Sem conexão não há o que renovar, e a resposta manda ligar a
       conta — é outra tela, outro fluxo.
    3. Configuração (base e URL do aviso) ANTES de qualquer efeito, pelo mesmo
       motivo de `asaas-connect`: descobrir que falta configuração depois de
       trocar o token no Asaas deixaria o aviso pior do que estava.
    4. O token NOVO, e o efeito no Asaas: alterar o webhook que existe
       (`PUT`), ou criar um (`POST`) quando não existe id ou quando o id não
       existe mais do lado deles.
    5. `asaas_set_webhook`, que guarda o id e o SHA-256 do token.
    6. `asaas_record_result`, com nulo no sucesso e a mensagem na falha.

  O TOKEN É SEMPRE NOVO, E NÃO POR ESCOLHA. Nenhum dos dois lados sabe o token
  antigo: o nosso banco guarda só o hash (0128) e a API do Asaas devolve apenas
  `hasAuthToken` depois da criação. Renovar o aviso é obrigatoriamente trocar o
  token. Ver `corpoDaRenovacaoDoWebhook` em `_shared/asaas.ts`.

  POR QUE ALTERAR EM VEZ DE CRIAR OUTRO. Uma conta Asaas aceita 10 webhooks. Um
  por clique encheria a cota com webhooks apontando todos para a nossa URL, os
  antigos entregando com token que o nosso banco já não conhece — ou seja,
  gerando exatamente o acúmulo de falha que interrompe a fila, que é o problema
  que esta função conserta.

  O QUE ESTA FUNÇÃO NÃO FAZ: não toca na chave (nem lê para fora, nem grava,
  nem troca), não muda o ambiente da conexão e não mexe em cobrança nenhuma. O
  ambiente é da conexão, e trocar de ambiente limpa o webhook de propósito
  (0128) — quem troca passa por `asaas-connect`.
*/

import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'
import {
  baseDoAsaas,
  corpoDaRenovacaoDoWebhook,
  corpoDoWebhook,
  EVENTOS_ASSINADOS,
  SEGREDO_BASE_PRODUCAO,
  tokenDoWebhook,
  urlDoWebhook,
  webhooksComNossaUrl,
} from '../_shared/asaas.ts'
import {
  alterarWebhook,
  criarWebhook,
  listarWebhooks,
  removerWebhook,
} from '../_shared/asaas-api.ts'

const FN = 'asaas-renew-webhook'

const lerSegredo = (nome: string) => Deno.env.get(nome)

type Admin = ReturnType<typeof serviceClient>

/* Não há corpo: a função não recebe parâmetro nenhum. O escritório vem da
   autorização e o resto vem da conexão que já está gravada. Corpo ignorado em
   vez de recusado porque `fetch` com `POST` e sem body é o que o cliente HTTP
   do frontend manda, e um schema aqui só criaria um 400 novo sem nada para
   validar. */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    /* PASSO 1: quem pode. Mesma pergunta de `asaas-connect`, pela mesma função
       do banco, e é também daqui que sai o escritório — o tenant nunca vem do
       corpo da requisição. */
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
        'É preciso permissão de edição em Configurações para registrar o aviso de pagamento.',
      )
    }

    const tenantId = (autorizado as { tenant_id: string }).tenant_id

    /* PASSO 2: a conexão. O ambiente dela decide a base, e o id do webhook
       decide entre alterar e criar. */
    const { data: conexao, error: conexaoError } = await admin
      .from('asaas_connections')
      .select('environment, asaas_webhook_id')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (conexaoError) {
      console.error(`[${FN}] falha ao ler conexao: ${conexaoError.code} ${conexaoError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível consultar a integração.')
    }
    if (!conexao) {
      throw new HttpError(
        409,
        'asaas_not_connected',
        'A conta Asaas do escritório não está ligada. Ligue a conta antes de registrar o aviso de pagamento.',
      )
    }

    const environment = conexao.environment as 'sandbox' | 'production'
    const webhookIdAtual = (conexao.asaas_webhook_id as string | null) ?? null

    /* PASSO 3: configuração antes de efeito. */
    let base: string
    let urlDoAviso: string
    try {
      base = baseDoAsaas(environment, lerSegredo)
      urlDoAviso = urlDoWebhook(lerSegredo)
    } catch (falha) {
      const codigo = falha instanceof Error ? falha.message : 'desconhecido'
      console.error(`[${FN}] configuracao ausente: ${codigo}`)

      if (codigo === 'asaas_base_producao_invalida') {
        throw new HttpError(
          503,
          'asaas_production_not_configured',
          `O endereço da API de produção do Asaas está configurado de um jeito que não aceitamos neste ambiente (segredo ${SEGREDO_BASE_PRODUCAO}).`,
        )
      }
      throw new HttpError(
        503,
        'asaas_webhook_url_missing',
        'O endereço público do aviso do Asaas não está configurado neste ambiente.',
      )
    }

    /* A chave sai do cofre e NÃO sai desta função: vai no cabeçalho
       `access_token` de `_shared/asaas-api.ts` e não aparece em log, em
       resposta nem em mensagem de erro. */
    const { data: apiKey, error: chaveError } = await admin.rpc('asaas_api_key', {
      p_tenant_id: tenantId,
    })

    if (chaveError) {
      console.error(`[${FN}] falha ao ler a chave: ${chaveError.code} ${chaveError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível acessar a integração.')
    }
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      /*
        Conexão existe e o cofre não devolve chave. É o estado que `asaas_connect`
        não produz, então chegar aqui significa que alguém mexeu no Vault por
        fora. Reconectar é a saída, e é a única que recoloca a chave.
      */
      console.error(`[${FN}] conexao sem chave no cofre`)
      throw new HttpError(
        409,
        'asaas_key_missing',
        'A credencial do Asaas não está mais guardada neste escritório. Reconecte a conta informando a API Key de novo.',
      )
    }

    /*
      PASSO 4: o token novo, e o efeito do lado deles.

      SÃO TRÊS DEGRAUS, E O DO MEIO NÃO É ZELO — É OBRIGAÇÃO. Medido no sandbox
      em 03/11/2026: o `POST /v3/webhooks` recusa criar um segundo webhook com a
      mesma url e os mesmos eventos ("Já existe uma configuração para os eventos
      com os mesmos atributos"). Sem o degrau 2, um id errado no nosso banco
      produzia um estado que NENHUM clique conserta: alterar falha com 404 e
      criar falha com 400.

        1. ALTERAR o id que o banco guarda. Caminho normal.
        2. Se não há id, ou o id respondeu 404, PROCURAR pela nossa url e adotar
           o que está lá. Conserta id errado, id perdido, e a conexão que ficou
           pela metade porque `asaas-connect` registrou o webhook e não
           conseguiu guardar o id.
        3. Só então CRIAR. É o caminho de quem apagou o webhook no painel.
    */
    const token = tokenDoWebhook()
    const corpoDaRenovacao = corpoDaRenovacaoDoWebhook({ url: urlDoAviso, authToken: token })

    let webhookId = webhookIdAtual
    let criadoAgora = false
    let adotado = false
    let outrosComNossaUrl = 0

    if (webhookId !== null) {
      const alterado = await alterarWebhook(base, apiKey, webhookId, corpoDaRenovacao)

      if (!alterado.ok) {
        if (alterado.status === 401) {
          await registrarResultado(admin, tenantId, `webhook: ${alterado.erro ?? 'chave recusada'}`)
          throw new HttpError(
            401,
            'asaas_invalid_api_key',
            'O Asaas recusou a API Key do escritório. Reconecte a conta informando a chave de novo.',
          )
        }

        if (alterado.status !== 404) {
          await registrarResultado(admin, tenantId, `webhook: ${alterado.erro ?? 'falha ao alterar'}`)
          throw new HttpError(
            502,
            'asaas_webhook_failed',
            'O Asaas não aceitou religar o aviso de pagamento agora. Tente de novo em instantes.',
          )
        }

        /*
          404: o webhook que o banco guarda não existe mais, ou não é desta
          conta (a doc nomeia os dois casos). Os dois são reais — alguém apagou
          no painel, ou a chave passou a ser de outra conta Asaas. O id velho é
          abandonado de propósito: remover um id que acabou de responder 404 não
          tem sentido.
        */
        console.error(`[${FN}] webhook ${webhookId} nao existe mais no Asaas`)
        webhookId = null
      }
    }

    if (webhookId === null) {
      /* DEGRAU 2: procurar pela nossa url antes de tentar criar. */
      const listagem = await listarWebhooks(base, apiKey)

      if (!listagem.ok) {
        if (listagem.status === 401) {
          await registrarResultado(admin, tenantId, `webhook: ${listagem.erro ?? 'chave recusada'}`)
          throw new HttpError(
            401,
            'asaas_invalid_api_key',
            'O Asaas recusou a API Key do escritório. Reconecte a conta informando a chave de novo.',
          )
        }
        /*
          NÃO SEGUE PARA CRIAR SEM TER OLHADO. Criar às cegas bate no 400 de
          duplicidade quando o webhook existe, e a mensagem dele ("Já existe uma
          configuração...") não diz a ninguém o que fazer. Falhar aqui pede o
          clique de novo, que é a ação certa.
        */
        await registrarResultado(admin, tenantId, `webhook: ${listagem.erro ?? 'falha ao listar'}`)
        throw new HttpError(
          502,
          'asaas_webhook_failed',
          'O Asaas não respondeu a consulta dos avisos agora. Tente de novo em instantes.',
        )
      }

      const nossos = webhooksComNossaUrl(listagem.json, urlDoAviso)

      if (nossos.length > 0) {
        /*
          ADOTA O PRIMEIRO. Mais de um com a nossa url é estado que alguém
          precisa limpar no painel — cada extra entrega o mesmo aviso com um
          token que o nosso banco não conhece, ou seja, 401 por entrega. Mas
          recusar aqui deixaria o escritório sem aviso nenhum por causa de um
          problema que o aviso adotado já resolve. Adota, conta e devolve a
          contagem para a tela poder dizer.
        */
        webhookId = nossos[0]
        outrosComNossaUrl = nossos.length - 1

        if (outrosComNossaUrl > 0) {
          console.error(`[${FN}] ${nossos.length} webhooks com a nossa url na conta Asaas`)
        }

        const adotadoRes = await alterarWebhook(base, apiKey, webhookId, corpoDaRenovacao)

        if (!adotadoRes.ok) {
          await registrarResultado(
            admin,
            tenantId,
            `webhook: ${adotadoRes.erro ?? 'falha ao adotar o aviso que ja existia'}`,
          )
          throw new HttpError(
            502,
            'asaas_webhook_failed',
            'O Asaas não aceitou religar o aviso de pagamento agora. Tente de novo em instantes.',
          )
        }

        adotado = true
      }
    }

    if (webhookId === null) {
      /* DEGRAU 3: não há nada com a nossa url. Cria. */
      /*
        `email` é obrigatório no POST de webhook (e não existe no PUT, por isso
        só aparece neste ramo). É o endereço que o Asaas avisa quando a fila é
        interrompida: vai o de quem clicou, que é alguém com permissão de editar
        Configurações naquele escritório. Mesma escolha de `asaas-connect`.
      */
      const email = (user.email ?? '').trim()
      if (email === '') {
        throw new HttpError(
          409,
          'user_without_email',
          'Sua conta não tem e-mail, e o Asaas exige um endereço para avisar quando os avisos de pagamento falharem.',
        )
      }

      const criado = await criarWebhook(
        base,
        apiKey,
        corpoDoWebhook({ url: urlDoAviso, authToken: token, email }),
      )

      if (!criado.ok) {
        await registrarResultado(admin, tenantId, `webhook: ${criado.erro ?? 'falha ao criar'}`)

        if (criado.status === 401) {
          throw new HttpError(
            401,
            'asaas_invalid_api_key',
            'O Asaas recusou a API Key do escritório. Reconecte a conta informando a chave de novo.',
          )
        }
        throw new HttpError(
          502,
          'asaas_webhook_failed',
          'O Asaas não aceitou registrar o aviso de pagamento. Sem ele a parcela não baixa sozinha: tente de novo em instantes.',
        )
      }

      webhookId = idDoWebhook(criado.json)
      if (webhookId === null) {
        /* Mesmo raciocínio de `asaas-connect`: webhook vivo do lado deles e sem
           id do nosso é webhook que não dá para alterar nem remover depois.
           Falha alto em vez de gravar meia verdade. */
        console.error(`[${FN}] resposta de criacao de webhook sem id`)
        await registrarResultado(admin, tenantId, 'webhook: resposta sem id')
        throw new HttpError(
          502,
          'asaas_webhook_failed',
          'O Asaas registrou o aviso mas não devolveu o identificador dele. Verifique os webhooks na conta Asaas do escritório antes de tentar de novo.',
        )
      }

      criadoAgora = true
    }

    /* PASSO 5: o id e o HASH. O token em texto morre aqui. */
    const { data: guardado, error: setError } = await admin.rpc('asaas_set_webhook', {
      p_tenant_id: tenantId,
      p_webhook_id: webhookId,
      p_token: token,
    })

    if (setError || guardado !== true) {
      const detalhe = setError ? `${setError.code} ${setError.message}` : 'sem conexao para gravar'

      if (criadoAgora) {
        /*
          Webhook NASCEU nesta requisição e o hash não ficou guardado: desfaz,
          igual ao rollback de `asaas-connect`. Sem isso sobra no Asaas um
          webhook ativo com token que o nosso banco não conhece, e todo aviso
          dele viraria 401 em `asaas_resolve_webhook_token` até a fila ser
          interrompida por acúmulo de falha.
        */
        const removido = await removerWebhook(base, apiKey, webhookId)
        console.error(`[${FN}] asaas_set_webhook falhou: ${detalhe} (webhook removido: ${removido})`)
        await registrarResultado(
          admin,
          tenantId,
          `webhook criado e nao guardado${removido ? ' (removido no Asaas)' : ' (CONFIRA os webhooks na conta Asaas)'}`,
        )
      } else {
        /*
          AQUI NÃO HÁ ROLLBACK POSSÍVEL, e isso precisa estar escrito.

          O webhook do Asaas já está com o token NOVO, e o nosso banco ficou com
          o hash do ANTIGO. Nenhum aviso vai autenticar até alguém renovar de
          novo. Não dá para voltar atrás porque o token antigo não existe em
          lugar nenhum: o banco guarda só o hash e a API do Asaas não devolve o
          valor.

          Por que mesmo assim esta ordem é a certa: o estado em que ela falha é
          RECUPERÁVEL pelo mesmo botão, e a ordem contrária (gravar o hash antes
          de o Asaas aceitar) estragaria o aviso de um escritório toda vez que a
          chamada ao Asaas falhasse — inclusive quando ela falhasse por chave
          recusada, caso em que nada do lado deles mudou.

          `last_error` é o que faz isso aparecer na tela de Configurações, e a
          mensagem diz a ação, não o diagnóstico.
        */
        console.error(`[${FN}] asaas_set_webhook falhou depois de alterar o webhook: ${detalhe}`)
        await registrarResultado(
          admin,
          tenantId,
          'aviso de pagamento alterado no Asaas e nao guardado aqui: registre o aviso de novo',
        )
      }

      throw new HttpError(
        500,
        'internal_error',
        'O aviso de pagamento não ficou registrado. Tente de novo em instantes.',
      )
    }

    /* PASSO 6: carimba `last_success_at` e LIMPA o erro anterior, que é o que
       apaga a faixa vermelha da tela de Configurações. */
    await registrarResultado(admin, tenantId, null)

    return jsonResponse(req, {
      environment,
      webhookId,
      webhookUrl: urlDoAviso,
      webhookCreated: criadoAgora,
      /* Verdadeiro quando o aviso que passou a valer já existia na conta Asaas
         e o nosso banco não sabia o id dele. A tela não precisa disso para
         funcionar; serve para quem for investigar depois. */
      webhookAdopted: adotado,
      /* Quantos OUTROS webhooks da conta apontam para a nossa url. Zero é o
         normal. Mais do que zero é aviso duplicado chegando com token que o
         nosso banco não conhece, ou seja, 401 por entrega: alguém precisa
         limpar no painel do Asaas. */
      otherWebhooksWithSameUrl: outrosComNossaUrl,
      events: [...EVENTOS_ASSINADOS],
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

/*
  `asaas_record_result` é diagnóstico, e falha dele não pode derrubar o fluxo que
  ela descreve — mesmo raciocínio de `asaas-connect` e `asaas-charge`.
*/
async function registrarResultado(
  admin: Admin,
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

/* O id do webhook na resposta de criação. `hasAuthToken` é ignorado de
   propósito: o token é nosso, não precisamos que eles confirmem. */
function idDoWebhook(json: unknown): string | null {
  const id = (json as { id?: unknown })?.id
  if (typeof id !== 'string') return null
  const limpo = id.trim()
  return limpo === '' ? null : limpo
}
