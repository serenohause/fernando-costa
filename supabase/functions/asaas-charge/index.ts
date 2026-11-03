/*
  asaas-charge — emite a cobrança de UMA parcela de `accounts_receivable`.

  NO CLIQUE DE ALGUÉM, e nada automático nesta fase (decisão do usuário). O que
  a fase 1 faz, nas palavras da 0125: emitir a cobrança de uma parcela, mandar o
  link ao cliente e deixar a parcela virar paga pelo AVISO do Asaas, nunca pelo
  clique de alguém. Esta função é a primeira metade; `asaas-webhook` é a
  segunda.

  POR QUE EDGE FUNCTION
  Duas coisas aqui são impossíveis na tela. A API Key só sai do Vault por
  `asaas_api_key`, `security definer` com EXECUTE apenas para `service_role`
  (0128). E `asaas_customers` e `asaas_charges` não têm policy nem grant de
  escrita para `authenticated`, por decisão da 0126: elas são ESPELHO do que o
  Asaas diz, e tela que pudesse editar `status` de cobrança seria tela que mente
  sobre pagamento.

  A ORDEM, E O QUE CADA PASSO EVITA
    1. A parcela e o cliente dela, lidos com o tenant no WHERE.
    2. O espelho do cliente (`cus_`), criado se não existir. Cliente sem
       documento é recusado AQUI, com o nome dele na mensagem.
    3. A cobrança (`pay_`), com `billingType: 'UNDEFINED'` e SEM `interest` nem
       `fine`.
    4. O espelho da cobrança no banco, com tudo o que a resposta trouxe.
    5. O copia e cola do PIX, que é melhor esforço: a cobrança já existe.

  DUAS COBRANÇAS PARA A MESMA PARCELA É O ERRO QUE ESTA FUNÇÃO EXISTE PARA NÃO
  COMETER, e ele tem três barreiras, nesta ordem:

    - antes de qualquer chamada, a consulta por cobrança VIVA daquela parcela.
      Segundo clique no botão devolve a cobrança que já existe, em vez de criar
      outra;
    - depois de falha SEM RESPOSTA (timeout, conexão cortada), a consulta ao
      Asaas por `externalReference`. O POST de cobrança NÃO tem cabeçalho de
      idempotência — está na doc e a 0125 registra isso na coluna
      `external_reference` — então repetir às cegas cobra o cliente duas vezes;
    - por último o índice único parcial `asaas_charges_one_active_per_receivable_idx`,
      que é a garantia de verdade, porque dois cliques simultâneos passam pelas
      duas consultas acima. O 23505 dele é traduzido em frase, e não vaza
      "duplicate key".
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
  corpoDaCobranca,
  descricaoDoAsaas,
  ehCobrancaVivaDuplicada,
  ehMesmoPagamento,
  espelhoDaCobranca,
  espelhoEstaCompleto,
  instanteDoPix,
  pixDisponivel,
  recusaDoAsaasAoCliente,
  recusaPorFaltaDeDocumento,
  SEGREDO_BASE_PRODUCAO,
} from '../_shared/asaas.ts'
import {
  cobrancasPorReferencia,
  criarCliente,
  criarCobranca,
  qrCodeDoPix,
} from '../_shared/asaas-api.ts'

const FN = 'asaas-charge'

const lerSegredo = (nome: string) => Deno.env.get(nome)

const BodySchema = z.object({ receivableId: z.uuid() })

const FORMATO_CUS = /^cus_[A-Za-z0-9]+$/
const FORMATO_PAY = /^pay_[A-Za-z0-9]+$/

type Admin = ReturnType<typeof serviceClient>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const parsed = BodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Informe a parcela a cobrar.')
    }
    const { receivableId } = parsed.data

    /*
      QUEM PODE EMITIR: quem EDITA o menu `receivables`.

      A 0126 decidiu que quem VÊ a cobrança é quem vê `receivables`, e emitir é
      mais do que ver — é pedir dinheiro ao cliente do escritório em nome dele.
      A pergunta vai ao banco, pela mesma função que o resto do sistema usa
      (`collaborator_can_edit_menu`, 0085), e não é reescrita aqui: Diretor
      entra pelo atalho que a função já tem, colaborador em Férias ou Afastado
      não entra porque não está `active`.

      A resposta também é como esta função descobre o escritório e o
      colaborador — o tenant nunca vem do corpo da requisição.
    */
    const { data: autorizado, error: authError } = await admin
      .rpc('collaborator_can_edit_menu', { p_user_id: user.id, p_menu_key: 'receivables' })
      .maybeSingle()

    if (authError) {
      console.error(`[${FN}] falha ao verificar permissao: ${authError.code} ${authError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível verificar a permissão.')
    }
    if (!autorizado) {
      throw new HttpError(
        403,
        'forbidden',
        'É preciso permissão de edição no Financeiro para gerar a cobrança.',
      )
    }
    const { tenant_id: tenantId, collaborator_id: collaboratorId } = autorizado as {
      tenant_id: string
      collaborator_id: string
    }

    /* A conexão diz o AMBIENTE, e o ambiente decide a URL base e entra na chave
       única do espelho do cliente (0125): `cus_` de sandbox não existe em
       produção. */
    const { data: conexao, error: conexaoError } = await admin
      .from('asaas_connections')
      .select('environment, webhook_token_hash')
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
        'A conta Asaas do escritório não está ligada. Ligue em Configurações antes de gerar cobranças.',
      )
    }

    const environment = conexao.environment as 'sandbox' | 'production'

    /*
      SAI EM TODAS AS RESPOSTAS DE SUCESSO, E NÃO SÓ NA EMISSÃO NOVA.

      Nulo significa "cobrança pode ser emitida, mas aviso nenhum pode ser
      confiado" (0125): o cliente paga e a parcela não baixa sozinha. Isso vale
      igual para quem acabou de emitir e para quem clicou de novo numa cobrança
      que já existia — os dois estão olhando um link que vão mandar ao cliente.
      Omitir o campo nos caminhos de `alreadyExisted` fazia a tela não ter como
      distinguir "o aviso está de pé" de "não sei", e a tela que não sabe não
      avisa.
    */
    const webhookRegistrado = conexao.webhook_token_hash !== null

    let base: string
    try {
      base = baseDoAsaas(environment, lerSegredo)
    } catch (falha) {
      const codigo = falha instanceof Error ? falha.message : 'desconhecido'
      console.error(`[${FN}] configuracao ausente: ${codigo}`)
      throw new HttpError(
        503,
        'asaas_production_not_configured',
        `O endereço da API de produção do Asaas não está configurado neste ambiente (segredo ${SEGREDO_BASE_PRODUCAO}).`,
      )
    }

    const { data: apiKey, error: chaveError } = await admin.rpc('asaas_api_key', {
      p_tenant_id: tenantId,
    })

    if (chaveError) {
      console.error(`[${FN}] falha ao ler a chave: ${chaveError.code} ${chaveError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível acessar a integração.')
    }
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new HttpError(
        409,
        'asaas_not_connected',
        'A conta Asaas do escritório não está ligada. Ligue em Configurações antes de gerar cobranças.',
      )
    }

    /* PASSO 1: a parcela. O tenant no WHERE, e não só na policy: aqui falamos
       como `service_role`, que passa por cima de RLS por desenho (0126). */
    const { data: parcela, error: parcelaError } = await admin
      .from('accounts_receivable')
      .select('id, client_id, description, value, due_date, status')
      .eq('id', receivableId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (parcelaError) {
      console.error(`[${FN}] falha ao ler parcela: ${parcelaError.code} ${parcelaError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível ler a parcela.')
    }
    if (!parcela) {
      throw new HttpError(404, 'receivable_not_found', 'Parcela não encontrada neste escritório.')
    }
    if (parcela.status === 'paid') {
      throw new HttpError(
        409,
        'receivable_already_paid',
        'Esta parcela já está marcada como paga. Cobrar de novo pediria o valor outra vez ao cliente.',
      )
    }
    if (!parcela.client_id) {
      /* `client_id` é nulável de propósito em `accounts_receivable` (0041):
         recebível avulso pode não ter cliente do CRM. Mas `customer` é
         obrigatório no POST de cobrança do Asaas, e não há a quem cobrar. */
      throw new HttpError(
        409,
        'receivable_without_client',
        'Esta parcela não está ligada a um cliente, e o Asaas cobra sempre de um cadastro. Vincule o cliente à parcela antes de gerar a cobrança.',
      )
    }

    /* PRIMEIRA BARREIRA contra cobrança dupla: a que já está viva. `deleted` é
       o que o índice parcial consulta — cobrança removida no Asaas libera a
       parcela para uma emissão nova, cobrança viva não (0125). */
    const { data: viva, error: vivaError } = await admin
      .from('asaas_charges')
      .select(
        'id, asaas_payment_id, status, billing_type, value, due_date, invoice_url, bank_slip_url, pix_payload, pix_expires_at',
      )
      .eq('tenant_id', tenantId)
      .eq('receivable_id', receivableId)
      .eq('deleted', false)
      .maybeSingle()

    if (vivaError) {
      console.error(`[${FN}] falha ao ler cobranca viva: ${vivaError.code} ${vivaError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível consultar a cobrança.')
    }
    if (viva) {
      /*
        200 COM A COBRANÇA QUE JÁ EXISTE, e não um erro. Segundo clique no botão
        é o caso comum, e quem clicou quer o link — devolver 409 faria a tela
        mostrar falha para uma situação em que tudo está certo. A tela sabe que
        é a mesma pelo `alreadyExisted`.
      */
      return jsonResponse(req, {
        ...respostaDaCobranca(viva),
        alreadyExisted: true,
        webhookRegistered: webhookRegistrado,
      })
    }

    const { data: cliente, error: clienteError } = await admin
      .from('clients')
      .select('id, name, tax_id_digits')
      .eq('id', parcela.client_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (clienteError) {
      console.error(`[${FN}] falha ao ler cliente: ${clienteError.code} ${clienteError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível ler o cliente da parcela.')
    }
    if (!cliente) {
      throw new HttpError(404, 'client_not_found', 'O cliente desta parcela não foi encontrado.')
    }

    /*
      A RECUSA QUE VAI ACONTECER DE VERDADE: em produção são 55 clientes sem
      documento, e `cpfCnpj` é obrigatório no POST de cliente do Asaas. A
      mensagem nomeia o cliente para a tela poder mostrar quem resolver — ver
      `recusaPorFaltaDeDocumento`, onde o raciocínio inteiro está escrito.
    */
    const documento = (cliente.tax_id_digits ?? '').trim()
    if (documento === '') {
      throw new HttpError(
        409,
        'client_without_document',
        recusaPorFaltaDeDocumento(cliente.name),
      )
    }

    /* PASSO 2 */
    const customerId = await garantirEspelhoDoCliente(admin, {
      base,
      apiKey,
      tenantId,
      environment,
      clientId: cliente.id as string,
      nome: cliente.name as string,
      documento,
    })

    /* PASSO 3 */
    const corpo = corpoDaCobranca({
      customerId,
      valor: Number(parcela.value),
      vencimento: String(parcela.due_date),
      receivableId,
      descricao: String(parcela.description ?? ''),
    })

    const payment = await emitirCobranca(base, apiKey, corpo, receivableId, admin, tenantId)

    const asaasPaymentId = String(payment.id ?? '')
    if (!FORMATO_PAY.test(asaasPaymentId)) {
      /* O check `asaas_charges_asaas_payment_id_format_check` recusaria isso na
         escrita, com 23514 e nome de constraint. Melhor falhar com frase. */
      console.error(`[${FN}] resposta de cobranca sem id no formato pay_`)
      await registrarResultado(admin, tenantId, 'cobranca: resposta sem id pay_')
      throw new HttpError(
        502,
        'asaas_charge_failed',
        'O Asaas respondeu de um jeito que não reconhecemos. A cobrança pode ter sido criada: confira na conta Asaas do escritório antes de tentar de novo.',
      )
    }

    /* PASSO 4 */
    const espelho = espelhoDaCobranca(payment)
    if (!espelhoEstaCompleto(espelho)) {
      /* `status`, `billing_type`, `due_date` e `value` são NOT NULL na 0125, e
         `value` ainda tem check `> 0`: cobrança de zero real não é cobrança. Sem
         as quatro, o INSERT morreria com 23502 e nome de coluna — e a cobrança
         já existe do lado do Asaas. */
      console.error(`[${FN}] resposta de cobranca incompleta nas colunas obrigatorias`)
      await registrarResultado(admin, tenantId, 'cobranca: resposta incompleta')
      throw new HttpError(
        502,
        'asaas_charge_failed',
        'O Asaas criou a cobrança mas devolveu dados incompletos. Confira na conta Asaas do escritório antes de tentar de novo.',
      )
    }

    const linha = {
      tenant_id: tenantId,
      receivable_id: receivableId,
      environment,
      asaas_payment_id: asaasPaymentId,
      external_reference: receivableId,
      created_by_id: collaboratorId,
      ...espelho,
    }

    const { data: gravada, error: gravaError } = await admin
      .from('asaas_charges')
      .insert(linha)
      .select('id, asaas_payment_id, status, billing_type, value, due_date, invoice_url, bank_slip_url, pix_payload, pix_expires_at')
      .single()

    let cobranca = gravada

    if (gravaError) {
      if (ehCobrancaVivaDuplicada(gravaError)) {
        /*
          TERCEIRA BARREIRA, a que de fato garante: dois cliques simultâneos
          passam pela consulta de cobrança viva lá em cima e chegam os dois
          aqui. O índice único parcial recusa o segundo.

          A cobrança deste clique nasceu no Asaas e não tem espelho — e isso é
          dito na mensagem, porque alguém precisa removê-la lá. Registrado em
          `last_error` pelo mesmo motivo: é a única coluna deste módulo que a
          tela de Configurações lê.
        */
        console.error(`[${FN}] cobranca ${asaasPaymentId} criada sem espelho: parcela ja tinha uma viva`)
        await registrarResultado(
          admin,
          tenantId,
          `cobranca ${asaasPaymentId} criada no Asaas sem espelho: a parcela ja tinha cobranca viva`,
        )
        throw new HttpError(
          409,
          'charge_already_exists',
          'Esta parcela já tem uma cobrança aberta, criada há instantes. Atualize a tela para ver o link; não gere outra, para o cliente não receber duas cobranças do mesmo valor.',
        )
      }

      if (ehMesmoPagamento(gravaError)) {
        /* O MESMO `pay_` já está gravado: a criação deu timeout, a consulta por
           `externalReference` achou a cobrança, e outra requisição já havia
           guardado. Não é duplicata — é a mesma cobrança. Lê a linha que está
           lá. */
        const { data: existente } = await admin
          .from('asaas_charges')
          .select('id, asaas_payment_id, status, billing_type, value, due_date, invoice_url, bank_slip_url, pix_payload, pix_expires_at')
          .eq('tenant_id', tenantId)
          .eq('asaas_payment_id', asaasPaymentId)
          .maybeSingle()

        if (existente) {
          return jsonResponse(req, {
            ...respostaDaCobranca(existente),
            alreadyExisted: true,
            webhookRegistered: webhookRegistrado,
          })
        }
      }

      console.error(`[${FN}] falha ao gravar espelho: ${gravaError.code} ${gravaError.message}`)
      await registrarResultado(
        admin,
        tenantId,
        `cobranca ${asaasPaymentId} criada no Asaas e nao gravada aqui`,
      )
      throw new HttpError(
        500,
        'internal_error',
        'A cobrança foi criada no Asaas mas não foi registrada aqui. Confira a conta Asaas do escritório antes de gerar outra.',
      )
    }

    /* PASSO 5: o copia e cola. */
    const pix = await buscarPix(admin, {
      base,
      apiKey,
      tenantId,
      chargeId: cobranca.id as string,
      asaasPaymentId,
      billingType: String(cobranca.billing_type ?? ''),
    })

    if (pix) cobranca = { ...cobranca, ...pix }

    await registrarResultado(admin, tenantId, null)

    /*
      `webhookRegistered` sai na resposta porque existe um estado real em que a
      cobrança pode ser emitida e nenhum aviso pode ser confiado: a 0125 diz
      isso no comentário de `webhook_token_hash`, e nulo significa exatamente
      "cobrança pode ser emitida, mas aviso nenhum pode ser confiado". Nesse
      estado o cliente paga e a parcela não baixa sozinha, então a tela precisa
      poder dizer isso a quem clicou. Esta função NÃO recusa a emissão por isso
      — recusar contrariaria a 0125.
    */
    return jsonResponse(req, {
      ...respostaDaCobranca(cobranca),
      alreadyExisted: false,
      webhookRegistered: webhookRegistrado,
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

/* ------------------------------------------------------------------ */

/*
  O ESPELHO DO CLIENTE, E POR QUE ELE É PROCURADO ANTES.

  A API do Asaas ACEITA criar cliente duplicado — está na doc dela, e é a frase
  com que a 0125 justifica a existência de `asaas_customers`. Sem procurar
  primeiro, cada cobrança criaria um `cus_` novo para a mesma pessoa, cada um
  com parte do histórico.

  A CHAVE INCLUI O AMBIENTE, e não é detalhe: `cus_` de sandbox não existe em
  produção, e reaproveitar um produz "o pior dos erros - cobranca emitida para
  um cliente que o Asaas de producao nunca viu" (0125).
*/
async function garantirEspelhoDoCliente(
  admin: Admin,
  args: {
    base: string
    apiKey: string
    tenantId: string
    environment: string
    clientId: string
    nome: string
    documento: string
  },
): Promise<string> {
  const { data: espelho, error: leituraError } = await admin
    .from('asaas_customers')
    .select('asaas_customer_id')
    .eq('tenant_id', args.tenantId)
    .eq('client_id', args.clientId)
    .eq('environment', args.environment)
    .maybeSingle()

  if (leituraError) {
    console.error(`[${FN}] falha ao ler espelho do cliente: ${leituraError.code} ${leituraError.message}`)
    throw new HttpError(500, 'internal_error', 'Não foi possível consultar o cliente no Asaas.')
  }
  if (espelho) return espelho.asaas_customer_id as string

  /*
    SÓ NOME, DOCUMENTO E A REFERÊNCIA NOSSA.

    E-mail e telefone do cliente ficam FORA de propósito. Cadastrados aqui, o
    Asaas passa a notificar o cliente do escritório por conta própria (e-mail e
    SMS de cobrança são padrão da conta deles), e a decisão de produto da fase 1
    é outra: o escritório manda o link por WhatsApp. Ligar um canal de
    comunicação com o cliente final por efeito colateral de um campo opcional
    não é escolha que esta função tem o direito de fazer.

    Cada campo a menos também é um 400 a menos: validação de formato de telefone
    e de e-mail do lado deles derrubaria a emissão por um dado que a cobrança
    não usa.
  */
  const resposta = await criarCliente(args.base, args.apiKey, {
    name: args.nome,
    cpfCnpj: args.documento,
    externalReference: args.clientId,
  })

  if (!resposta.ok) {
    await registrarResultado(admin, args.tenantId, `cliente: ${resposta.erro ?? 'falha'}`)

    if (resposta.status === 401) {
      throw new HttpError(
        401,
        'asaas_invalid_api_key',
        'O Asaas recusou a API Key do escritório. Reconecte a conta em Configurações.',
      )
    }
    if (resposta.status === 400) {
      throw new HttpError(
        422,
        'asaas_customer_rejected',
        recusaDoAsaasAoCliente(args.nome, descricaoDoAsaas(resposta.json)),
      )
    }
    throw new HttpError(
      502,
      'asaas_unavailable',
      'O Asaas não respondeu agora. Tente gerar a cobrança de novo em instantes.',
    )
  }

  const customerId = String((resposta.json as { id?: unknown })?.id ?? '')
  if (!FORMATO_CUS.test(customerId)) {
    console.error(`[${FN}] resposta de cliente sem id no formato cus_`)
    await registrarResultado(admin, args.tenantId, 'cliente: resposta sem id cus_')
    throw new HttpError(
      502,
      'asaas_customer_failed',
      'O Asaas respondeu de um jeito que não reconhecemos ao cadastrar o cliente. Tente de novo em instantes.',
    )
  }

  const { error: gravaError } = await admin.from('asaas_customers').insert({
    tenant_id: args.tenantId,
    client_id: args.clientId,
    environment: args.environment,
    asaas_customer_id: customerId,
  })

  if (gravaError) {
    /*
      23505 aqui é corrida, não erro: duas emissões do mesmo cliente ao mesmo
      tempo criaram dois `cus_` no Asaas e só um pode ficar no espelho (a chave
      única da 0125 é o que impede o duplicado). A cobrança segue com o que
      ficou gravado, que é o que todas as próximas vão usar — usar o `cus_`
      solto deste caminho deixaria uma cobrança pendurada num cadastro que o
      espelho não conhece.
    */
    if (gravaError.code === '23505') {
      const { data: concorrente } = await admin
        .from('asaas_customers')
        .select('asaas_customer_id')
        .eq('tenant_id', args.tenantId)
        .eq('client_id', args.clientId)
        .eq('environment', args.environment)
        .maybeSingle()

      if (concorrente) {
        console.error(`[${FN}] cliente ${customerId} criado em duplicidade no Asaas; espelho ficou com ${concorrente.asaas_customer_id}`)
        return concorrente.asaas_customer_id as string
      }
    }

    console.error(`[${FN}] falha ao gravar espelho do cliente: ${gravaError.code} ${gravaError.message}`)
    throw new HttpError(500, 'internal_error', 'Não foi possível registrar o cliente no Asaas.')
  }

  return customerId
}

/*
  EMITIR, E O QUE FAZER QUANDO A RESPOSTA NÃO CHEGA.

  Não existe cabeçalho de idempotência no POST de cobrança do Asaas. Então
  falha SEM RESPOSTA (timeout, conexão cortada) e falha COM RESPOSTA são tratadas
  de maneiras opostas:

    sem resposta, ou 5xx  a cobrança pode ter nascido. Pergunta-se ao Asaas por
                          `externalReference` ANTES de qualquer nova tentativa.
                          Nunca se repete o POST.
    400, 401              o Asaas recusou e nada nasceu. Repetir a consulta
                          gastaria uma chamada para confirmar o óbvio.
*/
async function emitirCobranca(
  base: string,
  apiKey: string,
  corpo: Record<string, unknown>,
  receivableId: string,
  admin: Admin,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const resposta = await criarCobranca(base, apiKey, corpo)

  if (resposta.ok) return (resposta.json ?? {}) as Record<string, unknown>

  if (!resposta.falhaDeRede && resposta.status < 500) {
    await registrarResultado(admin, tenantId, `cobranca: ${resposta.erro ?? 'falha'}`)

    if (resposta.status === 401) {
      throw new HttpError(
        401,
        'asaas_invalid_api_key',
        'O Asaas recusou a API Key do escritório. Reconecte a conta em Configurações.',
      )
    }
    /*
      A FRASE DELES, QUANDO EXISTE, E A NOSSA SÓ COMO RESERVA.

      Medido em 03/11/2026: a recusa foi "O valor da cobrança excede o seu
      limite autorizado. Entre em contato com o suporte para aumentar o limite."
      e a tela mostrava "Confira o valor e a data de vencimento da parcela".
      Quem lesse iria conferir a data, que estava certa, e nunca chegaria ao
      limite da conta. O motivo veio na resposta e era descartado aqui.

      A frase deles é escrita em português para o dono da conta, e vem em duas
      orações: o que houve e o que fazer. É exatamente a divisão que a faixa da
      tela desenha, então ela entra inteira, sem reescrita nossa.
    */
    const motivo = descricaoDoAsaas(resposta.json)
    throw new HttpError(
      422,
      'asaas_charge_rejected',
      motivo ?? 'O Asaas recusou esta cobrança. Confira o valor e a data de vencimento da parcela.',
    )
  }

  /* A cobrança pode ter nascido. Procurar, não repetir. */
  const busca = await cobrancasPorReferencia(base, apiKey, receivableId)

  if (!busca.ok) {
    await registrarResultado(
      admin,
      tenantId,
      `cobranca sem resposta e sem confirmacao (parcela ${receivableId})`,
    )
    throw new HttpError(
      504,
      'asaas_timeout',
      'O Asaas não respondeu e não foi possível confirmar se a cobrança foi criada. NÃO gere outra agora: confira a conta Asaas do escritório e tente novamente em alguns minutos.',
    )
  }

  const lista = ((busca.json as { data?: unknown })?.data ?? []) as Record<string, unknown>[]
  const vivas = lista.filter((item) => item?.deleted !== true)

  if (vivas.length === 1) {
    console.error(`[${FN}] cobranca da parcela ${receivableId} recuperada por externalReference`)
    return vivas[0]
  }

  if (vivas.length > 1) {
    /* Mais de uma cobrança viva para a mesma parcela do lado do Asaas é
       exatamente o que este módulo existe para não produzir, e escolher uma
       esconderia o problema. Gente resolve. */
    console.error(`[${FN}] ${vivas.length} cobrancas vivas no Asaas para a parcela ${receivableId}`)
    await registrarResultado(
      admin,
      tenantId,
      `${vivas.length} cobrancas vivas no Asaas para a mesma parcela (${receivableId})`,
    )
    throw new HttpError(
      409,
      'asaas_duplicate_charge',
      'O Asaas tem mais de uma cobrança aberta para esta parcela. Remova as repetidas na conta Asaas do escritório antes de continuar.',
    )
  }

  await registrarResultado(admin, tenantId, 'cobranca: o Asaas nao respondeu')
  throw new HttpError(
    504,
    'asaas_timeout',
    'O Asaas não respondeu. A cobrança não foi criada; tente de novo em instantes.',
  )
}

/*
  O COPIA E COLA DO PIX, E POR QUE FALHA AQUI NÃO DERRUBA NADA.

  Neste ponto a cobrança JÁ EXISTE no Asaas e JÁ TEM espelho no banco. Levantar
  erro faria a tela dizer que a emissão falhou para uma cobrança que está de pé,
  e o próximo clique bateria no índice único parcial. O link de pagamento
  (`invoiceUrl`) já serve PIX, boleto e cartão na mesma página (0125), então o
  que se perde sem o copia e cola é um atalho, não a cobrança.

  A IMAGEM (`encodedImage`, base64) É DESCARTADA DE PROPÓSITO: a 0125 explica —
  são dezenas de KB por linha, inflam tabela e backup, e a imagem é só uma
  renderização do mesmo payload, refazível na hora.

  OS DOIS CAMPOS ANDAM JUNTOS OU NÃO VÃO. O check
  `asaas_charges_pix_pair_check` exige os dois ou nenhum, e a razão está no
  comentário de `pix_expires_at`: o QR Code do Asaas é dinâmico, vence, e sem a
  validade o sistema mostraria para sempre um código que o banco do cliente
  recusa — "e o cliente concluiria que o erro é dele".
*/
async function buscarPix(
  admin: Admin,
  args: {
    base: string
    apiKey: string
    tenantId: string
    chargeId: string
    asaasPaymentId: string
    billingType: string
  },
): Promise<{ pix_payload: string; pix_expires_at: string } | null> {
  if (!pixDisponivel(args.billingType)) return null

  const resposta = await qrCodeDoPix(args.base, args.apiKey, args.asaasPaymentId)
  if (!resposta.ok) {
    console.error(`[${FN}] QR Code do PIX de ${args.asaasPaymentId} nao veio: ${resposta.erro}`)
    return null
  }

  const corpo = (resposta.json ?? {}) as { payload?: unknown; expirationDate?: unknown }
  const payload = typeof corpo.payload === 'string' ? corpo.payload.trim() : ''
  const validade = instanteDoPix(corpo.expirationDate)

  if (payload === '' || validade === null) {
    console.error(`[${FN}] QR Code do PIX de ${args.asaasPaymentId} sem payload ou sem validade`)
    return null
  }

  const atualizacao = { pix_payload: payload, pix_expires_at: validade }

  const { error } = await admin
    .from('asaas_charges')
    .update(atualizacao)
    .eq('id', args.chargeId)
    .eq('tenant_id', args.tenantId)

  if (error) {
    console.error(`[${FN}] falha ao gravar PIX: ${error.code} ${error.message}`)
    return null
  }

  return atualizacao
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

/* O recorte que a tela consome. `invoiceUrl` vem primeiro porque é ELE que vai
   ao cliente por WhatsApp (0125): serve PIX, boleto e cartão na mesma página. */
function respostaDaCobranca(linha: Record<string, unknown>): Record<string, unknown> {
  return {
    chargeId: linha.id,
    asaasPaymentId: linha.asaas_payment_id,
    invoiceUrl: linha.invoice_url,
    bankSlipUrl: linha.bank_slip_url,
    pixPayload: linha.pix_payload,
    pixExpiresAt: linha.pix_expires_at,
    status: linha.status,
    billingType: linha.billing_type,
    value: linha.value,
    dueDate: linha.due_date,
  }
}
