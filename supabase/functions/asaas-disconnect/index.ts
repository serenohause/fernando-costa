/*
  asaas-disconnect — desliga a conta Asaas do escritório.

  A ORDEM É O CONTRATO, E A 0128 ESCREVE DE QUEM É CADA PARTE: "remover o
  webhook do lado do Asaas é da Edge Function, ANTES desta chamada, porque o
  asaas_webhook_id morre com a linha". Então:

    1. autorizar (quem EDITA Configurações, perguntado ao banco);
    2. ler a conexão, que é a última chance de saber o id do webhook;
    3. ler a chave do cofre, que é a última chance de poder falar com o Asaas;
    4. remover o webhook no Asaas, MELHOR ESFORÇO;
    5. `asaas_disconnect`, que apaga a linha E o segredo do Vault.

  POR QUE O PASSO 4 NÃO PODE TRAVAR O PASSO 5. Quem desconecta pode estar
  desconectando justamente porque a chave vazou, e nesse caso falhar por "não
  consegui falar com o Asaas" seria manter viva a credencial que a pessoa está
  tentando queimar. Então a remoção é melhor esforço, igual à revogação do
  refresh_token do Google (`_shared/google.ts`), e a desconexão acontece de
  qualquer forma.

  O QUE SOBRA QUANDO O PASSO 4 FALHA, e por que a tela PRECISA saber: fica no
  Asaas um webhook ativo apontando para a nossa URL pública. O nosso banco já
  não tem a linha, então `asaas_resolve_webhook_token` não casa com nada e todo
  aviso dele vira 401 sem gravar nada. Não há risco de baixa indevida; o que há
  é a fila daquele escritório sendo interrompida por acúmulo de falha, e o Asaas
  mandando e-mail sobre isso para alguém que já desligou a integração.

  E ESSE AVISO SÓ CABE NA RESPOSTA. `last_error` é o canal que o resto do módulo
  usa para contar falha à tela de Configurações, e aqui ele não existe mais: a
  linha que o guardava é exatamente a que acabou de ser apagada. Por isso
  `webhookRemoved` sai no corpo, e é a única forma de alguém ficar sabendo.

  DESCONECTAR NÃO APAGA COBRANÇA NEM ESPELHO DE CLIENTE. É decisão da 0128, com
  o raciocínio inteiro no comentário dela: cobrança emitida existe no Asaas
  independente da nossa conexão, e apagar o espelho faria o sistema esquecer que
  já criou aquele cliente lá, criando um segundo `cus_` na reconexão.
*/

import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'
import { baseDoAsaas } from '../_shared/asaas.ts'
import { removerWebhook } from '../_shared/asaas-api.ts'

const FN = 'asaas-disconnect'

const lerSegredo = (nome: string) => Deno.env.get(nome)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    /*
      PASSO 1. A pergunta vai ao banco, e é a mesma de `asaas-connect`:
      desligar a cobrança de um escritório é tão grave quanto ligar (0128).
      `asaas_disconnect` confere de novo por dentro, porque entre esta leitura e
      aquela escrita o mundo pode mudar — mas a conferência aqui vem ANTES de
      remover o webhook, e é isso que impede que uma recusa do banco deixe o
      escritório conectado e sem aviso.
    */
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
        'É preciso permissão de edição em Configurações para desligar a conta Asaas.',
      )
    }

    const tenantId = (autorizado as { tenant_id: string }).tenant_id

    /* PASSO 2: a última chance de saber o id do webhook. */
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
      /*
        200, E NÃO ERRO. Segundo clique no botão, ou duas abas abertas, chegam
        aqui — e "não havia nada para desligar" é o resultado que a pessoa
        queria. Mesmo raciocínio do `alreadyExisted` de `asaas-charge`: recusar
        faria a tela mostrar falha para uma situação em que tudo está certo.
      */
      return jsonResponse(req, {
        disconnected: false,
        alreadyDisconnected: true,
        webhookRemoved: true,
        /* Nulo, e não ausente: a resposta tem a mesma forma nos dois caminhos,
           e quem consome não precisa de um campo opcional para descrever
           "não havia nada para desligar". */
        webhookId: null,
      })
    }

    const environment = conexao.environment as 'sandbox' | 'production'
    const webhookId = (conexao.asaas_webhook_id as string | null) ?? null

    /*
      PASSOS 3 E 4, juntos porque um só existe para o outro: a chave sai do cofre
      unicamente para remover o webhook, e nada abaixo a usa de novo.

      Sem webhook registrado não há nada a remover, e aí nem a chave é lida —
      tirar credencial do Vault sem uso é superfície de graça.
    */
    let webhookRemovido = webhookId === null

    if (webhookId !== null) {
      webhookRemovido = await removerWebhookDoAsaas(admin, tenantId, environment, webhookId)
      if (!webhookRemovido) {
        console.error(`[${FN}] webhook ${webhookId} nao foi removido no Asaas antes de desligar`)
      }
    }

    /* PASSO 5: a linha e o segredo. Daqui em diante não há mais chave. */
    const { data: desligado, error: disconnectError } = await admin.rpc('asaas_disconnect', {
      p_tenant_id: tenantId,
      p_user_id: user.id,
    })

    if (disconnectError) {
      if (disconnectError.code === '42501') {
        throw new HttpError(
          403,
          'forbidden',
          'É preciso permissão de edição em Configurações para desligar a conta Asaas.',
        )
      }
      console.error(
        `[${FN}] asaas_disconnect falhou: ${disconnectError.code} ${disconnectError.message}`,
      )
      /*
        O webhook pode já ter sido removido e a conexão continuar de pé: a
        integração fica no estado "conectado pela metade", que a tela de
        Configurações sabe mostrar e `asaas-renew-webhook` sabe consertar. É o
        melhor lugar para parar, e a mensagem diz o que aconteceu.
      */
      throw new HttpError(
        500,
        'internal_error',
        'Não foi possível desligar a conta agora. O aviso de pagamento pode já ter sido removido no Asaas: confira em Configurações antes de tentar de novo.',
      )
    }

    return jsonResponse(req, {
      disconnected: desligado === true,
      alreadyDisconnected: desligado !== true,
      /*
        Falso aqui é a única notícia que alguém vai ter de que sobrou um webhook
        no Asaas. Não há `last_error` para gravar: a linha que o guardava acabou
        de ser apagada.
      */
      webhookRemoved: webhookRemovido,
      webhookId,
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

/*
  Lê a chave e remove o webhook. Devolve apenas se conseguiu, porque é só isso
  que quem chama tem para decidir — e nenhum ramo daqui levanta exceção: uma
  falha de rede, de cofre ou de configuração não pode impedir o escritório de
  desligar a integração.
*/
async function removerWebhookDoAsaas(
  admin: ReturnType<typeof serviceClient>,
  tenantId: string,
  environment: 'sandbox' | 'production',
  webhookId: string,
): Promise<boolean> {
  let base: string
  try {
    base = baseDoAsaas(environment, lerSegredo)
  } catch (falha) {
    const codigo = falha instanceof Error ? falha.message : 'desconhecido'
    console.error(`[${FN}] configuracao ausente, webhook nao removido: ${codigo}`)
    return false
  }

  const { data: apiKey, error: chaveError } = await admin.rpc('asaas_api_key', {
    p_tenant_id: tenantId,
  })

  if (chaveError) {
    console.error(`[${FN}] falha ao ler a chave: ${chaveError.code} ${chaveError.message}`)
    return false
  }
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    console.error(`[${FN}] conexao sem chave no cofre, webhook nao removido`)
    return false
  }

  return await removerWebhook(base, apiKey, webhookId)
}
