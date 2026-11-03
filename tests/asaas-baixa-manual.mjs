// Quando a baixa manual de uma parcela precisa perguntar antes.
//
// COMO RODAR
//   npm run test:asaas-baixa
//
// POR QUE ESTE ARQUIVO EXISTE
//   "Marcar como Pago" baixa a parcela aqui e NÃO cancela a cobrança no Asaas.
//   O link continua na mão do cliente, então a parcela fecha no sistema e o
//   cliente paga de novo pelo link. O protótipo aprovado tapa esse buraco com
//   uma pergunta, e a pergunta só tem valor se aparecer nos casos certos.
//
//   OS DOIS ERROS SÃO CAROS, E EM DIREÇÕES OPOSTAS:
//
//     não perguntar quando devia   cobra o cliente duas vezes;
//     perguntar quando não devia   manda cancelar uma cobrança JÁ PAGA, e esse
//                                  é o caminho normal do escritório enquanto o
//                                  aviso de pagamento não está registrado (o
//                                  cliente pagou, a parcela não baixou sozinha,
//                                  e alguém baixa à mão).
//
//   Nada mais cobra isto: o TypeScript aceita qualquer `string` em `status`,
//   porque a coluna é `text` na 0125 de propósito — o Asaas pode acrescentar
//   valor sem avisar.
//
// O QUE ELE NÃO PROVA
//   Que a tela abre o diálogo. Isso é leitura de AccountsReceivable.tsx. Aqui é
//   só a decisão.

import {
  cobrancaAindaAceitaPagamento,
  cobrancaQueAindaPodeSerPaga,
} from '../src/features/asaas/baixa-manual.ts'

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

console.log('\n1. A cobrança ainda aceita pagamento?\n')

ok('01  PENDING aceita', cobrancaAindaAceitaPagamento('PENDING'))
ok('02  OVERDUE aceita', cobrancaAindaAceitaPagamento('OVERDUE'))
ok('03  AWAITING_RISK_ANALYSIS aceita', cobrancaAindaAceitaPagamento('AWAITING_RISK_ANALYSIS'))

/* Os dois que baixam a parcela: o cliente já pagou, e mandar cancelar seria
   desfazer dinheiro que entrou. */
ok('04  CONFIRMED não aceita mais', !cobrancaAindaAceitaPagamento('CONFIRMED'))
ok('05  RECEIVED não aceita mais', !cobrancaAindaAceitaPagamento('RECEIVED'))
ok('06  RECEIVED_IN_CASH não aceita mais', !cobrancaAindaAceitaPagamento('RECEIVED_IN_CASH'))
ok('07  DUNNING_RECEIVED não aceita mais', !cobrancaAindaAceitaPagamento('DUNNING_RECEIVED'))
ok('08  REFUNDED não aceita mais', !cobrancaAindaAceitaPagamento('REFUNDED'))
ok('09  CHARGEBACK_REQUESTED não aceita mais', !cobrancaAindaAceitaPagamento('CHARGEBACK_REQUESTED'))

/* DUNNING_REQUESTED é negativação PEDIDA: a cobrança segue aberta, e o cliente
   ainda pode pagar. Está de fora da lista dos fechados de propósito. */
ok('10  DUNNING_REQUESTED continua aceitando', cobrancaAindaAceitaPagamento('DUNNING_REQUESTED'))

/*
  O CASO QUE A LISTA INVERTIDA EXISTE PARA PEGAR. `status` é `text`, e enumerar
  os ABERTOS faria um status novo do Asaas cair em "não pergunta" — o lado caro
  de errar. Enumerando os FECHADOS, status novo cai em "pergunta".
*/
ok('11  status que o Asaas inventar amanhã faz perguntar', cobrancaAindaAceitaPagamento('PAYMENT_IN_SOME_NEW_STATE'))
ok('12  nulo faz perguntar', cobrancaAindaAceitaPagamento(null))
ok('13  vazio faz perguntar', cobrancaAindaAceitaPagamento(''))

/* Minúscula e espaço na ponta não podem virar outro status: o valor vem do
   provedor e ninguém promete o recorte. */
ok('14  minúscula é o mesmo status', !cobrancaAindaAceitaPagamento('received'))
ok('15  espaço na ponta é o mesmo status', !cobrancaAindaAceitaPagamento('  CONFIRMED  '))

console.log('\n2. Esta parcela precisa de confirmação?\n')

const PARCELA = 'rec-1'
const OUTRA = 'rec-2'

const mapa = new Map([
  [PARCELA, { receivable_id: PARCELA, status: 'PENDING', asaas_payment_id: 'pay_aberta' }],
  [OUTRA, { receivable_id: OUTRA, status: 'RECEIVED', asaas_payment_id: 'pay_paga' }],
])

/* Devolve a cobrança inteira, e não um booleano: o diálogo mostra o
   `asaas_payment_id` para quem for cancelar no painel do Asaas saber qual é. */
eq(
  '16  parcela com cobrança aberta devolve a cobrança',
  { receivable_id: PARCELA, status: 'PENDING', asaas_payment_id: 'pay_aberta' },
  cobrancaQueAindaPodeSerPaga(mapa, PARCELA),
)
eq(
  '17  parcela com cobrança já paga devolve nulo',
  null,
  cobrancaQueAindaPodeSerPaga(mapa, OUTRA),
)
eq(
  '18  parcela sem cobrança nenhuma devolve nulo',
  null,
  cobrancaQueAindaPodeSerPaga(mapa, 'rec-sem-cobranca'),
)

/*
  ENQUANTO A CONSULTA NÃO VOLTOU, o mapa é `undefined` e a resposta é nulo: o
  clique baixa sem perguntar. É decisão, não esquecimento — travar o item do
  menu enquanto carrega atrasaria o caminho comum (parcela sem cobrança) por
  causa do raro. O custo está escrito no hook.
*/
eq('19  mapa ainda carregando devolve nulo', null, cobrancaQueAindaPodeSerPaga(undefined, PARCELA))

console.log(`\n${passed} passaram, ${failed} falharam\n`)
process.exit(failed === 0 ? 0 : 1)
