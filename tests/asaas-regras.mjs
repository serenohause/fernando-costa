// As decisões da integração com o Asaas que não dependem de rede
// (migrations 0125, 0126 e 0128).
//
// COMO RODAR
//   npm run test:asaas
//
// POR QUE ELE EXISTE AGORA, antes de a chave existir
//   A chave do sandbox do escritório ainda não foi criada, e a decisão do
//   usuário foi escrever as três Edge Functions agora e conferir contra o Asaas
//   de verdade quando ela chegar. Então tudo o que DECIDE está em
//   supabase/functions/_shared/asaas.ts, puro e sem rede, e é aqui que se prova
//   que decide certo.
//
// O QUE ELE PROVA, e por que estas coisas e não outras
//   1. O TOKEN DO WEBHOOK tem 64 hexadecimais e dois tokens seguidos são
//      diferentes. É prova fraca de aleatoriedade — e é de propósito: ela não
//      mede entropia, ela pega o erro que de fato aconteceria, que é alguém
//      derivar o token de slug, data ou id de escritório. A 0128 deixa o HASH
//      do token legível para quem vê Configurações, e escreve que essa decisão
//      só é inofensiva se o token vier de CSPRNG. Nenhuma constraint cobra isso;
//      este teste é o que sobrou.
//
//   2. O DE/PARA DE billingType PARA O ENUM payment_method (0040), INCLUINDO O
//      QUE NÃO MAPEIA. Chutar 'ted' para TRANSFER escreveria no financeiro do
//      escritório um fato que o Asaas não afirmou, e nulo é o que a coluna
//      aceita justamente para isso.
//
//   3. QUAIS EVENTOS BAIXAM A PARCELA. É a regra mais cara do módulo: baixar no
//      evento errado dá parcela como paga sem dinheiro, e não baixar deixa o
//      escritório cobrando de novo quem já pagou.
//
//   4. O CORPO DO POST DE COBRANÇA SAI SEM `interest` E SEM `fine`. A doc avisa
//      que enviá-los, mesmo nulos ou vazios, pode SOBRESCREVER a configuração
//      global de juros e multa da conta do escritório. "Completar" o corpo
//      apagaria configuração de dinheiro de terceiros.
//
//   5. A RECUSA DE CLIENTE SEM DOCUMENTO, com o nome dele na mensagem. São 55
//      cadastros assim em produção: é o caminho mais percorrido da função.
//
//   6. O CONFERIDOR DE CONTA nos três casos do campo `account`: objeto (o
//      documentado), texto e ausente. Ausência é "não dá para conferir", nunca
//      "não casou".
//
//   7. A URL BASE POR AMBIENTE, inclusive a FALHA ALTA quando produção não tem
//      configuração. A doc do Asaas não traz a base de produção, e adivinhar
//      por padrão de nome mandaria a chave do caixa do escritório para um host
//      que ninguém conferiu.
//
//   8. REENTREGA DEDUZIDA PELO NOME DA CONSTRAINT, e não só pelo código. 23505
//      de outra constraint tratado como reentrega apagaria um aviso de verdade
//      em silêncio.
//
//   9. O ESPELHO DA COBRANÇA RESPEITANDO AS CONSTRAINTS DA 0125: as quatro
//      colunas NOT NULL saem do mapa quando o campo não vem (no webhook o mapa
//      é UPDATE, e nulo ali é 23502 — o aviso falhando e a parcela não
//      baixando), e os checks de dinheiro, que são diferentes entre si
//      (`original_value` exige > 0, `net_value` aceita zero).
//
// O QUE ELE NÃO PROVA
//   Nada de rede: nenhuma requisição ao Asaas acontece aqui, e nenhuma resposta
//   real foi vista ainda. Os corpos usados nos casos abaixo vêm dos exemplos da
//   documentação, não de uma conta. Também não prova RLS nem privilégio: isso é
//   supabase/tests/asaas-rls.sql e supabase/tests/asaas-conexao.sql. E não
//   prova que a Edge Function chama estas funções na ordem certa — isso é
//   leitura dos três index.ts.

import {
  ASAAS_PRODUCTION_BASE_URL,
  ASAAS_SANDBOX_BASE_URL,
  baixaAParcela,
  baseDoAsaas,
  conferirConta,
  corpoDaCobranca,
  corpoDoWebhook,
  dataDaBaixa,
  ehCobrancaVivaDuplicada,
  ehReentrega,
  espelhoDaCobranca,
  espelhoEstaCompleto,
  EVENTOS_ASSINADOS,
  instanteDoPix,
  metodoDePagamento,
  pixDisponivel,
  recusaPorFaltaDeDocumento,
  tokenDoWebhook,
  urlDoWebhook,
} from '../supabase/functions/_shared/asaas.ts'

let passed = 0
let failed = 0

function eq(name, esperado, observado) {
  const a = JSON.stringify(esperado)
  const b = JSON.stringify(observado)
  if (a === b) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}\n        esperado=${a}\n        observado=${b}`)
  }
}

/* Afirmar DIFERENCA, para o caso em que o perigo e os dois valores virarem o
   mesmo: base de producao caindo na de sandbox nao seria pego por um `eq`. */
function neq(name, naoEsperado, observado) {
  const a = JSON.stringify(naoEsperado)
  const b = JSON.stringify(observado)
  if (a !== b) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}\n        nao podia ser=${a}\n        observado=${b}`)
  }
}

function ok(name, condicao) {
  eq(name, true, condicao === true)
}

function levanta(name, fn, mensagemEsperada) {
  try {
    fn()
    failed += 1
    console.log(`FAIL  ${name}\n        esperado=erro ${mensagemEsperada}\n        observado=nenhum erro`)
  } catch (erro) {
    eq(name, mensagemEsperada, erro.message)
  }
}

console.log('\n1. O token do webhook\n')

const token = tokenDoWebhook()

eq('1  tem 64 caracteres', 64, token.length)
ok('2  só hexadecimal minúsculo', /^[0-9a-f]{64}$/.test(token))
/* O check da coluna (0128) é exatamente este formato, e asaas_set_webhook
   recusa token com espaço ou fora de 32 a 255 caracteres. */
ok('3  sem espaço, que o Asaas recusa', !/\s/.test(token))
ok('4  dentro da faixa de 32 a 255 da doc', token.length >= 32 && token.length <= 255)

/* A prova fraca que pega o erro forte: token derivado de qualquer coisa fixa do
   escritório sairia igual duas vezes. */
const outro = tokenDoWebhook()
ok('5  dois tokens seguidos são diferentes', token !== outro)

/* Vinte de uma vez, para o caso de alguém derivar de algo que muda devagar
   (data do dia, hora, contador de módulo). */
const vinte = new Set(Array.from({ length: 20 }, () => tokenDoWebhook()))
eq('6  vinte tokens seguidos, vinte valores distintos', 20, vinte.size)

console.log('\n2. billingType do Asaas para payment_method do projeto\n')

eq('7   PIX', 'pix', metodoDePagamento('PIX'))
eq('8   BOLETO', 'boleto', metodoDePagamento('BOLETO'))
eq('9   CREDIT_CARD', 'card', metodoDePagamento('CREDIT_CARD'))
eq('10  DEBIT_CARD também é card', 'card', metodoDePagamento('DEBIT_CARD'))

/*
  OS QUE NÃO MAPEIAM, e cada um por um motivo diferente.

  UNDEFINED é o que NÓS mandamos na criação: significa "o cliente ainda não
  escolheu", então não há forma de pagamento para registrar.
  TRANSFER, DEPOSIT e RECEIVED_IN_CASH são palavras do Asaas que o enum da 0040
  não tem (a 0125 registra a divergência). Nulo é a verdade: "não sabemos por
  onde entrou".
*/
eq('11  UNDEFINED é nulo, não é palpite', null, metodoDePagamento('UNDEFINED'))
eq('12  TRANSFER é nulo', null, metodoDePagamento('TRANSFER'))
eq('13  DEPOSIT é nulo', null, metodoDePagamento('DEPOSIT'))
eq('14  RECEIVED_IN_CASH é nulo', null, metodoDePagamento('RECEIVED_IN_CASH'))
eq('15  forma de pagamento nova do provedor é nula', null, metodoDePagamento('CRIPTO_QUALQUER'))
eq('16  ausente é nulo', null, metodoDePagamento(undefined))
eq('17  nulo é nulo', null, metodoDePagamento(null))

console.log('\n3. Quais eventos baixam a parcela\n')

eq('18  PAYMENT_CONFIRMED baixa (o cliente pagou)', true, baixaAParcela('PAYMENT_CONFIRMED'))
eq('19  PAYMENT_RECEIVED baixa (saldo disponível)', true, baixaAParcela('PAYMENT_RECEIVED'))

eq('20  PAYMENT_CREATED não baixa', false, baixaAParcela('PAYMENT_CREATED'))
eq('21  PAYMENT_UPDATED não baixa', false, baixaAParcela('PAYMENT_UPDATED'))
eq('22  PAYMENT_OVERDUE não baixa', false, baixaAParcela('PAYMENT_OVERDUE'))
eq('23  PAYMENT_DELETED não baixa', false, baixaAParcela('PAYMENT_DELETED'))
eq('24  PAYMENT_REFUNDED não baixa', false, baixaAParcela('PAYMENT_REFUNDED'))

/* Eventos que o módulo nem assina, por garantia: se um dia a lista crescer,
   nenhum deles pode entrar na baixa sem alguém decidir. */
eq('25  PAYMENT_BANK_SLIP_VIEWED não baixa', false, baixaAParcela('PAYMENT_BANK_SLIP_VIEWED'))
eq('26  PAYMENT_AWAITING_RISK_ANALYSIS não baixa', false, baixaAParcela('PAYMENT_AWAITING_RISK_ANALYSIS'))
eq('27  PAYMENT_CHECKOUT_VIEWED não baixa', false, baixaAParcela('PAYMENT_CHECKOUT_VIEWED'))
eq('28  evento inventado não baixa', false, baixaAParcela('PAGOU_SIM'))
eq('29  ausente não baixa', false, baixaAParcela(undefined))

/* Os sete da 0125, nem um a mais nem um a menos: sem CONFIRMED e RECEIVED a
   parcela nunca baixa, e sem DELETED o espelho afirma cobrança viva para uma
   parcela que foi liberada no painel do Asaas. */
eq('30  os sete eventos assinados', [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
], [...EVENTOS_ASSINADOS])

/* Todo evento que baixa tem de estar assinado — regra que baixa parcela sem o
   evento chegar não serve para nada. */
ok(
  '31  os dois que baixam estão entre os assinados',
  ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].every((e) => EVENTOS_ASSINADOS.includes(e)),
)

console.log('\n4. O corpo do POST de cobrança\n')

const corpo = corpoDaCobranca({
  customerId: 'cus_000005219613',
  valor: 1250.5,
  vencimento: '2026-11-20',
  receivableId: '8f14e45f-ceea-467a-9f1d-1e1e1e1e1e1e',
  descricao: 'Parcela 3/12 - Projeto Residencial',
})

eq('32  customer', 'cus_000005219613', corpo.customer)
/* UNDEFINED é o valor documentado para "o pagador escolhe entre as formas
   habilitadas", e é o que dá UM link onde o cliente escolhe PIX, boleto ou
   cartão. Cartão não passa pela nossa tela, para não entrar no escopo de PCI. */
eq('33  billingType é UNDEFINED', 'UNDEFINED', corpo.billingType)
eq('34  value', 1250.5, corpo.value)
eq('35  dueDate em YYYY-MM-DD', '2026-11-20', corpo.dueDate)
eq('36  externalReference é o id da parcela', '8f14e45f-ceea-467a-9f1d-1e1e1e1e1e1e', corpo.externalReference)
eq('37  description é a da parcela', 'Parcela 3/12 - Projeto Residencial', corpo.description)

/*
  AS DUAS AUSÊNCIAS QUE IMPORTAM. `in` e não comparação com undefined: o perigo
  é a CHAVE existir no JSON, mesmo valendo null, porque é isso que sobrescreve a
  configuração global de juros e multa da conta do escritório.
*/
ok('38  NÃO manda interest', !('interest' in corpo))
ok('39  NÃO manda fine', !('fine' in corpo))
ok('40  NÃO manda discount', !('discount' in corpo))
ok('41  nem como chave nula no JSON serializado', !JSON.stringify(corpo).includes('interest'))

eq('42  só os seis campos decididos', [
  'billingType',
  'customer',
  'description',
  'dueDate',
  'externalReference',
  'value',
], Object.keys(corpo).sort())

/* Vencimento que não é data recusa aqui, e não no Asaas: texto que eles
   interpretam de um jeito que ninguém conferiu vira cobrança com vencimento
   errado, e vencimento errado em boleto é documento na mão do cliente. */
levanta(
  '43  vencimento fora de YYYY-MM-DD é recusado',
  () => corpoDaCobranca({
    customerId: 'cus_1',
    valor: 10,
    vencimento: '20/11/2026',
    receivableId: 'x',
    descricao: '',
  }),
  'asaas_vencimento_invalido',
)

/* Parcela sem descrição não manda `description` vazio: campo vazio no Asaas
   aparece no boleto como linha em branco. */
const semDescricao = corpoDaCobranca({
  customerId: 'cus_1',
  valor: 10,
  vencimento: '2026-11-20',
  receivableId: 'x',
  descricao: '   ',
})
ok('44  descrição em branco não vira campo vazio', !('description' in semDescricao))

console.log('\n5. O webhook que a gente registra\n')

const webhook = corpoDoWebhook({
  url: 'https://projeto.supabase.co/functions/v1/asaas-webhook',
  authToken: token,
  email: 'diretor@escritorio.com.br',
})

eq('45  url do aviso', 'https://projeto.supabase.co/functions/v1/asaas-webhook', webhook.url)
eq('46  authToken é o que nós geramos', token, webhook.authToken)
eq('47  nasce ligado', true, webhook.enabled)
eq('48  nasce não interrompido', false, webhook.interrupted)
/* Ordem garantida: RECEIVED chegando antes de CONFIRMED deixaria o espelho com
   o status mais antigo. E fila que para é visível; aviso pulado não é. */
eq('49  sendType SEQUENTIALLY', 'SEQUENTIALLY', webhook.sendType)
eq('50  assina os sete eventos', 7, webhook.events.length)

console.log('\n6. Cliente sem documento\n')

const recusa = recusaPorFaltaDeDocumento('Marina Albuquerque')

ok('51  a mensagem nomeia o cliente', recusa.includes('Marina Albuquerque'))
ok('52  diz o que fazer', recusa.includes('Abra a ficha do cliente'))
ok('53  diz quem exige', recusa.includes('Asaas'))
ok('54  cita o documento pelos dois nomes', recusa.includes('CPF') && recusa.includes('CNPJ'))

/* Cliente sem nome no cadastro não produz frase quebrada ("  está sem CPF"). */
ok('55  sem nome, a frase continua inteira', recusaPorFaltaDeDocumento('').startsWith('Este cliente está sem'))
ok('56  nome nulo também', recusaPorFaltaDeDocumento(null).startsWith('Este cliente está sem'))

console.log('\n7. De qual conta Asaas é o aviso\n')

const CONTA = '47ed0d25-7b1c-4a2e-9a2e-0f00e1a1b2c3'

/* O caso documentado: `account` é um OBJETO, e o id dele é um UUID. */
eq(
  '57  account objeto que casa',
  { conclusao: 'confere', formato: 'objeto', id: CONTA },
  conferirConta({ account: { id: CONTA, ownerId: null } }, CONTA),
)
eq(
  '58  account objeto que NÃO casa é divergência',
  { conclusao: 'divergente', formato: 'objeto', id: 'outra-conta' },
  conferirConta({ account: { id: 'outra-conta', ownerId: null } }, CONTA),
)
/* Primeiro aviso do escritório: há id no corpo e não há com o que comparar. */
eq(
  '59  account objeto sem referência nossa é "não dá para conferir"',
  { conclusao: 'sem_dado', formato: 'objeto', id: CONTA },
  conferirConta({ account: { id: CONTA } }, null),
)

/*
  `account` EM TEXTO. Conclui "não dá para conferir", e o formato sai no retorno
  para o log dizer qual dos dois casos foi. É também o que a coluna gerada da
  0125 conclui (`payload -> 'account' ->> 'id'` sobre um escalar é nulo):
  função que concluísse diferente da coluna faria log e tabela discordarem
  sobre o mesmo aviso.
*/
eq(
  '60  account em texto não é divergência',
  { conclusao: 'sem_dado', formato: 'texto', id: null },
  conferirConta({ account: CONTA }, CONTA),
)

/* AUSÊNCIA É "NÃO DÁ PARA CONFERIR", NUNCA "NÃO CASOU": a página de recebimento
   de eventos do Asaas nem lista `account`. */
eq(
  '61  account ausente não é divergência',
  { conclusao: 'sem_dado', formato: 'ausente', id: null },
  conferirConta({ event: 'PAYMENT_RECEIVED' }, CONTA),
)
eq(
  '62  account nulo não é divergência',
  { conclusao: 'sem_dado', formato: 'ausente', id: null },
  conferirConta({ account: null }, CONTA),
)
eq(
  '63  account objeto sem id não é divergência',
  { conclusao: 'sem_dado', formato: 'ausente', id: null },
  conferirConta({ account: { ownerId: null } }, CONTA),
)

console.log('\n8. A URL base, por ambiente\n')

const semSegredo = () => undefined
const comProducao = (nome) =>
  nome === 'ASAAS_PRODUCTION_BASE_URL' ? 'https://api.exemplo-asaas.com' : undefined

/* Sandbox é a única base que a documentação traz. */
eq('64  sandbox usa a base documentada', 'https://api-sandbox.asaas.com', baseDoAsaas('sandbox', semSegredo))
eq('65  e a constante é essa', 'https://api-sandbox.asaas.com', ASAAS_SANDBOX_BASE_URL)

/*
  PRODUÇÃO TAMBÉM TEM BASE DOCUMENTADA, e a tabela de
  https://docs.asaas.com/docs/sandbox é a fonte. O caso existe para que uma
  troca futura desse valor seja deliberada: constante errada aqui manda a chave
  do caixa do escritório para o host errado.

  O QUE ESTE CASO NÃO PODE VIRAR: cair no sandbox quando produção não estiver
  configurada. Aí a cobrança de produção nasceria num ambiente de teste, o
  cliente receberia um link que não cobra nada e o escritório acharia que
  cobrou. Por isso o 66 compara com a base de PRODUÇÃO e o 66b afirma que as
  duas são diferentes.
*/
eq('66  produção sem segredo usa a base documentada', 'https://api.asaas.com', baseDoAsaas('production', semSegredo))
eq('66b e ela é a constante de produção', ASAAS_PRODUCTION_BASE_URL, baseDoAsaas('production', semSegredo))
neq('66c produção nunca cai no sandbox', ASAAS_SANDBOX_BASE_URL, baseDoAsaas('production', semSegredo))
eq('67  segredo faz override da base de produção', 'https://api.exemplo-asaas.com', baseDoAsaas('production', comProducao))

/* Barra final duplicaria a barra da rota (`//v3/payments`). */
eq(
  '68  barra final do segredo é aparada',
  'https://api.exemplo-asaas.com',
  baseDoAsaas('production', () => 'https://api.exemplo-asaas.com/'),
)
/* http:// mandaria a chave do caixa em texto claro pela rede. */
levanta(
  '69  base de produção sem https é recusada',
  () => baseDoAsaas('production', () => 'http://api.exemplo-asaas.com'),
  'asaas_base_producao_invalida',
)
eq(
  '70  segredo em branco cai na base documentada, nao em erro',
  'https://api.asaas.com',
  baseDoAsaas('production', () => '   '),
)

console.log('\n9. A URL do aviso\n')

eq(
  '71  o segredo próprio tem precedência',
  'https://cobranca.hausone.com.br/asaas',
  urlDoWebhook((nome) => (nome === 'ASAAS_WEBHOOK_URL' ? 'https://cobranca.hausone.com.br/asaas' : 'https://projeto.supabase.co')),
)
eq(
  '72  sem ele, a URL da própria função neste projeto',
  'https://projeto.supabase.co/functions/v1/asaas-webhook',
  urlDoWebhook((nome) => (nome === 'SUPABASE_URL' ? 'https://projeto.supabase.co' : undefined)),
)
levanta('73  sem nenhuma das duas, falha alto', () => urlDoWebhook(semSegredo), 'asaas_url_webhook_ausente')

console.log('\n10. Reentrega, e o que não é reentrega\n')

/*
  A DEDUÇÃO MAIS PERIGOSA DO MÓDULO. Se ela der falso para a reentrega, o Asaas
  reentrega para sempre; se der verdadeiro para outro 23505, um aviso de verdade
  é descartado em silêncio e a parcela não baixa.
*/
ok('74  23505 na chave do id do evento é reentrega', ehReentrega({
  code: '23505',
  message:
    'duplicate key value violates unique constraint "asaas_webhook_events_asaas_event_id_key"',
}))

/* 23505 de OUTRA constraint da mesma tabela NÃO é reentrega: é aviso novo que
   não conseguiu entrar, e tratá-lo como duplicata o apagaria. */
ok('75  23505 de outra constraint não é reentrega', !ehReentrega({
  code: '23505',
  message: 'duplicate key value violates unique constraint "asaas_webhook_events_id_tenant_id_key"',
}))
ok('76  23503 não é reentrega', !ehReentrega({
  code: '23503',
  message: 'insert or update on table "asaas_webhook_events" violates foreign key constraint',
}))
ok('77  erro sem código não é reentrega', !ehReentrega({ message: 'boom' }))
ok('78  ausência de erro não é reentrega', !ehReentrega(null))
ok('79  undefined não é reentrega', !ehReentrega(undefined))

/* O índice único PARCIAL da 0125: já existe cobrança VIVA para a parcela. */
ok('80  o índice de cobrança viva é reconhecido', ehCobrancaVivaDuplicada({
  code: '23505',
  message:
    'duplicate key value violates unique constraint "asaas_charges_one_active_per_receivable_idx"',
}))
ok('81  e não se confunde com reentrega de evento', !ehReentrega({
  code: '23505',
  message:
    'duplicate key value violates unique constraint "asaas_charges_one_active_per_receivable_idx"',
}))

console.log('\n11. O espelho da cobrança\n')

/* Corpo no formato do exemplo da doc, recortado nos campos que viram coluna. */
const pago = {
  id: 'pay_080225913252',
  status: 'RECEIVED',
  billingType: 'PIX',
  value: 1250.5,
  netValue: 1245.01,
  originalValue: null,
  interestValue: null,
  dueDate: '2026-11-20',
  originalDueDate: '2026-11-20',
  paymentDate: '2026-11-18',
  clientPaymentDate: '2026-11-17',
  creditDate: '2026-11-18',
  estimatedCreditDate: '2026-11-18',
  invoiceUrl: 'https://www.asaas.com/i/080225913252',
  bankSlipUrl: null,
  transactionReceiptUrl: 'https://www.asaas.com/comprovantes/123',
  invoiceNumber: '00012345',
  deleted: false,
  installment: null,
  installmentNumber: null,
}

const espelho = espelhoDaCobranca(pago)

eq('82  status como o Asaas escreve', 'RECEIVED', espelho.status)
eq('83  billing_type como o Asaas escreve', 'PIX', espelho.billing_type)
eq('84  value', 1250.5, espelho.value)
eq('85  net_value, que é o que conciliará o extrato', 1245.01, espelho.net_value)
eq('86  client_payment_date é quando o CLIENTE pagou', '2026-11-17', espelho.client_payment_date)
eq('87  payment_date é quando o Asaas liquidou', '2026-11-18', espelho.payment_date)
eq('88  invoice_url, que é o link que vai por WhatsApp', 'https://www.asaas.com/i/080225913252', espelho.invoice_url)
eq('89  deleted ausente lê como cobrança viva', false, espelhoDaCobranca({ status: 'PENDING' }).deleted)

/*
  OS CHECKS DE DINHEIRO DA 0125 SÃO DIFERENTES ENTRE SI, e o espelho respeita
  cada um: `original_value` exige > 0 e `net_value` aceita zero. Zero vindo em
  `originalValue` precisa virar NULO, senão a escrita morre com 23514 — e 23514
  no caminho do webhook é a parcela não baixando.
*/
eq('90  originalValue zero vira nulo (check exige > 0)', null, espelhoDaCobranca({ originalValue: 0 }).original_value)
eq('91  netValue zero fica zero (check aceita)', 0, espelhoDaCobranca({ netValue: 0 }).net_value)
eq('92  interestValue zero fica zero', 0, espelhoDaCobranca({ interestValue: 0 }).interest_value)
eq('93  valor negativo não entra', null, espelhoDaCobranca({ netValue: -1 }).net_value)
/* Campo ausente é nulo, nunca zero: net_value zero afirmaria que o Asaas não
   cobrou tarifa, e isso é uma mentira contável. */
eq('94  netValue ausente é nulo, não zero', null, espelhoDaCobranca({}).net_value)
/* `value` fora do mapa quando não é usável: no webhook o valor antigo fica de
   pé em vez de o aviso inteiro falhar por um campo. */
ok('95  value zero não entra no espelho', !('value' in espelhoDaCobranca({ value: 0 })))
/* Data com hora cortada aqui em vez de virar 22007 numa coluna `date`. */
eq('96  data com hora é cortada', '2026-11-18', espelhoDaCobranca({ paymentDate: '2026-11-18 10:32:00' }).payment_date)
eq('97  data impossível é nula', null, espelhoDaCobranca({ paymentDate: 'ontem' }).payment_date)
/* A imagem base64 do QR Code não é guardada (0125): dezenas de KB por linha. */
ok('98  nenhuma coluna de imagem no espelho', !('encodedImage' in espelho) && !('pix_image' in espelho))

/*
  AS QUATRO COLUNAS NOT NULL SAEM DO MAPA QUANDO O CAMPO NÃO VEM, e esta é a
  diferença entre um aviso que falha e um aviso que se aplica. No caminho do
  webhook o mapa vira UPDATE: `due_date: null` numa coluna NOT NULL é 23502, o
  efeito inteiro falha e A PARCELA NÃO BAIXA — por causa de um campo que nem é o
  do pagamento. Omitido, o valor que já estava na linha fica de pé.
*/
const incompleto = espelhoDaCobranca({ netValue: 10 })
ok('99   status ausente sai do mapa (NOT NULL)', !('status' in incompleto))
ok('100  billing_type ausente sai do mapa (NOT NULL)', !('billing_type' in incompleto))
ok('101  due_date ausente sai do mapa (NOT NULL)', !('due_date' in incompleto))
ok('102  value ausente sai do mapa (NOT NULL)', !('value' in incompleto))
/* O que é nulável continua entrando como nulo: ausência é informação ali. */
eq('103  e o que é nulável entra como nulo', null, incompleto.original_due_date)

/* No caminho de CRIAÇÃO a ausência não pode passar: não há valor anterior para
   ficar de pé, e o INSERT morreria com 23502 depois de a cobrança já existir no
   Asaas. */
eq('104  espelho completo passa', true, espelhoEstaCompleto(espelho))
eq('105  espelho sem as quatro não passa', false, espelhoEstaCompleto(incompleto))
eq('106  faltando só o vencimento, não passa', false, espelhoEstaCompleto(
  espelhoDaCobranca({ ...pago, dueDate: null }),
))

console.log('\n12. O PIX\n')

eq('107  cobrança UNDEFINED pode ter PIX', true, pixDisponivel('UNDEFINED'))
eq('108  cobrança PIX pode ter PIX', true, pixDisponivel('PIX'))
eq('109  boleto também (a doc diz que serve)', true, pixDisponivel('BOLETO'))
eq('110  cartão não tem copia e cola', false, pixDisponivel('CREDIT_CARD'))
eq('111  forma desconhecida não é buscada', false, pixDisponivel('TRANSFER'))

/*
  A VALIDADE DO QR CODE, E O FUSO QUE A DOC NÃO DIZ. O exemplo é
  "2022-06-24 23:59:59", sem offset. Lido como UTC, que é o lado CONSERVADOR:
  errar para "venceu antes" esconde um código que ainda valia (custa um clique),
  e errar para "ainda vale" mostra código morto — e a 0125 diz o que acontece
  nesse caso: "o cliente concluiria que o erro é dele".
*/
eq('112  validade sem fuso é lida como UTC', '2022-06-24T23:59:59Z', instanteDoPix('2022-06-24 23:59:59'))
eq('113  validade com T também', '2022-06-24T23:59:59Z', instanteDoPix('2022-06-24T23:59:59'))
eq('114  validade com offset é respeitada', '2022-06-25T02:59:59.000Z', instanteDoPix('2022-06-24T23:59:59-03:00'))
eq('115  validade ausente é nula', null, instanteDoPix(undefined))
eq('116  validade impossível é nula', null, instanteDoPix('qualquer coisa'))

console.log('\n13. Em que dia a parcela foi paga\n')

const HOJE = '2026-11-03'

/* A data do CLIENTE manda: boleto pago na sexta e liquidado na segunda continua
   tendo sido pago na sexta (0125). */
eq('117  clientPaymentDate manda', '2026-11-17', dataDaBaixa(pago, {}, HOJE))
eq(
  '118  sem ela, a liquidação',
  '2026-11-18',
  dataDaBaixa({ paymentDate: '2026-11-18' }, {}, HOJE),
)
eq(
  '119  sem as duas, o dia do evento',
  '2026-11-19',
  dataDaBaixa({}, { dateCreated: '2026-11-19 16:45:03' }, HOJE),
)
/* Nunca nulo: o check da 0041 amarra status 'paid' a ter data, nos dois
   sentidos. Parcela paga sem data fica fora de todo relatório por período. */
eq('120  sem nenhuma, hoje no fuso do escritório', HOJE, dataDaBaixa({}, {}, HOJE))

console.log(`\n${passed} passaram, ${failed} falharam\n`)
process.exit(failed === 0 ? 0 : 1)
