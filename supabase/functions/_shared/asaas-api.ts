/*
  Conversa com o Asaas. Tudo o que faz requisição para a API deles mora aqui, e
  nenhuma função abaixo toca no banco — mesma divisão de `_shared/google.ts`.

  O QUE NUNCA SAI DAQUI: a API Key do escritório. Ela entra como argumento, vai
  no cabeçalho `access_token` e não aparece em log, em resposta nem em mensagem
  de erro. A resposta de erro do Asaas repete o que foi enviado, e por isso o
  log deste arquivo nunca grava o corpo inteiro: grava status e, quando há,
  `code` e `description` do primeiro erro (ver `erroDoAsaas`).

  A CHAVE É DO ESCRITÓRIO, E NÃO DO SISTEMA. É o que a 0125 decidiu no
  cabeçalho: cada escritório liga a conta dele e recebe no caixa dele, então
  não existe segredo global de Edge Function com a chave de todos. Por isso
  toda função aqui recebe `base` e `apiKey` como parâmetro — não há como
  esquecer de dizer de qual escritório é a chamada.

  NENHUMA FUNÇÃO AQUI LEVANTA EXCEÇÃO POR RESPOSTA RUIM. Elas devolvem o
  resultado com `ok`, `status` e `falhaDeRede`, porque quem chama decide coisas
  diferentes: na criação de cobrança, falha de rede manda procurar a cobrança
  por `externalReference` antes de qualquer outra coisa (não existe cabeçalho
  de idempotência no POST, ver a 0125), e 400 do Asaas não manda procurar nada.
  Exceção única apagaria essa diferença.
*/

import { CABECALHO_DA_CHAVE, erroDoAsaas } from './asaas.ts'

export type RespostaAsaas = {
  ok: boolean
  status: number
  json: unknown
  /* Verdadeiro quando a requisição não chegou a ter resposta: timeout, DNS,
     conexão cortada. É o caso em que "não foi criado" e "foi criado e eu não
     soube" são indistinguíveis daqui. */
  falhaDeRede: boolean
  /* Uma linha curta para log e para `last_error`. Já sem segredo. */
  erro: string | null
}

/*
  VINTE SEGUNDOS, e o teto existe para o timeout ser NOSSO.

  `fetch` sem sinal espera o que a plataforma permitir, e a plataforma derruba o
  isolate sem avisar. Nesse caso a cobrança pode ter nascido no Asaas e o
  sistema não grava nem o espelho nem o erro — estado em que o cliente tem um
  boleto que o escritório não sabe que existe. Com o teto aqui, o caminho de
  recuperação por `externalReference` roda dentro da mesma requisição.
*/
const TETO_MS = 20_000

async function chamar(
  base: string,
  apiKey: string,
  metodo: string,
  rota: string,
  corpo?: Record<string, unknown>,
): Promise<RespostaAsaas> {
  let res: Response
  try {
    res = await fetch(`${base}${rota}`, {
      method: metodo,
      headers: {
        [CABECALHO_DA_CHAVE]: apiKey,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      /*
        GET VAI SEM CORPO, E ISSO NÃO É DETALHE: a doc do QR Code do PIX
        responde 403 quando a requisição GET tem corpo, com a frase "chamadas de
        método GET precisam ter um body vazio". Um 403 ali leria como "chave sem
        permissão" e mandaria alguém procurar problema na conta do escritório.
      */
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TETO_MS),
    })
  } catch (falha) {
    /* Só o nome do erro, nunca a mensagem: ela pode carregar a URL inteira. */
    const nome = falha instanceof Error ? falha.name : 'desconhecido'
    console.error(`[asaas] ${metodo} ${rota} nao completou: ${nome}`)
    return { ok: false, status: 0, json: null, falhaDeRede: true, erro: `sem resposta (${nome})` }
  }

  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* Resposta não-JSON (página de erro de borda, por exemplo). O status já diz
       o suficiente, e o texto do corpo pode ser HTML de quilobytes. */
    json = null
  }

  if (!res.ok) {
    const erro = erroDoAsaas(res.status, json)
    console.error(`[asaas] ${metodo} ${rota} recusado: ${erro}`)
    return { ok: false, status: res.status, json, falhaDeRede: false, erro }
  }

  return { ok: true, status: res.status, json, falhaDeRede: false, erro: null }
}

export function criarWebhook(
  base: string,
  apiKey: string,
  corpo: Record<string, unknown>,
): Promise<RespostaAsaas> {
  return chamar(base, apiKey, 'POST', '/v3/webhooks', corpo)
}

/*
  Remover é MELHOR ESFORÇO, igual à revogação do refresh_token do Google
  (`_shared/google.ts`): serve para desfazer um webhook que nasceu no Asaas e
  cujo token não conseguimos guardar. Se a remoção falhar, quem chama segue com
  a recusa — o contrário, abortar a recusa porque a faxina falhou, deixaria o
  escritório acreditando que a integração ficou pronta.
*/
export async function removerWebhook(
  base: string,
  apiKey: string,
  webhookId: string,
): Promise<boolean> {
  const res = await chamar(base, apiKey, 'DELETE', `/v3/webhooks/${encodeURIComponent(webhookId)}`)
  return res.ok
}

export function criarCliente(
  base: string,
  apiKey: string,
  corpo: Record<string, unknown>,
): Promise<RespostaAsaas> {
  return chamar(base, apiKey, 'POST', '/v3/customers', corpo)
}

export function criarCobranca(
  base: string,
  apiKey: string,
  corpo: Record<string, unknown>,
): Promise<RespostaAsaas> {
  return chamar(base, apiKey, 'POST', '/v3/payments', corpo)
}

/*
  A CONSULTA QUE EVITA COBRAR O CLIENTE DUAS VEZES.

  O POST de cobrança do Asaas NÃO aceita cabeçalho de idempotência — está na
  doc e a 0125 registra isso no comentário de `external_reference`. Depois de um
  timeout, repetir às cegas cria a segunda cobrança. Então o caminho é
  perguntar: existe cobrança com esta `externalReference`?

  `limit=10` e não 1: se por algum motivo houver mais de uma, quem chama precisa
  VER isso em vez de pegar a primeira e seguir como se fosse única.
*/
export function cobrancasPorReferencia(
  base: string,
  apiKey: string,
  referencia: string,
): Promise<RespostaAsaas> {
  const rota = `/v3/payments?externalReference=${encodeURIComponent(referencia)}&limit=10`
  return chamar(base, apiKey, 'GET', rota)
}

export function qrCodeDoPix(
  base: string,
  apiKey: string,
  paymentId: string,
): Promise<RespostaAsaas> {
  return chamar(base, apiKey, 'GET', `/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`)
}
