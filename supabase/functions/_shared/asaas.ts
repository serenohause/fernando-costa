/*
  As decisões da integração com o Asaas que NÃO dependem de rede.

  POR QUE ESTE ARQUIVO EXISTE SEPARADO DAS TRÊS FUNÇÕES
  A chave do sandbox ainda não existe, e a decisão (usuário, 03/11/2026) foi
  escrever agora e conferir contra o Asaas de verdade quando ela chegar. Então o
  que decide — qual evento baixa a parcela, qual forma de pagamento virou qual
  valor do nosso enum, o que vai no corpo do POST, qual URL base é a do ambiente
  — mora aqui, puro e importável, e é conferido por `tests/asaas-regras.mjs` com
  Node, sem subir função nenhuma.

  NENHUM IMPORT, E ISSO É REQUISITO
  Este módulo é lido por Deno (nas funções) e por Node (no teste), e o
  precedente é `_shared/client-key.ts`, importado por
  `tests/rate-limit-identidade.mjs`. Nada de `Deno.env` aqui dentro: quem
  precisa de segredo recebe um LEITOR como parâmetro. Assim o teste consegue
  simular ambiente sem ambiente.

  O QUE ESTE ARQUIVO NÃO FAZ
  Não fala com o Asaas, não toca no banco e não decide HTTP. Erro aqui é
  `Error` com código curto; quem traduz para resposta é a função, como em
  `_shared/google.ts`.
*/

export type AsaasEnvironment = 'sandbox' | 'production'

/* O mesmo contrato de `Deno.env.get`, sem depender dele. */
export type LeitorDeSegredo = (nome: string) => string | undefined

/* ------------------------------------------------------------------ */
/* 1. O token do webhook                                              */
/* ------------------------------------------------------------------ */

/*
  ESTA É A PARTE MAIS SENSÍVEL DO MÓDULO INTEIRO. LEIA ANTES DE MEXER.

  O `authToken` do webhook é a ÚNICA coisa que separa um aviso do Asaas de
  alguém postando "parcela paga" na nossa URL pública: a URL de
  `asaas-webhook` tem `verify_jwt = false` por desenho, porque quem chama é o
  provedor, e provedor não carrega JWT. Quem apresentar o token certo no
  cabeçalho `asaas-access-token` consegue, pelo caminho da função, dar uma
  parcela como paga.

  E O HASH DESSE TOKEN É LEGÍVEL POR QUEM VÊ CONFIGURAÇÕES. Isso é decisão da
  0128, com precedente no `key_hash` da 0085: `webhook_token_hash` fica dentro
  do grant de tabela de `asaas_connections`, e a policy da 0126 deixa qualquer
  colaborador com `settings` ler a linha do próprio escritório. A 0128 escreve
  com todas as letras por que isso é inofensivo — sha256 não volta, e para
  forjar um aviso é preciso o token em TEXTO no cabeçalho — E DIZ QUAL É A
  CONDIÇÃO DESSA FRASE: o token tem de vir de gerador criptográfico.

  Token derivado de slug do escritório, de nome, de data, de uuid de tenant ou
  de qualquer coisa adivinhável quebra essa condição de um jeito que NENHUMA
  constraint pega. O check da coluna vê 64 caracteres hexadecimais e aprova; o
  `asaas_set_webhook` confere tamanho de 32 a 255 sem espaço e aprova. O hash
  legível passaria então a ser CONFIRMAÇÃO DE PALPITE: quem desconfiasse da
  regra de derivação testaria candidatos contra o hash que a própria tela
  mostra, offline, sem bater em servidor nenhum, e ao acertar teria o token em
  texto. Daí em diante ele baixa parcela de qualquer cliente daquele
  escritório.

  Por isso: 32 bytes de `crypto.getRandomValues` (CSPRNG dos dois runtimes),
  em hexadecimal, 64 caracteres — dentro da faixa de 32 a 255 que a doc do
  Asaas exige, e sem espaço, que ela também exige. Nada entra nesta função:
  ela não recebe parâmetro de propósito, para não haver onde enfiar semente.
*/
export function tokenDoWebhook(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/* ------------------------------------------------------------------ */
/* 2. Para onde a requisição vai                                      */
/* ------------------------------------------------------------------ */

/*
  AS DUAS BASES, E A HISTÓRIA DE COMO ELAS CHEGARAM AQUI.

  A primeira versão deste módulo trazia só a de sandbox, porque as três páginas
  usadas para escrevê-lo (criar webhook, criar cobrança, QR Code do PIX) listam
  apenas `https://api-sandbox.asaas.com` na definição OpenAPI. A de produção
  ficava num segredo obrigatório, e a função falhava alto sem ele.

  A base de produção ESTÁ documentada, e o lugar é outro:
  https://docs.asaas.com/docs/sandbox traz as duas numa tabela,
  `https://api-sandbox.asaas.com/v3` e `https://api.asaas.com/v3`, e a frase
  "Utilize sempre uma chave de Sandbox na URL de Sandbox e uma chave de
  Produção na URL de Produção". Conferido em 03/11/2026.

  As constantes aqui são a base SEM o `/v3`, porque é este módulo que monta o
  prefixo em cada rota. O valor da tabela inclui o `/v3`; a diferença é só onde
  a barra é colada.

  O SEGREDO CONTINUA EXISTINDO, e agora como override em vez de obrigação:
  serve para domínio próprio, proxy, ou o dia em que o Asaas mudar de host sem
  que este arquivo mude. Quando ele vem, ainda é obrigado a ser `https://`,
  porque `http://` mandaria a chave do caixa em texto claro pela rede.

  O QUE NÃO VOLTA: adivinhar. Nenhuma das duas constantes foi derivada da outra
  por troca de nome de host. Se um dia aparecer um terceiro ambiente, ele vem da
  documentação ou do segredo, não de padrão.
*/
export const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com'
export const ASAAS_PRODUCTION_BASE_URL = 'https://api.asaas.com'

export const SEGREDO_BASE_PRODUCAO = 'ASAAS_PRODUCTION_BASE_URL'
export const SEGREDO_URL_WEBHOOK = 'ASAAS_WEBHOOK_URL'

/* O prefixo é `/v3/`, e o cabeçalho da chave é `access_token` — não é
   `Authorization`, e essa é a confusão que a própria definição OpenAPI do
   Asaas provoca, porque lá o esquema de segurança tem o nome "Authorization"
   e o cabeçalho de verdade é outro. */
export const CABECALHO_DA_CHAVE = 'access_token'

export function baseDoAsaas(environment: AsaasEnvironment, lerSegredo: LeitorDeSegredo): string {
  if (environment === 'sandbox') return ASAAS_SANDBOX_BASE_URL

  const configurada = (lerSegredo(SEGREDO_BASE_PRODUCAO) ?? '').trim()

  /* Sem segredo, a base documentada. O segredo é override, não requisito. */
  if (configurada === '') return ASAAS_PRODUCTION_BASE_URL

  if (!configurada.startsWith('https://')) {
    /* http:// mandaria a chave do caixa em texto claro pela rede. */
    throw new Error('asaas_base_producao_invalida')
  }

  return semBarraFinal(configurada)
}

/*
  A URL DO WEBHOOK VEM DE CONFIGURAÇÃO, e os dois degraus abaixo são
  configuração — nenhum é palpite.

    1. `ASAAS_WEBHOOK_URL`, segredo próprio, é o valor explícito e tem
       precedência. É o degrau que serve quando a URL não é a da plataforma:
       domínio próprio na frente, proxy, ou o dia em que o webhook passar a
       entrar por outro caminho.
    2. `SUPABASE_URL` + `/functions/v1/asaas-webhook`. `SUPABASE_URL` é segredo
       injetado pela plataforma no ambiente da função, igual ao que
       `_shared/supabase.ts` já lê para montar o client — ou seja, é
       configuração, e não dedução nossa. O caminho `/functions/v1/<nome>` é o
       endereço que a própria plataforma publica para toda Edge Function, e é
       por ele que o frontend deste projeto chama todas as outras.

  POR QUE NÃO SÓ O DEGRAU 1: exigir o segredo tornaria "esqueci de definir" um
  modo de falha novo numa etapa que já tem muitos, e o sintoma seria o pior
  deles — a conexão liga, a cobrança sai, e nenhum aviso chega, com a parcela
  ficando aberta depois de o cliente pagar.

  POR QUE NÃO SÓ O DEGRAU 2: a função precisa poder ser alcançada por um
  endereço que não é o da plataforma sem ninguém ter que editar este arquivo.
*/
export function urlDoWebhook(lerSegredo: LeitorDeSegredo): string {
  const configurada = (lerSegredo(SEGREDO_URL_WEBHOOK) ?? '').trim()
  if (configurada !== '') return semBarraFinal(configurada)

  const projeto = (lerSegredo('SUPABASE_URL') ?? '').trim()
  if (projeto === '') throw new Error('asaas_url_webhook_ausente')

  return `${semBarraFinal(projeto)}/functions/v1/asaas-webhook`
}

function semBarraFinal(url: string): string {
  return url.replace(/\/+$/, '')
}

/* ------------------------------------------------------------------ */
/* 3. O webhook que a gente registra no Asaas                         */
/* ------------------------------------------------------------------ */

/*
  OS EVENTOS ASSINADOS. Sete, e a 0125 já os nomeia um por um no comentário de
  `event_name`: são os que a fase 1 trata. Os outros vinte e tantos eventos de
  cobrança do Asaas não entram porque evento assinado é evento que chega, e
  aviso que chega sem ninguém saber o que fazer com ele vira linha com
  `processing_error` — ruído na única coluna que o escritório lê.

  A ORDEM NÃO IMPORTA aqui, mas o conjunto importa: sem PAYMENT_CONFIRMED e
  PAYMENT_RECEIVED a parcela nunca baixa, e sem PAYMENT_DELETED o espelho
  continua afirmando que existe cobrança viva para uma parcela que foi liberada
  no painel do Asaas — e aí o índice único parcial da 0125 recusa a emissão
  seguinte sem motivo visível.
*/
export const EVENTOS_ASSINADOS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
] as const

export function corpoDoWebhook(entrada: {
  url: string
  authToken: string
  email: string
}): Record<string, unknown> {
  return {
    /* Nome visível no painel do Asaas do escritório. Precisa dizer de onde o
       webhook veio: quem abrir aquela tela daqui a um ano tem de saber que
       apagar isto quebra a baixa de parcela do sistema. */
    name: 'HausOne',
    url: entrada.url,

    /*
      `email` É OBRIGATÓRIO NA DOC e não tem valor óbvio do nosso lado. É o
      endereço que o Asaas avisa quando a fila do webhook é interrompida por
      acúmulo de falha, ou seja, é o aviso de que os avisos pararam. Vai o
      e-mail de quem clicou em conectar: é alguém com permissão de editar
      Configurações naquele escritório, que é exatamente quem religa a
      integração. Ver o comentário em asaas-connect sobre não ter base
      documentada para essa escolha.
    */
    email: entrada.email,

    /* Nasce ligado e não interrompido: webhook registrado e desligado é a
       integração parecendo pronta na tela e nenhum aviso chegando. */
    enabled: true,
    interrupted: false,

    /*
      SEQUENTIALLY, e isto é decisão de dinheiro.

      Com `NON_SEQUENTIALLY` o Asaas entrega em paralelo e sem garantia de
      ordem: PAYMENT_RECEIVED poderia chegar antes de PAYMENT_CONFIRMED da
      mesma cobrança, e o espelho terminaria com o status mais antigo. Com
      `SEQUENTIALLY` a fila é ordenada e, quando uma entrega falha, ela PARA em
      vez de seguir adiante — nenhum aviso é pulado em silêncio. Parar é o
      lado certo para errar: fila interrompida é visível (o Asaas avisa por
      e-mail), aviso pulado não é.
    */
    sendType: 'SEQUENTIALLY',

    /* O token que nós geramos. A doc aceita omitir e deixar o Asaas gerar, e
       aí o valor voltaria na resposta de criação — mas o fluxo da 0128 precisa
       do token ANTES, para gravar o hash, e um valor que só existe na resposta
       de uma chamada que pode dar timeout é um valor que pode se perder com a
       conexão. Gerar do nosso lado elimina esse caso. */
    authToken: entrada.authToken,

    /* Versão do payload que este módulo sabe ler: o corpo com `payment` no
       primeiro nível, que é o documentado para /v3. */
    apiVersion: 3,

    events: [...EVENTOS_ASSINADOS],
  }
}

/*
  O CORPO DA RENOVAÇÃO, QUE NÃO É O CORPO DA CRIAÇÃO.

  POR QUE EXISTE UMA SEGUNDA FUNÇÃO EM VEZ DE REUSAR A DE CIMA. A rota de
  alteração (`PUT /v3/webhooks/{id}`, conferida na doc em 03/11/2026) tem um
  esquema de corpo DIFERENTE do da criação: ela aceita `name`, `url`,
  `sendType`, `enabled`, `interrupted`, `authToken` e `events`, e NÃO aceita
  `email` nem `apiVersion` — os dois existem só na criação. Mandar campo que a
  rota não declara é pedir 400 numa chamada que existe justamente para
  consertar uma integração quebrada.

  E A DIFERENÇA É MAIOR DO QUE DOIS CAMPOS A MENOS: a doc da alteração diz
  "Omitted fields keep their current values". Então cada campo presente aqui é
  uma AFIRMAÇÃO sobre o estado final, e cada campo ausente é uma decisão de
  deixar como está.

  OS DOIS CAMPOS QUE SÃO O MOTIVO DO BOTÃO EXISTIR:

    `interrupted: false`  é o conserto. Com `sendType: 'SEQUENTIALLY'` o Asaas
                          PARA a fila quando uma entrega falha (ver o
                          comentário de `corpoDoWebhook`), e fila parada é o
                          estado em que o cliente paga e a parcela não baixa.
                          Nada do nosso lado religa isso sozinho.
    `enabled: true`       porque webhook desligado no painel do Asaas produz o
                          mesmo silêncio, e quem desligou para investigar pode
                          não ter religado.

  `authToken` É SEMPRE NOVO, E ISSO NÃO É ESCOLHA DE SEGURANÇA, É CONSEQUÊNCIA.
  O nosso banco guarda o SHA-256 do token, nunca o texto (0128), e a API do
  Asaas não devolve o token depois da criação — a resposta traz só
  `hasAuthToken`. Ou seja: ninguém, dos dois lados, consegue reapresentar o
  token antigo. Renovar o aviso é obrigatoriamente trocar o token, e o efeito
  colateral é bom: o botão também serve para rotacionar credencial.

  `url` VAI DE PROPÓSITO, mesmo quando não mudou. O endereço vem de
  configuração (`urlDoWebhook`), e um dos motivos reais de a fila interromper é
  o webhook apontar para um endereço que deixou de responder. Reafirmar o
  endereço atual conserta esse caso sem uma segunda chamada.

  `name` VAI PELO MESMO MOTIVO: webhook renomeado à mão no painel some do
  radar de quem for investigar depois.
*/
export function corpoDaRenovacaoDoWebhook(entrada: {
  url: string
  authToken: string
}): Record<string, unknown> {
  return {
    name: 'HausOne',
    url: entrada.url,
    enabled: true,
    interrupted: false,
    sendType: 'SEQUENTIALLY',
    authToken: entrada.authToken,
    events: [...EVENTOS_ASSINADOS],
  }
}

/*
  QUAIS WEBHOOKS DA CONTA APONTAM PARA NÓS.

  POR QUE ESTA FUNÇÃO EXISTE. Medido no sandbox em 03/11/2026, o
  `POST /v3/webhooks` recusa criar um segundo webhook com a mesma url e os
  mesmos eventos: "Já existe uma configuração para os eventos com os mesmos
  atributos. (invalid_object)". Então, quando o nosso lado não tem id e o
  webhook existe do lado deles, a única saída é ADOTAR o que está lá — e para
  adotar é preciso reconhecer.

  O RECONHECIMENTO É PELA URL, e não pelo nome. Nome é editável no painel do
  Asaas e não tem nenhuma garantia de unicidade; a url é o que define para onde
  o aviso vai, e é ela que o Asaas usa na regra de duplicidade que esta função
  existe para contornar.

  COMPARAÇÃO SEM A BARRA FINAL dos dois lados: `urlDoWebhook` já devolve sem, e
  um webhook cadastrado à mão pode ter sido salvo com. Mesma url com barra a
  mais não é outro destino, e tratá-la como outro destino levaria de volta ao
  400 de duplicidade.

  O QUE ELA NÃO FAZ: não escolhe. Devolve TODOS os que casam, em ordem, porque
  mais de um é um estado que quem chama precisa ver — cada webhook extra com a
  nossa url entrega o mesmo aviso com um token que o nosso banco não conhece, e
  isso é 401 por entrega até a fila ser interrompida por acúmulo de falha.
*/
export function webhooksComNossaUrl(json: unknown, url: string): string[] {
  const lista = (json as { data?: unknown })?.data
  if (!Array.isArray(lista)) return []

  const alvo = semBarraFinal(url.trim())

  return lista
    .filter((item) => {
      const dele = (item as { url?: unknown })?.url
      return typeof dele === 'string' && semBarraFinal(dele.trim()) === alvo
    })
    .map((item) => {
      const id = (item as { id?: unknown })?.id
      return typeof id === 'string' ? id.trim() : ''
    })
    .filter((id) => id !== '')
}

/* ------------------------------------------------------------------ */
/* 4. O corpo do POST de cobrança                                     */
/* ------------------------------------------------------------------ */

export function corpoDaCobranca(entrada: {
  customerId: string
  valor: number
  vencimento: string
  receivableId: string
  descricao: string
}): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    customer: entrada.customerId,

    /*
      UNDEFINED é o valor documentado para "o pagador escolhe entre as formas
      habilitadas na conta", e é o que dá UM link (`invoiceUrl`) onde o cliente
      decide entre PIX, boleto e cartão. Foi a decisão de produto: o escritório
      manda um link por WhatsApp e não escolhe pelo cliente.

      O cartão, nesse desenho, acontece DENTRO da página do Asaas. Nenhum dado
      de cartão passa pela nossa tela, e por isso nada deste sistema entra no
      escopo de PCI — que é o outro motivo de UNDEFINED, e não um formulário
      nosso com `billingType: 'CREDIT_CARD'`.
    */
    billingType: 'UNDEFINED',

    value: entrada.valor,

    /* YYYY-MM-DD, formato `date` da doc. `accounts_receivable.due_date` é
       `date` no Postgres e o PostgREST já devolve nesse formato — o
       `dataParaOAsaas` abaixo recusa qualquer outra coisa em vez de mandar um
       texto que o Asaas interpreta de um jeito que ninguém conferiu. */
    dueDate: dataParaOAsaas(entrada.vencimento),

    /*
      O id da parcela, de volta em todo evento daquela cobrança.

      É o que permite perguntar ao Asaas "esta cobrança já nasceu?" depois de um
      timeout, porque o POST de cobrança NÃO tem cabeçalho de idempotência (a
      0125 registra isso no comentário da coluna `external_reference`). Sem
      ele, "a resposta não chegou" é indistinguível de "a cobrança não foi
      criada", e repetir cobra o cliente duas vezes.
    */
    externalReference: entrada.receivableId,
  }

  /* `description` tem teto de 500 na doc. Cortar aqui é melhor do que levar
     400 do Asaas com a descrição inteira no corpo do erro. */
  const descricao = entrada.descricao.trim()
  if (descricao !== '') corpo.description = descricao.slice(0, 500)

  /*
    NEM `interest` NEM `fine` SAEM DAQUI, E A AUSÊNCIA É O PONTO.

    A doc avisa: se a conta do escritório tem configuração global de juros e
    multa, enviar esses objetos — inclusive nulos ou vazios — pode
    SOBRESCREVER aquela configuração para a cobrança nova. Ou seja, o jeito
    mais fácil de zerar a multa que o escritório configurou no painel do Asaas
    é "passar o campo vazio por completude".

    Juros e multa são fase 2, e é decisão do usuário (a 0125 diz isso no
    cabeçalho e nos comentários de `original_value` e `interest_value`: as
    colunas existem para o dado não ser perdido, e o que fazer com a diferença
    ainda não foi decidido). Até lá, quem manda é a configuração da conta, e
    este corpo não opina.

    `discount` fica fora pelo mesmo motivo.
  */

  return corpo
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function dataParaOAsaas(valor: string): string {
  const texto = (valor ?? '').trim()
  if (!DATA_ISO.test(texto)) throw new Error('asaas_vencimento_invalido')
  return texto
}

/* ------------------------------------------------------------------ */
/* 5. O vocabulário do Asaas traduzido para o nosso                   */
/* ------------------------------------------------------------------ */

/*
  `billingType` DELES PARA `payment_method` NOSSO (enum da 0040).

  O de/para é curto e o que ele NÃO cobre é a parte importante. O enum da 0040
  tem seis valores (pix, boleto, card, ted, cash, direct_debit) e o Asaas fala
  pelo menos sete palavras — a 0125 lista a divergência que já existe hoje:
  a criação aceita UNDEFINED, BOLETO, CREDIT_CARD e PIX, a resposta pode trazer
  DEBIT_CARD, TRANSFER e DEPOSIT, e o texto do webhook menciona
  RECEIVED_IN_CASH.

  VALOR QUE NÃO MAPEIA VIRA NULO, e não um palpite. `payment_method` é nulável
  em `accounts_receivable` justamente por isso, e nulo lê como "não sabemos por
  onde entrou" — que é a verdade. Chutar 'ted' para TRANSFER ou 'cash' para
  DEPOSIT escreveria no financeiro do escritório um fato que o Asaas não
  afirmou, e conciliação de extrato é onde isso apareceria, dias depois.

  UNDEFINED merece uma frase própria: ele é o que NÓS mandamos na criação, e
  significa "o cliente ainda não escolheu". Enquanto a cobrança está nesse
  estado não há forma de pagamento nenhuma, e por isso ele também é nulo. Na
  hora em que o cliente paga, o Asaas troca o `billingType` da cobrança pela
  forma que ele usou — e é o evento de pagamento que traz o valor que vale.
*/
const METODOS: Record<string, 'pix' | 'boleto' | 'card'> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'card',
  DEBIT_CARD: 'card',
}

export function metodoDePagamento(billingType: unknown): 'pix' | 'boleto' | 'card' | null {
  if (typeof billingType !== 'string') return null
  return METODOS[billingType.trim().toUpperCase()] ?? null
}

/*
  QUAIS EVENTOS BAIXAM A PARCELA. Dois, e a escolha tem motivo.

  CONFIRMED E RECEIVED NÃO SÃO A MESMA COISA: a 0125 registra a diferença no
  comentário de `status` — CONFIRMED é pago com o saldo ainda não liberado,
  RECEIVED é saldo disponível na conta do escritório. Entre os dois pode haver
  dias (boleto pago na sexta, liquidado na segunda).

  CONFIRMED JÁ BAIXA, e é orientação do usuário: o que o escritório quer saber
  é que o CLIENTE PAGOU. Esperar RECEIVED deixaria a parcela aberta durante o
  prazo do banco, e nesse intervalo alguém do escritório cobraria de novo um
  cliente que já pagou — o erro mais caro que esta fase pode produzir, porque
  ele acontece na frente do cliente.

  Quando o dinheiro fica disponível continua registrado, e sem precisar de
  outro evento para baixar: `credit_date` e `estimated_credit_date` no espelho
  da cobrança são exatamente isso, e a 0125 diz que são elas que explicam ao
  escritório por que a cobrança está paga e o saldo ainda não.

  RECEIVED CONTINUA NA LISTA porque não se pode depender de CONFIRMED ter
  chegado: cobrança paga em dinheiro pelo painel, ou pagamento que o Asaas
  liquida direto, pode produzir RECEIVED sem CONFIRMED antes. Os dois baixam, e
  a reentrega do segundo não baixa duas vezes porque a parcela só é tocada
  quando ainda não está paga.

  O QUE NÃO BAIXA, e por quê:
    PAYMENT_CREATED, PAYMENT_UPDATED  nada foi pago.
    PAYMENT_OVERDUE                   o atraso é estado DERIVADO neste sistema
                                      (view accounts_receivable_status, 0043),
                                      não coluna — não há o que escrever.
    PAYMENT_DELETED, PAYMENT_REFUNDED mexem no espelho da cobrança e NÃO
                                      reabrem a parcela. Ver o comentário em
                                      asaas-webhook: devolver dinheiro é
                                      decisão de financeiro, não de espelho.
*/
export const EVENTOS_QUE_BAIXAM = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'] as const

export function baixaAParcela(evento: unknown): boolean {
  if (typeof evento !== 'string') return false
  return (EVENTOS_QUE_BAIXAM as readonly string[]).includes(evento.trim().toUpperCase())
}

/*
  EM QUE DIA A PARCELA FOI PAGA, e são três datas diferentes disputando essa
  resposta.

  A 0125 separou `payment_date`, `client_payment_date` e `credit_date` em três
  colunas justamente porque são três fatos, "e usar uma pela outra da baixa no
  dia errado". Para `accounts_receivable.payment_date` a escolha é a do CLIENTE:
  `clientPaymentDate`, porque é ela que interessa ao cliente e ao contrato —
  "boleto pago na sexta e liquidado na segunda continua tendo sido pago na
  sexta" (0125). É também a data que o escritório vai confrontar com o
  comprovante que o cliente manda.

  `paymentDate` (liquidação) é o segundo degrau, e o dia do evento é o terceiro.
  O último recurso é hoje, no fuso do escritório, que quem chama passa como
  parâmetro — `new Date()` escondido aqui daria o dia do servidor, que roda em
  UTC e vira o dia seguinte depois das 21h.

  NUNCA NULO, e isso é constraint: o check
  `accounts_receivable_payment_date_matches_status_check` amarra `status =
  'paid'` a ter data, nos dois sentidos. Parcela paga sem data fica fora de todo
  relatório por período.
*/
export function dataDaBaixa(
  payment: Record<string, unknown>,
  payload: Record<string, unknown>,
  hojeNoEscritorio: string,
): string {
  return (
    dataOuNulo(payment.clientPaymentDate) ??
    dataOuNulo(payment.paymentDate) ??
    dataOuNulo(payload.dateCreated) ??
    hojeNoEscritorio
  )
}

/* ------------------------------------------------------------------ */
/* 6. O espelho da cobrança                                           */
/* ------------------------------------------------------------------ */

export type Espelho = Record<string, unknown>

/*
  A RESPOSTA DO ASAAS VIRANDO COLUNAS DA 0125.

  Duas regras valem para todos os campos, e as duas vêm de constraint do banco:

  1. CAMPO AUSENTE NÃO É CAMPO ZERADO. O que não vem na resposta sai como nulo,
     não como 0 nem como string vazia — `net_value` zero afirma que o Asaas não
     cobrou tarifa, e isso é uma mentira contável.

  2. OS CHECKS DE DINHEIRO DA 0125 SÃO DIFERENTES ENTRE SI, e este mapa
     respeita cada um: `value` e `original_value` exigem > 0, `net_value` e
     `interest_value` aceitam zero e recusam negativo. Por isso
     `original_value: 0` vindo do Asaas vira NULO em vez de derrubar a escrita
     com 23514 — e derrubar a escrita, no caminho do webhook, é a parcela não
     baixando.

  3. AS QUATRO COLUNAS `NOT NULL` SAEM DO MAPA QUANDO O CAMPO NÃO SERVE, em vez
     de sair nulas. `status`, `billing_type`, `due_date` e `value` são NOT NULL
     na 0125, e um `update` com nulo nelas é 23502 — ou seja, no caminho do
     webhook, O AVISO INTEIRO FALHANDO (e a parcela não baixando) por causa de
     um campo que o provedor deixou de mandar. Omitidas, o valor que já estava
     na linha fica de pé, que é o pior cenário aceitável.

     No caminho de CRIAÇÃO a ausência não pode passar — não há valor anterior
     para ficar de pé — e quem chama confere as quatro antes de gravar.
*/
export function espelhoDaCobranca(payment: Record<string, unknown>): Espelho {
  const espelho: Espelho = {
    net_value: numeroNaoNegativo(payment.netValue),
    original_value: numeroPositivo(payment.originalValue),
    interest_value: numeroNaoNegativo(payment.interestValue),

    original_due_date: dataOuNulo(payment.originalDueDate),
    payment_date: dataOuNulo(payment.paymentDate),
    client_payment_date: dataOuNulo(payment.clientPaymentDate),
    credit_date: dataOuNulo(payment.creditDate),
    estimated_credit_date: dataOuNulo(payment.estimatedCreditDate),

    invoice_url: texto(payment.invoiceUrl),
    bank_slip_url: texto(payment.bankSlipUrl),
    transaction_receipt_url: texto(payment.transactionReceiptUrl),
    invoice_number: texto(payment.invoiceNumber),

    /* `deleted` é NOT NULL e é o que o índice único parcial consulta: ausente
       lê como "viva", que é o estado de uma cobrança que acabou de nascer. */
    deleted: payment.deleted === true,

    asaas_installment_id: texto(payment.installment),
    asaas_installment_number: inteiroPositivo(payment.installmentNumber),

    /* Esta linha acabou de ser conferida contra o Asaas. A 0125 diz que é este
       carimbo que distingue espelho fresco de espelho que parou de receber
       aviso — "que na cobrança é a diferença entre conferir e adivinhar". */
    synced_at: new Date().toISOString(),
  }

  /* As quatro NOT NULL: entram só quando o campo serve. Ver o item 3 acima. */
  const status = texto(payment.status)
  if (status !== null) espelho.status = status

  const billingType = texto(payment.billingType)
  if (billingType !== null) espelho.billing_type = billingType

  const vencimento = dataOuNulo(payment.dueDate)
  if (vencimento !== null) espelho.due_date = vencimento

  const valor = numeroPositivo(payment.value)
  if (valor !== null) espelho.value = valor

  return espelho
}

/*
  As quatro colunas NOT NULL que o caminho de CRIAÇÃO exige. Sem elas o INSERT
  morre com 23502 e nome de coluna, e a cobrança já existe do lado do Asaas —
  então a recusa precisa ser uma frase, e antes da escrita.
*/
export function espelhoEstaCompleto(espelho: Espelho): boolean {
  return (
    typeof espelho.status === 'string' &&
    typeof espelho.billing_type === 'string' &&
    typeof espelho.due_date === 'string' &&
    typeof espelho.value === 'number'
  )
}

/* ------------------------------------------------------------------ */
/* 7. O PIX                                                           */
/* ------------------------------------------------------------------ */

/*
  QUANDO VALE A PENA PEDIR O QR CODE.

  A doc diz que o endpoint do QR Code serve cobrança PIX, BOLETO e UNDEFINED
  quando o PIX está disponível na conta. Cartão não tem copia e cola, e pedir
  mesmo assim gastaria uma requisição para receber 400 — e, pior, poria um erro
  no log de toda cobrança paga por cartão, que é o jeito mais rápido de o log
  parar de ser lido.

  Lista do que PODE ter, e não do que não pode: forma de pagamento nova do
  provedor cai no `false`, e o custo disso é um copia e cola não buscado (a
  cobrança já existe e o link de pagamento já serve PIX), não uma cobrança
  perdida.
*/
const COM_PIX = ['PIX', 'BOLETO', 'UNDEFINED']

export function pixDisponivel(billingType: unknown): boolean {
  if (typeof billingType !== 'string') return false
  return COM_PIX.includes(billingType.trim().toUpperCase())
}

/*
  A VALIDADE DO QR CODE, E O FUSO QUE A DOC NÃO DIZ.

  O exemplo da doc é "2022-06-24 23:59:59": sem `T`, sem offset e sem nenhuma
  frase dizendo em que fuso isso está. É a MESMA armadilha que a 0125 desarmou
  no `event_created_at`, só que lá a coluna pôde ser `timestamp` sem fuso e
  aqui `pix_expires_at` é `timestamptz` — então não tem como não escolher.

  A ESCOLHA É UTC, QUE É O LADO CONSERVADOR, e o raciocínio é por consequência:

    se o Asaas fala em hora de São Paulo e nós lemos como UTC, o sistema passa
    a achar que o código venceu TRÊS HORAS ANTES — esconde um copia e cola que
    ainda valia;

    se nós lêssemos como São Paulo e o Asaas falasse em UTC, o sistema mostraria
    por três horas um código JÁ VENCIDO. A 0125 diz com todas as letras o que
    acontece aí: "o cliente concluiria que o erro é dele". É exatamente a falha
    que a coluna existe para evitar.

  Esconder cedo demais custa um clique de reemissão; mostrar código morto custa
  a confiança do cliente do escritório na cobrança. Então UTC, que também é o
  que o Postgres faria com o texto cru, e no dia em que o fuso for confirmado
  com eles converte-se — igual à nota da 0125.

  Valor com `T` e offset (o dia em que eles ajustarem o formato) é respeitado
  como vem.
*/
const SEM_FUSO = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/

export function instanteDoPix(expirationDate: unknown): string | null {
  if (typeof expirationDate !== 'string') return null
  const bruto = expirationDate.trim()
  if (bruto === '') return null

  const semFuso = SEM_FUSO.exec(bruto)
  if (semFuso) return `${semFuso[1]}T${semFuso[2]}Z`

  const instante = new Date(bruto)
  if (Number.isNaN(instante.getTime())) return null
  return instante.toISOString()
}

/* ------------------------------------------------------------------ */
/* 8. O cliente sem documento                                         */
/* ------------------------------------------------------------------ */

/*
  O CASO QUE VAI ACONTECER DE VERDADE: em produção são 55 cadastros de cliente
  sem CPF nem CNPJ, e `cpfCnpj` é obrigatório no POST de cliente do Asaas.

  A RECUSA É NOSSA, E ANTES DA REDE, por dois motivos. O primeiro é que o Asaas
  recusa de qualquer forma, e a mensagem dele ("invalid_cpfCnpj" e parentes) não
  diz a quem clicou o que fazer. O segundo é que a tentativa gastaria o espelho:
  criar cliente sem documento, se um dia passasse, produziria um `cus_` que
  nunca fecha boleto nenhum.

  A MENSAGEM NOMEIA O CLIENTE de propósito. Quem clica em "gerar cobrança" está
  numa lista de parcelas, não na ficha do cliente, e "cadastro sem documento"
  sem nome manda a pessoa procurar qual dos clientes é. Com o nome, ela abre a
  ficha certa e resolve em um passo.

  A 0125 já tinha decidido de quem é essa recusa: "cliente sem documento não
  pode ser espelhado, e essa recusa é de quem chama a API, nao desta tabela".
  Aqui é "quem chama a API".
*/
export function recusaPorFaltaDeDocumento(nomeDoCliente: unknown): string {
  const nome = typeof nomeDoCliente === 'string' ? nomeDoCliente.trim() : ''
  const alvo = nome === '' ? 'Este cliente' : nome

  return `${alvo} está sem CPF ou CNPJ no cadastro, e o Asaas exige o documento para emitir a cobrança. Abra a ficha do cliente, preencha o documento e gere a cobrança de novo.`
}

/*
  A OUTRA RECUSA POR DOCUMENTO: a que vem DELES.

  Documento presente e INVÁLIDO é caso diferente de documento ausente, e mais
  provável do que parece: o Asaas confere dígito verificador de CPF e de CNPJ, e
  o banco de dev deste projeto tem doze clientes cujo documento passa pela
  máscara e não passa pelo dígito. A máscara do formulário não pega isso, então
  o primeiro lugar onde o escritório descobre é aqui.

  O NOME DO CLIENTE ENTRA PELO MESMO MOTIVO DA FUNÇÃO ACIMA, e a falta dele é
  tratada do mesmo jeito — era isso que faltava: a mensagem interpolava o nome
  cru, e cliente cadastrado sem nome produzia "recusou o cadastro de ." Frase
  quebrada numa tela de dinheiro faz quem lê duvidar do resto.

  A MENSAGEM NÃO AFIRMA QUAL CAMPO O ASAAS RECUSOU, e isso é deliberado: o 400
  deles pode ser do documento, do nome, ou de algo que a doc não lista. Dizer
  "o CPF está errado" quando o problema foi outro mandaria alguém conferir um
  campo que está certo. O que a frase faz é dizer onde olhar primeiro, porque é
  de longe o motivo mais comum.
*/
export function recusaDoAsaasAoCliente(nomeDoCliente: unknown, descricao?: string | null): string {
  const nome = typeof nomeDoCliente === 'string' ? nomeDoCliente.trim() : ''

  /* A abertura inteira troca, e não só o alvo: a regência muda com o nome ("de
     Marina" contra "deste cliente"), e trocar só a palavra produzia "de deste
     cliente". Pego pelo caso 151. */
  const abertura = nome === ''
    ? 'O Asaas recusou o cadastro deste cliente.'
    : `O Asaas recusou o cadastro de ${nome}.`

  /*
    A RAZÃO DELES VENCE A NOSSA, quando existe. Nossa segunda frase aponta para
    o documento, que é o motivo dominante (o Asaas confere dígito verificador e
    sete dos oito cadastros de teste falham nisso). Mas 400 no cadastro de
    cliente não é só documento, e mandar conferir o CPF quando o problema era
    outro faz a pessoa procurar erro onde não há.

    A frase deles já vem em português e completa, então entra inteira. A nossa
    fica para quando eles não disserem nada.
  */
  const motivo =
    typeof descricao === 'string' && descricao.trim() !== ''
      ? descricao.trim()
      : 'Confira na ficha do cliente se o CPF ou CNPJ está completo e correto, inclusive os dois últimos dígitos.'

  return `${abertura} ${motivo}`
}

/* ------------------------------------------------------------------ */
/* 9. De qual conta Asaas é este aviso                                */
/* ------------------------------------------------------------------ */

export type ConclusaoDaConta = {
  conclusao: 'confere' | 'divergente' | 'sem_dado'
  formato: 'objeto' | 'texto' | 'ausente'
  id: string | null
}

/*
  CONFERIR O `account` DO CORPO, E A ARMADILHA DELE.

  `account` É UM OBJETO: o exemplo da doc de webhook para cobranças traz
  `"account": {"id": "47ed0d25-...", "ownerId": null}`, e o id é um UUID, não um
  `acc_`. A 0125 conferiu isso em 03/11/2026 e a coluna gerada
  `asaas_account_id` extrai `payload -> 'account' ->> 'id'` exatamente por
  causa disso — com `payload ->> 'account'` ela guardaria o objeto serializado e
  a comparação nunca casaria, sem erro nenhum aparecer.

  AUSÊNCIA É "NÃO DÁ PARA CONFERIR", E NÃO "NÃO CASOU". A página de recebimento
  de eventos nem lista `account` entre os campos da notificação: ele aparece só
  no exemplo de cobranças. Tratar falta como divergência encheria a única coluna
  que o escritório lê (`last_error`) de alarme sobre um campo opcional.

  `account` EM TEXTO conclui o mesmo "não dá para conferir", e isso é escolha:
  o que se compara é `account.id`, e num texto esse caminho não existe. É também
  o que a coluna gerada do banco conclui (`->` sobre um escalar devolve nulo),
  e função que concluísse diferente da coluna faria o log e a tabela discordarem
  sobre o mesmo aviso. O `formato` sai no retorno para o log poder dizer QUAL
  dos dois casos de "sem dado" aconteceu — formato inesperado do provedor é
  notícia, campo opcional faltando não é.

  O QUE DIVERGÊNCIA SIGNIFICA, e por que ela não bloqueia o efeito: o aviso já
  foi autenticado pelo token (0128), e o efeito só alcança a cobrança daquele
  tenant — a busca é por (tenant_id, asaas_payment_id), então um pay_ de outro
  escritório simplesmente não encontra linha. Divergência aqui é sinal de
  CONFIGURAÇÃO TROCADA (a conta Asaas do escritório mudou, ou o webhook de uma
  conta aponta para a URL registrada com outra), e quem resolve isso é gente.
*/
export function conferirConta(
  payload: Record<string, unknown>,
  contaConhecida: string | null,
): ConclusaoDaConta {
  const bruto = payload.account

  if (typeof bruto === 'string') {
    return { conclusao: 'sem_dado', formato: 'texto', id: null }
  }

  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { conclusao: 'sem_dado', formato: 'ausente', id: null }
  }

  const id = texto((bruto as Record<string, unknown>).id)
  if (id === null) return { conclusao: 'sem_dado', formato: 'ausente', id: null }

  const conhecida = (contaConhecida ?? '').trim()
  /* Sem referência não há comparação: o primeiro aviso de um escritório é
     sempre este caso, e ele não é notícia. */
  if (conhecida === '') return { conclusao: 'sem_dado', formato: 'objeto', id }

  return { conclusao: id === conhecida ? 'confere' : 'divergente', formato: 'objeto', id }
}

/* ------------------------------------------------------------------ */
/* 10. Erros que querem dizer algo                                    */
/* ------------------------------------------------------------------ */

type ErroDeBanco = { code?: string | null; message?: string | null } | null | undefined

/*
  REENTREGA NÃO É ERRO, E CONFUNDIR AS DUAS COISAS CUSTA DINHEIRO DOS DOIS
  LADOS.

  A entrega do Asaas é at-least-once — a doc diz, com essas palavras, que o
  mesmo evento pode chegar mais de uma vez, e manda deduplicar pelo `id`. A
  0125 escolheu a constraint `asaas_webhook_events_asaas_event_id_key` para ser
  essa deduplicação, e escreveu por quê: é ela, "e não um `if` no código", que
  faz a segunda entrega falhar na GRAVAÇÃO em vez de baixar a parcela de novo.

  Então esta função existe para o 23505 daquela constraint virar 200 sem
  reprocessamento. Tratá-lo como falha faria o Asaas reentregar para sempre;
  reprocessar baixaria a parcela duas vezes.

  E O NOME DA CONSTRAINT É CONFERIDO, não só o código: 23505 nesta tabela
  também poderia vir da chave `(id, tenant_id)` num dia estranho, e aí "é
  reentrega" seria uma conclusão errada que apaga um aviso de verdade. Mesmo
  idioma de `src/lib/db-errors.ts`: o nome da constraint tem prioridade sobre o
  código.
*/
export function ehReentrega(erro: ErroDeBanco): boolean {
  if (!erro || erro.code !== '23505') return false
  return (erro.message ?? '').includes('asaas_webhook_events_asaas_event_id_key')
}

/*
  O 23505 do índice único PARCIAL da 0125: já existe cobrança VIVA para essa
  parcela. Quem clicou merece a frase, e não "duplicate key value violates
  unique constraint" com nome de índice no meio.
*/
export function ehCobrancaVivaDuplicada(erro: ErroDeBanco): boolean {
  if (!erro || erro.code !== '23505') return false
  return (erro.message ?? '').includes('asaas_charges_one_active_per_receivable_idx')
}

/* O mesmo pay_ gravado duas vezes. Não é duplicata de cobrança: é a MESMA
   cobrança chegando por dois caminhos (a criação que deu timeout e a consulta
   por externalReference depois). Quem chama lê a linha que já está lá. */
export function ehMesmoPagamento(erro: ErroDeBanco): boolean {
  if (!erro || erro.code !== '23505') return false
  return (erro.message ?? '').includes('asaas_charges_asaas_payment_id_key')
}

/*
  O erro do Asaas em uma linha curta, para log e para `last_error`.

  SÓ `code` E `description`, nunca o corpo inteiro: a resposta de erro deles
  repete o que foi enviado, e o que foi enviado inclui a chave no cabeçalho em
  algumas integrações e dados do cliente no corpo. Mesmo cuidado do
  `_shared/google.ts`.
*/
/*
  A FRASE QUE O ASAAS ESCREVEU, sozinha, para ser MOSTRADA a quem clicou.

  `erroDoAsaas` monta uma linha de LOG ("HTTP 400: ... (invalid_value)"), que é
  outra coisa: tem o status e o código, que não dizem nada a quem está olhando a
  tela. Esta devolve só a `description`, que é uma frase inteira em português,
  escrita pelo Asaas para o dono da conta.

  POR QUE ISSO IMPORTA, e custou um teste para aparecer: em 03/11/2026 uma
  emissão foi recusada com "O valor da cobrança excede o seu limite autorizado.
  Entre em contato com o suporte para aumentar o limite." e a tela mostrou
  "Confira o valor e a data de vencimento da parcela". A frase genérica mandava
  procurar no lugar errado, e a frase certa estava na resposta, sendo jogada
  fora. Quem lê não tinha como chegar ao motivo.

  NÃO É O CORPO INTEIRO: só `description` do primeiro erro, pelo mesmo motivo
  que `erroDoAsaas` também se limita a isso. A resposta de erro deles repete o
  que foi enviado.
*/
export function descricaoDoAsaas(corpo: unknown): string | null {
  const lista = (corpo as { errors?: unknown })?.errors
  if (!Array.isArray(lista) || lista.length === 0) return null

  const primeiro = lista[0] as { description?: unknown }
  return texto(primeiro?.description)
}

export function erroDoAsaas(status: number, corpo: unknown): string {
  const lista = (corpo as { errors?: unknown })?.errors
  if (Array.isArray(lista) && lista.length > 0) {
    const primeiro = lista[0] as { code?: unknown; description?: unknown }
    const descricao = texto(primeiro?.description)
    const codigo = texto(primeiro?.code)
    if (descricao !== null) return `HTTP ${status}: ${descricao}${codigo ? ` (${codigo})` : ''}`
    if (codigo !== null) return `HTTP ${status}: ${codigo}`
  }
  return `HTTP ${status} sem detalhe`
}

/* ------------------------------------------------------------------ */
/* 11. Leitores de campo                                              */
/* ------------------------------------------------------------------ */

/*
  O payload é de terceiro, e a doc do Asaas avisa duas vezes que atributos
  novos podem aparecer sem aviso prévio e que o código deve tolerar isso sem
  lançar exceção. Então nada aqui assume tipo: cada leitor devolve o valor
  utilizável ou nulo, e nenhum deles levanta nada.
*/

function texto(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor === 'string' && valor.trim() !== '') {
    const convertido = Number(valor)
    return Number.isFinite(convertido) ? convertido : null
  }
  return null
}

function numeroPositivo(valor: unknown): number | null {
  const lido = numero(valor)
  return lido !== null && lido > 0 ? lido : null
}

function numeroNaoNegativo(valor: unknown): number | null {
  const lido = numero(valor)
  return lido !== null && lido >= 0 ? lido : null
}

function inteiroPositivo(valor: unknown): number | null {
  const lido = numeroPositivo(valor)
  return lido !== null ? Math.trunc(lido) : null
}

/*
  Coluna `date` do Postgres só aceita data. Campo que vier como data e hora tem
  a hora cortada aqui em vez de virar 22007 na escrita — e, no caminho do
  webhook, 22007 na escrita é a parcela não baixando por causa de um campo que
  nem era o do pagamento.
*/
function dataOuNulo(valor: unknown): string | null {
  const bruto = texto(valor)
  if (bruto === null) return null
  const inicio = bruto.slice(0, 10)
  return DATA_ISO.test(inicio) ? inicio : null
}

/* Exportados para o teste poder conferir o de/para de cada campo sem rede. */
export const leitores = { texto, numero, numeroPositivo, numeroNaoNegativo, dataOuNulo }

/*
  `dateCreated` DO AVISO, E POR QUE ELE NÃO ENTRA CRU.

  `asaas_webhook_events.event_created_at` é `timestamp` (0125), e texto que não
  é data e hora viraria 22007 NA GRAVAÇÃO do evento. O passo seguinte do webhook
  trata falha de gravação como motivo de reentrega e responde 500, de propósito,
  porque aviso perdido é parcela que não baixa. Mas o 500 aqui seria eterno: a
  reentrega traz o MESMO corpo, que falha do mesmo jeito. E o webhook é
  registrado com `sendType: 'SEQUENTIALLY'`, então a fila de avisos daquele
  escritório para atrás do evento envenenado - inclusive os pagamentos que
  viriam depois.

  Um campo que nem é o do pagamento travando o caminho do dinheiro é troca
  ruim. Nulo é o que a coluna aceita (0125) e é a resposta honesta para "não
  entendi o que ele mandou".

  SÓ A FORMA DOCUMENTADA PASSA, e sem fuso: o exemplo da doc do Asaas é
  "2024-06-12 16:45:03". Data e hora COM offset é recusada aqui em vez de
  gravada, porque `timestamp` descarta o offset em silêncio - o valor nasceria
  deslocado com cara de dado exato, que é justamente o que a escolha de
  `timestamp` na 0125 existe para evitar.
*/
const DATA_E_HORA_DO_ASAAS =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?)?$/

export function dataEHoraDoAviso(valor: unknown): string | null {
  const bruto = texto(valor)
  if (bruto === null) return null

  const casa = DATA_E_HORA_DO_ASAAS.exec(bruto)
  if (casa === null) return null

  const [, ano, mes, dia, hora = '00', minuto = '00', segundo = '00'] = casa

  /* A regex aceita 2026-13-45: ela conta dígitos, não valida calendário. O
     ida e volta pelo Date pega mês 13, dia 31 em fevereiro e hora 25, que o
     Postgres recusaria com 22008 - mesmo 500 eterno, outro código. */
  const data = new Date(
    Date.UTC(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo),
    ),
  )

  const bate =
    data.getUTCFullYear() === Number(ano) &&
    data.getUTCMonth() === Number(mes) - 1 &&
    data.getUTCDate() === Number(dia) &&
    data.getUTCHours() === Number(hora) &&
    data.getUTCMinutes() === Number(minuto) &&
    data.getUTCSeconds() === Number(segundo)

  return bate ? bruto : null
}
