/*
  asaas-webhook — o aviso do Asaas, que é onde a corretude do dinheiro mora.

  É ESTA FUNÇÃO QUE DÁ A PARCELA COMO PAGA, e é a única que dá: a 0126 fechou
  toda escrita de `authenticated` nas quatro tabelas, e a 0125 decidiu que a
  parcela vira paga pelo AVISO do Asaas, "nunca pelo clique de alguem". Então
  errar aqui não é erro de tela: é o financeiro do escritório afirmando um fato
  que não aconteceu, ou deixando de registrar um que aconteceu.

  `verify_jwt = FALSE`, e é o desenho. Quem chama é o Asaas, e provedor não
  carrega JWT. O que faz o papel da sessão é o cabeçalho
  `asaas-access-token`, resolvido no BANCO por `asaas_resolve_webhook_token`
  (0128), que compara por SHA-256 e devolve NENHUMA LINHA quando não casa —
  inclusive quando o escritório ainda não registrou webhook, porque hash nulo
  não casa com token nenhum. É a mesma forma de `google-calendar-agenda`: a
  credencial da porta é conferida no banco, nunca aqui e nunca no navegador.

  O CONTRATO, EM ORDEM, E A ORDEM É A PARTE IMPORTANTE:

    1. token do cabeçalho → `asaas_resolve_webhook_token`. Vazio é RECUSA: 401 e
       NADA gravado. Sem cabeçalho, igual.
    2. gravar o evento em `asaas_webhook_events`, ANTES de qualquer efeito. A
       doc do Asaas manda responder 200 somente DEPOIS de persistir, e a 0125
       separou `received_at` de `processed_at` por isso mesmo.
    3. violação de unicidade em `asaas_event_id` NÃO é erro: é REENTREGA. A
       entrega é at-least-once (a doc diz, e manda deduplicar pelo id). Responde
       200 sem reprocessar nada. Tratar como falha faria o Asaas reentregar para
       sempre; reprocessar baixaria a parcela duas vezes.
    4. só então o efeito: espelho da cobrança atualizado e, nos eventos de
       pagamento, a parcela dada como paga.
    5. efeito que falha chama `asaas_record_result`. Decisão do usuário
       (03/11/2026) e não é acessório: `last_error` é a ÚNICA coluna deste
       módulo que a tela de Configurações lê (`asaas_webhook_events` não tem
       policy nem grant, por decisão da 0126). Sem essa chamada, o 200 já foi
       dado, o Asaas não reentrega, e a parcela fica aberta sem ninguém saber.

  DEPOIS DO PASSO 2, A RESPOSTA É 200 ACONTEÇA O QUE ACONTECER. O evento está
  guardado e o corpo inteiro está no `payload`: de lá um reprocessamento parte
  sem precisar pedir o evento de novo, que o Asaas não reenvia a pedido. Devolver
  500 depois de persistir faria o provedor reentregar um aviso que já está
  gravado, e cada reentrega bate na constraint e volta 200 — ruído sem fim.
*/

import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import {
  baixaAParcela,
  conferirConta,
  dataDaBaixa,
  dataEHoraDoAviso,
  ehReentrega,
  espelhoDaCobranca,
  metodoDePagamento,
} from '../_shared/asaas.ts'

const FN = 'asaas-webhook'

/* Goiânia, igual a `google-calendar-agenda`. O fuso é o do escritório, e não o
   do servidor, que roda em UTC e daria o dia seguinte depois das 21h. */
const TIME_ZONE = 'America/Sao_Paulo'

type Admin = ReturnType<typeof serviceClient>

Deno.serve(async (req) => {
  /*
    SEM CORS, e sem OPTIONS. Não existe navegador nesta porta: quem chama é o
    servidor do Asaas. Cabeçalho de origem aqui não protegeria nada nem
    permitiria nada — `errorResponse` e `jsonResponse` cuidam do resto do
    formato, igual às outras funções.
  */
  try {
    assertPost(req)

    const admin = serviceClient()

    /* PASSO 1: de quem é este aviso. */
    const apresentado = (req.headers.get('asaas-access-token') ?? '').trim()

    if (apresentado === '') {
      /*
        NADA GRAVADO, e isso é deliberado. Sem token não se sabe de qual
        escritório é a linha, e `tenant_id` é NOT NULL. Guardar "para
        investigar" exigiria inventar um dono, e a URL é pública: seria uma
        tabela que qualquer um na internet enche.
      */
      console.error(`[${FN}] aviso sem cabecalho asaas-access-token`)
      throw new HttpError(401, 'unauthorized', 'Aviso sem credencial.')
    }

    const { data: resolvido, error: resolveError } = await admin
      .rpc('asaas_resolve_webhook_token', { p_token: apresentado })
      .maybeSingle()

    if (resolveError) {
      /* O banco não respondeu, então NÃO foi possível persistir. 500 aqui é
         correto e desejado: o Asaas reentrega, e a reentrega é o que recupera o
         aviso. */
      console.error(`[${FN}] falha ao resolver token: ${resolveError.code} ${resolveError.message}`)
      throw new HttpError(503, 'unavailable', 'Indisponível. Tente de novo.')
    }

    if (!resolvido) {
      /* Token apresentado não casa com escritório nenhum. Pode ser aviso de uma
         integração removida, ou alguém postando "parcela paga" na URL pública.
         Nos dois casos: 401, nada gravado, nada aplicado. */
      console.error(`[${FN}] token apresentado nao casa com nenhuma conexao`)
      throw new HttpError(401, 'unauthorized', 'Credencial não reconhecida.')
    }

    /*
      O AMBIENTE VEM JUNTO, e ele é metade da autenticação deste aviso.

      `asaas_resolve_webhook_token` (0128) devolve `(tenant_id, environment)`
      porque token só diz DE QUEM é o aviso. Em que ambiente o escritório está
      falando é a outra pergunta, e sem ela um aviso de Sandbox baixa parcela de
      verdade: conta ligada em Sandbox por engano emite cobrança com link de
      sandbox, qualquer um que receba o link "paga" com cartão de teste, chega
      PAYMENT_CONFIRMED com token válido, e a parcela fecha sem um centavo ter
      entrado. Ver a conferência em `aplicarEfeito`.
    */
    const { tenant_id: tenantId, environment } = resolvido as {
      tenant_id: string
      environment: 'sandbox' | 'production'
    }

    const corpo = (await readJsonBody(req)) as Record<string, unknown>

    const eventId = textoDe(corpo.id)
    const eventName = textoDe(corpo.event)

    if (eventId === null || eventName === null) {
      /*
        Sem `id` não há por onde deduplicar, e sem `event` não há o que aplicar
        — as duas colunas são NOT NULL com check de "não vazio" na 0125.
        Gravar uma linha com id inventado destruiria a idempotência do módulo
        inteiro, que é essa constraint e mais nada.
      */
      console.error(`[${FN}] corpo sem id ou sem event`)
      throw new HttpError(400, 'invalid_event', 'Corpo do aviso sem id ou sem event.')
    }

    /* PASSO 2: gravar ANTES de qualquer efeito. */
    const { data: evento, error: gravaError } = await admin
      .from('asaas_webhook_events')
      .insert({
        tenant_id: tenantId,
        asaas_event_id: eventId,
        event_name: eventName,
        payload: corpo,
        /*
          `dateCreated` como ele falou, QUANDO dá para entender. A coluna é
          `timestamp` SEM FUSO de propósito (0125): o exemplo da doc é
          "2024-06-12 16:45:03", sem offset e sem nenhuma frase dizendo em que
          fuso isso está, e em `timestamptz` o Postgres completaria com o fuso
          da sessão, nascendo três horas deslocado com aparência de dado exato.

          O filtro é `dataEHoraDoAviso`, e não `textoDe`: texto que não é data
          viraria 22007 na gravação, e a gravação que falha vira 500 para o
          Asaas reentregar. Com `sendType: 'SEQUENTIALLY'` a reentrega traz o
          mesmo corpo, falha igual, e a fila de avisos do escritório para atrás
          dele. O raciocínio inteiro está em `_shared/asaas.ts`.
        */
        event_created_at: dataEHoraDoAviso(corpo.dateCreated),
      })
      .select('id')
      .single()

    if (gravaError) {
      /* PASSO 3: reentrega. 200, sem reprocessar. */
      if (ehReentrega(gravaError)) {
        console.log(`[${FN}] reentrega do evento ${eventId}: nada reprocessado`)
        return jsonResponse(req, { received: true, duplicate: true })
      }

      /* Não persistiu por outro motivo: 500 para o Asaas reentregar. */
      console.error(`[${FN}] falha ao gravar evento: ${gravaError.code} ${gravaError.message}`)
      throw new HttpError(500, 'not_persisted', 'Não foi possível registrar o aviso.')
    }

    const eventoId = evento.id as string

    /*
      DAQUI PARA BAIXO A RESPOSTA É 200. O efeito acontece dentro do try, e
      falha dele vira `processing_error` na linha mais `last_error` na conexão —
      não vira resposta de erro, porque o aviso já está guardado e reentregá-lo
      não melhora nada.
    */
    try {
      const aplicado = await aplicarEfeito(
        admin,
        tenantId,
        environment,
        corpo,
        eventName,
        eventoId,
      )

      const { error: carimboError } = await admin
        .from('asaas_webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', eventoId)
        .eq('tenant_id', tenantId)

      if (carimboError) {
        /* O efeito aconteceu e o carimbo não. A linha fica na fila
           (`processed_at` nulo) e um reprocessamento futuro reaplicaria — o que
           é seguro, porque a baixa da parcela só toca linha que ainda não está
           paga. Mesmo assim é notícia. */
        console.error(`[${FN}] efeito aplicado e nao carimbado: ${carimboError.code} ${carimboError.message}`)
        await registrarResultado(admin, tenantId, `aviso ${eventId} aplicado sem carimbo de processamento`)
      }

      return jsonResponse(req, { received: true, ...aplicado })
    } catch (falha) {
      const detalhe = falha instanceof Error ? falha.message : 'falha desconhecida'
      console.error(`[${FN}] processamento do evento ${eventId} falhou: ${detalhe}`)

      /* `processing_attempts > 0` é condição do check
         `asaas_webhook_events_error_needs_attempt_check`: erro sem tentativa
         nenhuma é um registro que não explica nada. */
      await admin
        .from('asaas_webhook_events')
        .update({ processing_error: detalhe.slice(0, 500), processing_attempts: 1 })
        .eq('id', eventoId)
        .eq('tenant_id', tenantId)

      /* PASSO 5: o único caminho entre esta falha e um humano. */
      await registrarResultado(admin, tenantId, `aviso ${eventName} nao processado: ${detalhe}`)

      return jsonResponse(req, { received: true, processed: false })
    }
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

/* ------------------------------------------------------------------ */

/*
  O EFEITO. Levanta `Error` quando falha, e quem chama transforma isso em
  `processing_error` + `last_error` sem deixar de responder 200.
*/
async function aplicarEfeito(
  admin: Admin,
  tenantId: string,
  environment: 'sandbox' | 'production',
  corpo: Record<string, unknown>,
  eventName: string,
  eventoId: string,
): Promise<Record<string, unknown>> {
  await conferirAConta(admin, tenantId, corpo, eventoId)

  const payment = (corpo.payment ?? null) as Record<string, unknown> | null
  const paymentId = payment ? textoDe(payment.id) : null

  if (!payment || paymentId === null) {
    /* Evento de cobrança sem cobrança no corpo. Não há o que aplicar, e isso
       NÃO é erro: carimbar como processado é a verdade. */
    console.log(`[${FN}] evento ${eventName} sem payment no corpo: nada a aplicar`)
    return { processed: true, applied: 'nada' }
  }

  const { data: cobranca, error: leituraError } = await admin
    .from('asaas_charges')
    .select('id, receivable_id, status, environment')
    .eq('tenant_id', tenantId)
    .eq('asaas_payment_id', paymentId)
    .maybeSingle()

  if (leituraError) throw new Error(`leitura da cobranca: ${leituraError.code}`)

  /*
    O AMBIENTE DO AVISO TEM QUE SER O DA COBRANÇA, e esta é a conferência que
    impede dinheiro falso de fechar parcela de verdade.

    `asaas_charges.environment` (0125) guarda em que ambiente CADA cobrança
    nasceu, e o token diz em que ambiente o escritório está falando agora.
    Quando os dois discordam, o aviso é de um mundo e a cobrança é de outro:
    dinheiro de sandbox não baixa parcela emitida em produção, e vice-versa.

    POR QUE NÃO É FILTRO NO `select`: filtrar deixaria este caso cair no ramo
    de "cobrança sem espelho", que contaria a história errada - ele acusaria
    gap nosso de gravação, que é outro problema, com outro conserto. A linha
    existe, o escritório precisa saber que ela foi ignorada e por quê.

    NÃO É ERRO DE CÓDIGO e não levanta: trocar de ambiente em Configurações é
    operação permitida (0128 zera o webhook justamente para isso), e cobrança
    emitida antes da troca continua no banco. O aviso fica guardado, carimbado
    como processado, e a frase vai para `last_error`, que é onde quem configura
    a integração lê.
  */
  if (cobranca && cobranca.environment !== environment) {
    console.error(
      `[${FN}] aviso de ${environment} para cobranca ${paymentId} emitida em ${cobranca.environment}: nada aplicado`,
    )
    await registrarResultado(
      admin,
      tenantId,
      `aviso de pagamento recebido no ambiente ${environment}, mas a cobranca foi emitida em ${cobranca.environment}. Nada foi baixado. Confira qual ambiente esta ligado em Configuracoes.`,
    )
    return { processed: true, applied: 'nada', motivo: 'ambiente divergente' }
  }

  if (!cobranca) {
    /*
      COBRANÇA SEM ESPELHO, e são dois casos muito diferentes.

      Se o `externalReference` do evento aponta para uma parcela DESTE
      escritório, então a cobrança saiu por aqui e o espelho não foi gravado —
      o caso que `asaas-charge` registra quando o POST funciona e o INSERT
      falha. Isso é gap nosso e precisa de gente, porque o cliente tem o link em
      mãos e a parcela não tem como baixar.

      Se não aponta para parcela nenhuma, a cobrança nasceu fora do sistema
      (painel do Asaas, link de pagamento). Não há o que aplicar, e não é erro
      do escritório: alarme aqui ensinaria a ignorar `last_error`.
    */
    const referencia = textoDe(payment.externalReference)

    if (referencia !== null) {
      const { data: parcela } = await admin
        .from('accounts_receivable')
        .select('id')
        .eq('id', referencia)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (parcela) {
        throw new Error(`cobranca ${paymentId} da parcela ${referencia} nao tem espelho neste banco`)
      }
    }

    console.log(`[${FN}] evento ${eventName} de cobranca ${paymentId} sem espelho e sem parcela nossa`)
    return { processed: true, applied: 'nada' }
  }

  /*
    O ESPELHO PRIMEIRO, A PARCELA DEPOIS.

    Nesta ordem porque o espelho é o que explica a baixa: se a atualização da
    parcela falhar, fica registrado no banco o estado do Asaas que a motivava, e
    `last_error` aponta o caminho. Invertida, a parcela baixaria com o espelho
    dizendo "PENDING", e a conciliação leria dois fatos contraditórios sem nada
    datando qual é o atual.
  */
  const espelho = espelhoDaCobranca(payment)
  const { error: espelhoError } = await admin
    .from('asaas_charges')
    .update(espelho)
    .eq('id', cobranca.id as string)
    .eq('tenant_id', tenantId)

  if (espelhoError) throw new Error(`espelho da cobranca: ${espelhoError.code}`)

  if (!baixaAParcela(eventName)) {
    /*
      PAYMENT_DELETED e PAYMENT_REFUNDED param aqui, e a parada é decisão.

      Os dois mexem no espelho — `deleted` vem no payload e a remoção libera a
      parcela para nova emissão pelo índice parcial (0125) — mas NÃO reabrem a
      parcela. Devolver dinheiro ao cliente é lançamento de financeiro, não
      correção de espelho: mexeria em valor recebido, em relatório de período já
      fechado e possivelmente em comissão. A 0125 deixou juros e multa para a
      fase 2 pela mesma razão, e estorno é da mesma família. Está sinalizado ao
      usuário, e não foi decidido aqui.
    */
    return { processed: true, applied: 'espelho' }
  }

  /*
    A BAIXA DA PARCELA.

    `status <> 'paid'` NO WHERE, e não um `if` antes: é o que faz a segunda
    chegada (CONFIRMED e depois RECEIVED da mesma cobrança, ou um
    reprocessamento) não reescrever a data de pagamento com a data do segundo
    evento. A parcela baixa uma vez, no dia em que o cliente pagou.

    `payment_method` vem do `billingType` do Asaas, mapeado para o enum da
    0040, e valor que não mapeia fica NULO em vez de virar palpite — ver
    `metodoDePagamento`.
  */
  const baixa = {
    status: 'paid',
    payment_date: dataDaBaixa(payment, corpo, hojeNoEscritorio()),
    payment_method: metodoDePagamento(payment.billingType),
  }

  const { data: baixada, error: baixaError } = await admin
    .from('accounts_receivable')
    .update(baixa)
    .eq('id', cobranca.receivable_id as string)
    .eq('tenant_id', tenantId)
    .neq('status', 'paid')
    .select('id')

  if (baixaError) throw new Error(`baixa da parcela: ${baixaError.code}`)

  const quantas = (baixada ?? []).length
  if (quantas === 0) {
    /* A parcela já estava paga: reentrega lógica (o mesmo pagamento chegando
       por CONFIRMED e por RECEIVED). Não é erro e não é notícia. */
    return { processed: true, applied: 'espelho' }
  }

  console.log(`[${FN}] parcela ${cobranca.receivable_id} baixada por ${eventName}`)
  return { processed: true, applied: 'baixa' }
}

/*
  DE QUAL CONTA ASAAS VEIO ESTE AVISO.

  A referência é a conta vista nos avisos ANTERIORES deste escritório: não
  existe coluna com a conta Asaas em `asaas_connections`, e perguntar ao
  provedor a cada aviso seria uma requisição de rede dentro do caminho do
  dinheiro. O primeiro aviso de um escritório, portanto, nunca tem com o que
  comparar — e isso é "não dá para conferir", não "não casou" (0125).

  DIVERGÊNCIA NÃO BLOQUEIA O EFEITO, e o motivo é que o efeito já é recortado
  por escritório: a cobrança é buscada por (tenant_id, asaas_payment_id), então
  um `pay_` de outra conta simplesmente não encontra linha e nada é aplicado.
  O que a divergência significa é CONFIGURAÇÃO TROCADA — o escritório mudou de
  conta Asaas, ou o webhook de uma conta ficou apontando para a URL registrada
  com outra — e isso precisa de gente, por `last_error`.
*/
async function conferirAConta(
  admin: Admin,
  tenantId: string,
  corpo: Record<string, unknown>,
  eventoId: string,
): Promise<void> {
  const { data: anterior } = await admin
    .from('asaas_webhook_events')
    .select('asaas_account_id')
    .eq('tenant_id', tenantId)
    .not('asaas_account_id', 'is', null)
    .neq('id', eventoId)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const conclusao = conferirConta(corpo, (anterior?.asaas_account_id as string) ?? null)

  if (conclusao.conclusao === 'divergente') {
    console.error(
      `[${FN}] conta divergente: aviso diz ${conclusao.id}, avisos anteriores deste escritorio diziam ${anterior?.asaas_account_id}`,
    )
    await registrarResultado(
      admin,
      tenantId,
      `aviso recebido de uma conta Asaas diferente da que vinha enviando (${conclusao.id}). Confira qual conta esta ligada em Configuracoes.`,
    )
    return
  }

  if (conclusao.formato === 'texto') {
    /* Formato inesperado do provedor é notícia de código, não do escritório:
       vai para o log e não para `last_error`. A coluna gerada da 0125 lê
       `account -> id` e concluiria o mesmo "sem dado" — se um dia `account`
       passar a ser texto, os dois lugares mudam juntos. */
    console.error(`[${FN}] campo account veio como texto, nao como objeto`)
  }
}

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

/* `en-CA` porque o formato dele é YYYY-MM-DD, mesmo truque de
   `google-calendar-agenda`. */
function hojeNoEscritorio(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}
