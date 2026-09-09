// A frase que a tela mostra quando uma escrita falha.
//
// COMO RODAR
//   npm run test:db-errors
//
// POR QUE ESTE ARQUIVO EXISTE
//   `describeDatabaseError` é o único caminho entre um erro de banco e o texto
//   que a pessoa lê. Ele tem quatro degraus — Zod, WriteError, nome de
//   constraint, código SQLSTATE — e um último recurso genérico. Um degrau que
//   falta não quebra nada: a frase genérica aparece no lugar da certa, a tela
//   continua funcionando, e ninguém descobre até alguém relatar "deu erro e não
//   disse o quê".
//
//   Foi exatamente o que aconteceu com o WriteError. Ele não tem `code` nem nome
//   de constraint — a mensagem dele JÁ É a frase de tela —, então atravessava a
//   função inteira sem casar com nada. Os 125 pontos que o lançam
//   (`assertRowAffected` e as traduções de erro de função) tinham a frase certa
//   escrita e descartada na última linha.
//
//   O sintoma que chegou: "Gerar Parcelas" do contrato 0730, com valor total
//   R$ 0,00, respondeu "Não foi possível concluir a operação. Se continuar,
//   avise o suporte." O banco havia dito `total_value_not_positive`, e a
//   tradução dessa mensagem existe desde a migration 0044.
//
// O QUE ESTE TESTE NÃO COBRE
//   A frase genérica em si não é testada como texto: mudar a redação dela é
//   decisão de produto, não regressão. O que se testa é QUANDO ela aparece —
//   só quando não há nada melhor a dizer.

import { describeDatabaseError, WriteError, assertRowAffected } from '../src/lib/db-errors.ts'

let passed = 0
let failed = 0

function check(name, ok, detail) {
  if (ok) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name} — ${detail}`)
  }
}

function eq(name, esperado, observado) {
  check(name, esperado === observado, `esperado=${JSON.stringify(esperado)} observado=${JSON.stringify(observado)}`)
}

const GENERICA = 'Não foi possível concluir a operação. Se continuar, avise o suporte.'

console.log('\nTradução de erro de banco em frase de tela\n')

// 1. WriteError — o degrau que faltava ---------------------------------------

eq(
  '1.1  WriteError chega inteiro à tela',
  'O valor total do contrato precisa ser maior que zero.',
  describeDatabaseError(new WriteError('O valor total do contrato precisa ser maior que zero.')),
)

/* O caso do relato: a mensagem sobrevive mesmo sem mapa nenhum da feature. */
eq(
  '1.2  e sobrevive sem mapa da feature',
  'As parcelas deste contrato já foram geradas. Nenhuma parcela nova foi criada.',
  describeDatabaseError(
    new WriteError('As parcelas deste contrato já foram geradas. Nenhuma parcela nova foi criada.'),
  ),
)

/* `assertRowAffected` é a origem mais comum: RLS que não alcança a linha em
   UPDATE/DELETE não levanta erro, devolve zero linhas. */
let capturado = null
try {
  assertRowAffected([], 'A etapa não foi alterada. É preciso permissão de edição em Configurações.')
} catch (erro) {
  capturado = erro
}
eq(
  '1.3  a frase de assertRowAffected chega à tela',
  'A etapa não foi alterada. É preciso permissão de edição em Configurações.',
  describeDatabaseError(capturado),
)

check(
  '1.4  CONTROLE: assertRowAffected não reclama quando a linha existe',
  (() => {
    try {
      assertRowAffected([{ id: 'x' }], 'não deveria aparecer')
      return true
    } catch {
      return false
    }
  })(),
  'lançou com linha afetada',
)

// 2. Os outros degraus continuam de pé ---------------------------------------
//
//    O WriteError entrou ANTES da busca por constraint e por código. Estes casos
//    são o que impede que ele tenha atropelado os degraus seguintes.

eq(
  '2.1  nome de constraint vence o código',
  'Já existe um cliente com esse telefone.',
  describeDatabaseError(
    { code: '23505', message: 'duplicate key value violates unique constraint "clients_tenant_id_phone_key"' },
    { clients_tenant_id_phone_key: 'Já existe um cliente com esse telefone.', '23505': 'Duplicado.' },
  ),
)

eq(
  '2.2  código SQLSTATE quando não há nome de constraint',
  'Você não tem permissão para executar esta ação.',
  describeDatabaseError({ code: '42501', message: 'new row violates row-level security policy' }),
)

eq(
  '2.3  a feature sobrepõe o código padrão',
  'Sem permissão de edição em Configurações.',
  describeDatabaseError({ code: '42501', message: 'x' }, { '42501': 'Sem permissão de edição em Configurações.' }),
)

// 3. A frase genérica, e só quando não há nada melhor -------------------------

eq(
  '3.1  código desconhecido cai na genérica',
  GENERICA,
  describeDatabaseError({ code: 'PGRST200', message: 'could not find relationship' }),
)

eq('3.2  erro nulo cai na genérica', GENERICA, describeDatabaseError(null))

/*
  O erro CRU do Postgres nunca vaza para a tela: o texto dele descreve o schema
  (nome de coluna, de constraint, de tabela) para quem estiver sondando.
*/
check(
  '3.3  o texto cru do Postgres não vaza na frase',
  !describeDatabaseError({ code: '42703', message: 'column "senha_temporaria" does not exist' }).includes(
    'senha_temporaria',
  ),
  'nome de coluna apareceu na frase de tela',
)

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
