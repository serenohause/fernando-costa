// O que a tela de cobrança DECIDE, sem React e sem rede.
//
// COMO RODAR
//   npm run test:asaas-cobranca
//
// POR QUE ESTE ARQUIVO EXISTE
//   As funções conferidas aqui traduzem o que o Asaas respondeu em palavra de
//   tela, cor e número de dinheiro. Nenhuma delas é coberta pelo TypeScript,
//   por três motivos diferentes:
//
//     `status` e `billing_type` são `text` na 0125 de propósito, porque o
//     provedor acrescenta valor sem avisar. Qualquer mapa sobre eles é um mapa
//     incompleto por desenho, e o que importa é como ele erra.
//
//     a TAXA não é coluna: é `value - net_value`, e `net_value` é nulo até o
//     Asaas dizer qual foi o líquido. Nulo tem de virar "linha não aparece", e
//     nunca zero. Zero é um número que alguém leva para a conciliação.
//
//     a RECUSA da emissão tem a frase escrita pelo servidor e a cor decidida
//     aqui. Pintar de vermelho o que é falta de um dado, ou de âmbar o que é
//     dinheiro parado, troca o sentido da tela sem mudar uma palavra.
//
// O QUE ELE NÃO PROVA
//   Nada de layout, e nada do que depende de navegador: o painel, a folha de
//   baixo no celular, o `matchMedia`. Também não prova as consultas, que são
//   RLS e estão conferidas contra o banco de dev à mão.
//
//   E não prova o EMBRULHO `recusaDaEmissao`, que vive em `cobranca.ts`: ele
//   reconhece um `EdgeFunctionError` e chama uma das duas funções abaixo.
//   Reconhecer obriga a importar `@/lib/edge-functions`, que arrasta o client do
//   Supabase e o `import.meta.env` do Vite, e nada disso roda no Node. São três
//   linhas, cobertas pelo typecheck; o que decide está aqui.

import {
  pagoEm,
  pixVencido,
  primeiroNome,
  RECUSA_SEM_SERVIDOR,
  recusaDoServidor,
  situacaoDaCobranca,
  taxaDoAsaas,
} from '../src/features/asaas/situacao.ts'

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

const ok = (name, condicao) => eq(name, true, condicao === true)

/* O mínimo que as funções leem. Cada caso sobrescreve o que lhe interessa. */
const cobranca = (extra) => ({
  receivable_id: 'rec-1',
  asaas_payment_id: 'pay_1',
  status: 'PENDING',
  billing_type: 'UNDEFINED',
  value: 9500,
  net_value: null,
  due_date: '2027-01-18',
  payment_date: null,
  client_payment_date: null,
  deleted: false,
  pix_expires_at: null,
  ...extra,
})

console.log('\n1. Em que situação está a cobrança\n')

eq('01  PENDING é "aguardando"', 'Aguardando pagamento', situacaoDaCobranca(cobranca({})).rotulo)
eq('02  e a palavra curta do celular', 'Aguardando', situacaoDaCobranca(cobranca({})).linhaCurta)
eq('03  OVERDUE fica vermelha', 'rose', situacaoDaCobranca(cobranca({ status: 'OVERDUE' })).familia)

/*
  CONFIRMED e RECEIVED os dois baixam a parcela, e os dois são verdes, mas as
  palavras são diferentes porque o escritório sente a diferença no extrato:
  CONFIRMED é pago com saldo em liberação, RECEIVED é saldo disponível.
*/
eq(
  '04  CONFIRMED diz que o saldo ainda não caiu',
  'Pago, saldo em liberação',
  situacaoDaCobranca(cobranca({ status: 'CONFIRMED' })).rotulo,
)
eq('05  RECEIVED é só "recebido"', 'Recebido', situacaoDaCobranca(cobranca({ status: 'RECEIVED' })).rotulo)
eq(
  '06  os dois contam como paga',
  ['paga', 'paga'],
  ['CONFIRMED', 'RECEIVED'].map((status) => situacaoDaCobranca(cobranca({ status })).desfecho),
)

/* RECEIVED_IN_CASH não está em EVENTOS_QUE_BAIXAM: a cobrança pode estar
   recebida lá com a parcela aberta aqui, então a palavra não pode ser a mesma
   das outras duas. */
eq(
  '07  RECEIVED_IN_CASH tem palavra própria',
  'Recebido em dinheiro',
  situacaoDaCobranca(cobranca({ status: 'RECEIVED_IN_CASH' })).rotulo,
)

eq(
  '08  REFUNDED é estorno, e estorno não é "aberta"',
  'estornada',
  situacaoDaCobranca(cobranca({ status: 'REFUNDED' })).desfecho,
)

/*
  O CASO QUE ESTE ARQUIVO EXISTE PARA GUARDAR: palavra nova do provedor.

  Ela sai CRUA e em cinza neutro, nunca como erro e nunca traduzida por palpite.
  Com a palavra na tela, quem olhar consegue procurar o que ela significa; com
  um "Desconhecido" genérico, não.
*/
const nova = situacaoDaCobranca(cobranca({ status: 'PAYMENT_AWAITING_SOMETHING_NEW' }))
eq('09  status novo aparece como veio', 'PAYMENT_AWAITING_SOMETHING_NEW', nova.rotulo)
eq('10  em cinza, não em vermelho', 'neutral', nova.familia)
/* E o desfecho dele vem da MESMA lista que decide se "Marcar como Pago"
   pergunta antes (baixa-manual.ts): status que ninguém conhece conta como
   aberto, porque é o lado barato de errar. */
eq('11  status novo conta como aberta', 'aberta', nova.desfecho)
eq(
  '12  status novo que o Asaas fechou conta como encerrada',
  'encerrada',
  situacaoDaCobranca(cobranca({ status: 'CHARGEBACK_DISPUTE' })).desfecho,
)

/* Minúscula e espaço vindos do provedor não podem virar "status novo". */
eq(
  '13  minúscula é o mesmo status',
  'Recebido',
  situacaoDaCobranca(cobranca({ status: 'received' })).rotulo,
)
eq(
  '14  espaço na ponta também',
  'Recebido',
  situacaoDaCobranca(cobranca({ status: '  RECEIVED  ' })).rotulo,
)

/* `deleted` é outra pergunta: a cobrança não está em situação nenhuma, ela não
   existe mais lá. Vence o status, inclusive um status pago. */
eq(
  '15  removida no Asaas vence o status',
  'Removida no Asaas',
  situacaoDaCobranca(cobranca({ status: 'RECEIVED', deleted: true })).rotulo,
)

console.log('\n2. A taxa do Asaas, que não é coluna\n')

eq('16  taxa é valor menos líquido', 189.54, taxaDoAsaas(cobranca({ net_value: 9310.46 })))
/* O caso que importa: líquido nulo devolve NULO, e a linha sai da tela. Zero
   afirmaria que a cobrança foi de graça. */
eq('17  líquido nulo não vira taxa zero', null, taxaDoAsaas(cobranca({ net_value: null })))
ok('18  e nulo não é zero', taxaDoAsaas(cobranca({ net_value: null })) !== 0)
/* `net_value` aceita zero no banco (o check da 0125 é diferente do de
   `original_value`), e aí a taxa é o valor inteiro. */
eq('19  líquido zero é taxa cheia, não ausência', 9500, taxaDoAsaas(cobranca({ net_value: 0 })))

console.log('\n3. Em que dia o cliente pagou\n')

/* A data do CLIENTE manda: boleto pago na sexta e liquidado na segunda continua
   tendo sido pago na sexta (0125). */
eq(
  '20  a data do cliente vence a liquidação',
  '2026-11-17',
  pagoEm(cobranca({ client_payment_date: '2026-11-17', payment_date: '2026-11-18' })),
)
eq('21  sem ela, a liquidação', '2026-11-18', pagoEm(cobranca({ payment_date: '2026-11-18' })))
/* Cartão no sandbox devolveu `paymentDate` nulo: sem nenhuma das duas, a linha
   "Pago em" não aparece em vez de mostrar hoje. */
eq('22  sem as duas, nulo', null, pagoEm(cobranca({})))

console.log('\n4. O copia e cola do PIX vence\n')

const AGORA = new Date('2026-11-03T12:00:00Z')

ok('23  validade no passado está vencida', pixVencido(cobranca({ pix_expires_at: '2026-11-02T23:59:59Z' }), AGORA))
ok('24  validade no futuro não está', !pixVencido(cobranca({ pix_expires_at: '2028-01-18T23:59:59Z' }), AGORA))
/* Cobrança sem PIX não tem código para vencer. */
ok('25  sem validade não está vencida', !pixVencido(cobranca({ pix_expires_at: null }), AGORA))
ok('26  validade impossível não derruba a tela', !pixVencido(cobranca({ pix_expires_at: 'qualquer coisa' }), AGORA))

console.log('\n5. A recusa da emissão\n')

const recusa = (code, message) => recusaDoServidor(code, message)

/*
  ÂMBAR É "FALTA UM DADO, NADA QUEBROU". VERMELHO É "HÁ PENDÊNCIA REAL". Trocar
  os dois muda o sentido da tela sem mudar uma palavra: o caso número um deste
  módulo é cliente sem CPF, que é cadastro incompleto e não falha de sistema.
*/
const semDoc = recusa(
  'client_without_document',
  'Marina Albuquerque está sem CPF ou CNPJ no cadastro, e o Asaas exige o documento para emitir a cobrança. Abra a ficha do cliente, preencha o documento e gere a cobrança de novo.',
)
eq('27  cliente sem documento é âmbar', 'warn', semDoc.tom)
eq('28  e leva até a ficha do cliente', true, semDoc.abrirFichaDoCliente)
/* O título é a primeira frase da mensagem do servidor, e o resto é o apoio: as
   mensagens de asaas-charge são escritas em duas frases, a primeira dizendo o
   que houve e a segunda o que fazer. */
ok('29  o título nomeia o cliente', semDoc.titulo.includes('Marina Albuquerque'))
ok('30  e o texto diz o que fazer', semDoc.texto.includes('Abra a ficha do cliente'))
/* A letra miúda existe porque a pergunta seguinte de quem lê é sobre dinheiro. */
ok('31  a letra miúda diz que nada foi cobrado', semDoc.rodape.includes('Nada foi cobrado'))

/* O irmão: documento presente e com dígito verificador errado. Recusa do Asaas,
   depois da rede, e a letra miúda é diferente por isso. */
const docInvalido = recusa(
  'asaas_customer_rejected',
  'O Asaas recusou o cadastro de Marina Albuquerque. Confira na ficha do cliente se o CPF ou CNPJ está completo e correto, inclusive os dois últimos dígitos.',
)
eq('32  documento inválido também é âmbar', 'warn', docInvalido.tom)
eq('33  e também leva à ficha', true, docInvalido.abrirFichaDoCliente)
ok('34  a letra miúda dele é a outra', docInvalido.rodape.includes('não chegou a ser criada'))

/* Falha de sistema é vermelha e NÃO manda ninguém abrir ficha de cliente. */
const timeout = recusa('asaas_timeout', 'O Asaas não respondeu. A cobrança não foi criada; tente de novo em instantes.')
eq('35  timeout é vermelho', 'error', timeout.tom)
eq('36  e não aponta para o cliente', false, timeout.abrirFichaDoCliente)
eq('37  nem tem letra miúda própria', null, timeout.rodape)

eq('38  parcela já paga é âmbar', 'warn', recusa('receivable_already_paid', 'Esta parcela já está marcada como paga. Cobrar de novo pediria o valor outra vez ao cliente.').tom)
eq('39  conta não ligada é âmbar', 'warn', recusa('asaas_not_connected', 'A conta Asaas do escritório não está ligada. Ligue em Configurações antes de gerar cobranças.').tom)
eq('40  chave recusada é vermelho', 'error', recusa('asaas_invalid_api_key', 'O Asaas recusou a API Key do escritório. Reconectar.').tom)

/*
  O QUE NÃO CHEGOU A SER RESPOSTA. `invokeEdgeFunction` só traduz em
  `EdgeFunctionError` o que o servidor respondeu; rede cortada levanta erro cru
  do supabase-js, com mensagem em inglês. É a única frase desta tela que não vem
  do servidor, e ela não pode sair em inglês.
*/
const semServidor = RECUSA_SEM_SERVIDOR
eq('41  rede cortada tem frase em português', 'Não foi possível falar com o servidor', semServidor.titulo)
eq('42  e é vermelha', 'error', semServidor.tom)
ok('43  e diz que a cobrança não foi gerada', semServidor.texto.includes('não foi gerada'))
/* Nenhuma das duas sai sem frase: faixa vazia numa tela de dinheiro é pior do
   que mensagem feia. */
ok('44  as duas recusas sempre têm título', RECUSA_SEM_SERVIDOR.titulo.length > 0 && recusa('internal_error', 'Falhou.').titulo.length > 0)

console.log('\n6. O primeiro nome, para a frase caber\n')

eq('45  primeiro nome de nome composto', 'Marina', primeiroNome('Marina Albuquerque Rezende'))
eq('46  nome único é ele mesmo', 'Beatriz', primeiroNome('Beatriz'))
/* Cadastro sem nome não pode produzir frase quebrada: é o mesmo cuidado que a
   recusaDoAsaasAoCliente tem no servidor. */
eq('47  nome vazio devolve vazio', '', primeiroNome('   '))
eq('48  nome nulo também', '', primeiroNome(null))

console.log(`\n${passed} passaram, ${failed} falharam\n`)
process.exit(failed === 0 ? 0 : 1)
