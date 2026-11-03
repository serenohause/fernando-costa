// Seed de clientes COM DOCUMENTO VALIDO, para testar a emissao de cobranca.
//
// COMO RODAR
//   npm run seed:asaas
//   Depende do seed 1 (precisa do escritorio de teste).
//
// POR QUE ELE EXISTE
//   Dos oito clientes com documento no banco de teste, SETE tem digito
//   verificador errado. Eles passam pela mascara do formulario e sao recusados
//   pelo Asaas, que confere o digito. Ou seja: antes deste arquivo, o unico
//   cliente do banco em que "Gerar cobranca" chegava ao fim era a Beatriz, e so
//   porque o CPF dela foi corrigido a mao em 03/11/2026.
//
//   Isso tornava impossivel testar o CAMINHO FELIZ sem esbarrar no caminho da
//   recusa. Os dois precisam ser testaveis, e de proposito: este seed deixa
//   documentos validos E mantem os invalidos que ja existem, porque a tela de
//   recusa (secao 16 do prototipo) e o caminho mais percorrido em producao.
//
// OS DOCUMENTOS SAO CALCULADOS, NAO COPIADOS
//   `cpfValido` e `cnpjValido` montam o numero a partir de uma base e CALCULAM
//   os dois digitos verificadores pelo algoritmo oficial. Nenhum numero aqui
//   foi copiado de pessoa ou empresa de verdade, e nenhum e um daqueles "CPFs
//   de teste" que circulam na internet - esses costumam ser de alguem.
//
//   A base e fixa, e isso e deliberado: rodar o seed duas vezes produz os
//   mesmos documentos, entao a segunda execucao nao cria clientes duplicados
//   (ele procura por `tax_id` antes de inserir).
//
// O QUE ELE NAO FAZ
//   Nao emite cobranca. As parcelas nascem em aberto, justamente para alguem
//   clicar em "Gerar cobranca" e ver o fluxo inteiro. Tambem nao mexe em
//   cliente nenhum que ja exista: so acrescenta.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertOnlyTestTenants } from './tenants.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_TENANT_SLUG = 'fernando-costa-teste'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      /* O .env do ambiente ATIVO vence o shell, igual aos outros seeds. */
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env opcional */
  }
  return env
}

const env = loadEnv()
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function fail(mensagem) {
  console.error(`\n  ${mensagem}\n`)
  process.exit(1)
}

/*
  O DIGITO VERIFICADOR DO CPF, pelo algoritmo da Receita: cada um dos dois
  digitos e a soma ponderada dos anteriores, modulo 11, com 10 virando zero.

  Recebe nove digitos e devolve os onze. Nao aceita base repetida (111111111),
  porque CPF com todos os digitos iguais passa na conta e e recusado por
  qualquer validador serio, incluindo o do Asaas.
*/
function cpfValido(base9) {
  if (!/^\d{9}$/.test(base9)) fail(`base de CPF invalida: ${base9}`)
  if (/^(\d)\1{8}$/.test(base9)) fail(`base de CPF com digitos repetidos: ${base9}`)

  let numero = base9
  for (const tamanho of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tamanho; i += 1) soma += Number(numero[i]) * (tamanho + 1 - i)
    let digito = (soma * 10) % 11
    if (digito === 10) digito = 0
    numero += String(digito)
  }
  return numero
}

/*
  O DIGITO VERIFICADOR DO CNPJ. Mesma ideia, pesos diferentes: 5..2 seguidos de
  9..2 para o primeiro digito, e os mesmos pesos deslocados para o segundo.
  Recebe doze digitos (oito da raiz, quatro da filial) e devolve os quatorze.
*/
function cnpjValido(base12) {
  if (!/^\d{12}$/.test(base12)) fail(`base de CNPJ invalida: ${base12}`)

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, ...pesos1]

  let numero = base12
  for (const [tamanho, pesos] of [
    [12, pesos1],
    [13, pesos2],
  ]) {
    let soma = 0
    for (let i = 0; i < tamanho; i += 1) soma += Number(numero[i]) * pesos[i]
    const resto = soma % 11
    numero += String(resto < 2 ? 0 : 11 - resto)
  }
  return numero
}

const formatarCpf = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
const formatarCnpj = (d) =>
  `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`

/*
  O VENCIMENTO PRECISA SER FUTURO, e isso foi medido: em 03/11/2026 o Asaas
  recusou com 400 uma cobranca cujo vencimento era 18/09/2026, e a mesma
  cobranca passou com 18/01/2027. Parcela vencida no passado existe de monte no
  banco de teste; o que faltava era parcela em aberto COM vencimento a frente,
  que e a unica em que "Gerar cobranca" chega ao fim.

  As datas saem de hoje, e nao sao fixas, para o seed nao envelhecer: rodado em
  qualquer dia, ele produz parcelas cobraveis naquele dia.
*/
function daquiA(dias) {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return data.toISOString().slice(0, 10)
}

/*
  OS VALORES FICAM ABAIXO DE DEZ MIL, e isso é limite da conta, não escolha de
  realismo.

  Medido em 03/11/2026: uma parcela de R$ 63.400,00 foi recusada pelo Asaas com
  "O valor da cobrança excede o seu limite autorizado. Entre em contato com o
  suporte para aumentar o limite." Conta de sandbox nasce com teto por cobrança,
  e seed que cria parcela acima dele entrega um caso que não tem como ser
  testado.

  R$ 9.500,00 passou no mesmo dia, então os valores aqui ficam abaixo disso. O
  teto exato não foi medido, e não está escrito aqui por isso: quando alguém
  precisar saber, mede.

  EM PRODUÇÃO ISSO NÃO É LIMITE NOSSO. O escritório pede aumento ao suporte do
  Asaas, e a mensagem que a tela mostra agora diz exatamente isso, com as
  palavras deles.
*/
const CLIENTES = [
  {
    name: 'Helena Marcondes Vilalba',
    tax_id: formatarCpf(cpfValido('529812347')),
    phone: '(62) 99812-4455',
    address_city: 'Goiânia',
    address_state: 'GO',
    parcelas: [
      { description: 'Entrada - Projeto residencial Jardim Goiás', value: 8750, dias: 12 },
      { description: 'Parcela 2/4 - Projeto residencial Jardim Goiás', value: 7800, dias: 25 },
    ],
  },
  {
    name: 'Otávio Ribeiro Tagliaferro',
    tax_id: formatarCpf(cpfValido('374650182')),
    phone: '(62) 99433-1276',
    address_city: 'Goiânia',
    address_state: 'GO',
    parcelas: [
      { description: 'Parcela 1/3 - Reforma apartamento Setor Bueno', value: 4300.5, dias: 8 },
    ],
  },
  {
    name: 'Construtora Pedra Alta Ltda',
    tax_id: formatarCnpj(cnpjValido('418206730001')),
    phone: '(62) 3241-7788',
    address_city: 'Aparecida de Goiânia',
    address_state: 'GO',
    parcelas: [
      { description: 'Medição 3/8 - Edifício corporativo Marista', value: 8900, dias: 18 },
      { description: 'Medição 4/8 - Edifício corporativo Marista', value: 8900, dias: 48 },
    ],
  },
]

async function main() {
  console.log(`\nSeed de cobrança Asaas (clientes com documento válido) — ${env.VITE_SUPABASE_URL}\n`)

  // A mesma trava dos outros nove seeds: aborta se houver no banco um tenant
  // fora da lista de escritorios de teste. Ver supabase/seed/tenants.mjs.
  await assertOnlyTestTenants(db)

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()
  if (!tenant) fail('escritório de teste não existe. Rode: npm run seed')

  let criados = 0
  let reaproveitados = 0
  let parcelasCriadas = 0

  for (const alvo of CLIENTES) {
    /* Procura por documento, e nao por nome: nome muda, documento e a
       identidade. Rodar o seed duas vezes nao duplica ninguem. */
    const { data: existente } = await db
      .from('clients')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('tax_id', alvo.tax_id)
      .maybeSingle()

    let clientId = existente?.id ?? null

    if (clientId) {
      reaproveitados += 1
      console.log(`  já existia: ${existente.name} (${alvo.tax_id})`)
    } else {
      const { data: novo, error } = await db
        .from('clients')
        .insert({
          tenant_id: tenant.id,
          name: alvo.name,
          phone: alvo.phone,
          tax_id: alvo.tax_id,
          /* `address_city` e `address_state` sao NOT NULL por check para
             cliente que nao veio da importacao (`legacy_id` nulo). */
          address_city: alvo.address_city,
          address_state: alvo.address_state,
        })
        .select('id')
        .single()

      if (error) fail(`não consegui criar ${alvo.name}: ${error.message}`)
      clientId = novo.id
      criados += 1
      console.log(`  criado:     ${alvo.name} (${alvo.tax_id})`)
    }

    for (const parcela of alvo.parcelas) {
      const { data: jaTem } = await db
        .from('accounts_receivable')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('client_id', clientId)
        .eq('description', parcela.description)
        .maybeSingle()

      if (jaTem) continue

      const { error } = await db.from('accounts_receivable').insert({
        tenant_id: tenant.id,
        client_id: clientId,
        description: parcela.description,
        value: parcela.value,
        due_date: daquiA(parcela.dias),
        /* `forecast` e nao `paid`: o check da 0041 amarra 'paid' a ter
           payment_date, e parcela paga nao pode ser cobrada. Estas nascem em
           aberto porque o ponto delas e serem cobradas. */
        status: 'forecast',
      })

      if (error) fail(`não consegui criar a parcela "${parcela.description}": ${error.message}`)
      parcelasCriadas += 1
      console.log(`              parcela ${daquiA(parcela.dias)}  ${parcela.description}`)
    }
  }

  console.log(
    `\n  ${criados} clientes criados, ${reaproveitados} já existiam, ${parcelasCriadas} parcelas novas.\n`,
  )
  console.log('  Todas com vencimento à frente, em aberto, e sem cobrança emitida.')
  console.log('  Financeiro > Recebíveis, menu dos três pontos > Gerar cobrança.\n')
}

main().catch((erro) => fail(erro.message))
