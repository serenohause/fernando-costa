// CONCILIACAO ENTRE AS COBRANCAS QUE JA EXISTEM NO ASAAS E AS PARCELAS ABERTAS.
//
// COMO RODAR
//   node scripts/conciliar-cobranca-asaas.mjs --escritorio fernando-costa
//   node scripts/conciliar-cobranca-asaas.mjs --escritorio fernando-costa --vincular
//
//   Sem `--vincular` ele NAO escreve nada: le, casa e relata.
//
// POR QUE ELE EXISTE
//   O escritorio ja emitia cobranca pelo PAINEL do Asaas antes deste modulo
//   existir. Essas cobrancas vivem na conta do Asaas e nao tem espelho no nosso
//   banco, e o espelho e o que liga o aviso de pagamento a parcela: o webhook
//   procura a cobranca por (tenant_id, asaas_payment_id) e, nao achando, nao
//   baixa nada. Resultado de hoje: o cliente paga, a parcela continua aberta.
//
//   E o caminho ingenuo e pior. "Gerar cobranca" numa parcela que ja tem boleto
//   feito a mao no Asaas cria uma SEGUNDA cobranca do mesmo dinheiro, e o
//   cliente recebe dois boletos. E por isso que vincular vem ANTES de emitir.
//
// O QUE ELE FAZ
//   1. Le as cobrancas da conta Asaas do escritorio (todas, paginando).
//   2. Le as parcelas em aberto do financeiro e as cobrancas que JA tem espelho.
//   3. Casa as duas listas, e diz com que confianca casou cada uma.
//   4. Com `--vincular`, grava espelho SO para os pares de confianca alta.
//
// O QUE ELE NUNCA FAZ
//   NAO EMITE COBRANCA, nem com `--vincular`, e isso e decisao do usuario
//   (05/11/2026): parcela que nunca foi cobrada a mao fica exatamente como
//   esta, e o escritorio emite quando quiser, no clique de alguem, uma por uma.
//   A lista delas sai no relatorio como informacao, nao como fila de disparo.
//
// PRIVACIDADE
//   O terminal recebe so contagem e soma. Nome de cliente, documento, valor por
//   parcela e id de cobranca vao para um arquivo .local em modo 0600, ignorado
//   pelo git, porque terminal vira log e log vira anexo.

import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
/* O DE/PARA DO ESPELHO NAO E REESCRITO AQUI. `espelhoDaCobranca` e o mesmo
   mapeamento que `asaas-charge` e `asaas-webhook` usam, com 48 casos de teste
   em tests/asaas-cobranca.mjs atras dele. Mapear a mao neste arquivo seria uma
   segunda verdade sobre as mesmas colunas, e a primeira versao deste script
   provou o risco: ela gravava `asaas_customer_id`, coluna que nao existe. */
import {
  espelhoDaCobranca,
  espelhoEstaCompleto,
} from '../supabase/functions/_shared/asaas.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* As duas bases sao as mesmas de supabase/functions/_shared/asaas.ts. Repetidas
   aqui, e nao importadas, porque aquele modulo e Deno e carrega o resto do
   mundo junto; duas constantes de uma linha nao valem o acoplamento. */
const BASES = {
  sandbox: 'https://api-sandbox.asaas.com',
  production: 'https://api.asaas.com',
}

function fail(mensagem) {
  console.error(`\n  ABORTADO: ${mensagem}\n`)
  process.exit(1)
}

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    fail('.env nao encontrado. Rode npm run env:prod ou npm run env:dev.')
  }
  return env
}

function argumento(nome) {
  const i = process.argv.indexOf(`--${nome}`)
  return i === -1 ? null : (process.argv[i + 1] ?? null)
}

const VINCULAR = process.argv.includes('--vincular')
const SLUG = argumento('escritorio')
if (!SLUG) fail('falta --escritorio <slug>. Exemplo: --escritorio fernando-costa')

const env = loadEnv()
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env ativo')
}

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const digitos = (texto) => String(texto ?? '').replace(/\D/g, '')
const dinheiro = (valor) =>
  Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* Centavos, e nao float: 8900.00 e 8899.999999 sao a mesma cobranca para quem
   paga, e `===` entre floats diria que nao. */
const centavos = (valor) => Math.round(Number(valor ?? 0) * 100)

async function asaas(base, apiKey, caminho) {
  const resposta = await fetch(`${base}/v3${caminho}`, {
    headers: { access_token: apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  const json = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const descricao = json?.errors?.[0]?.description ?? ''
    fail(`o Asaas respondeu ${resposta.status} em ${caminho}. ${descricao}`)
  }
  return json
}

/* O Asaas pagina por offset e devolve `hasMore`. O teto de 100 e o maximo que
   `limit` aceita; o loop vai ate `hasMore` virar falso, e nao ate uma pagina
   vir curta, porque pagina curta no meio existe quando o filtro corta. */
async function todasAsPaginas(base, apiKey, caminho) {
  const tudo = []
  let offset = 0
  for (;;) {
    const juncao = caminho.includes('?') ? '&' : '?'
    const pagina = await asaas(base, apiKey, `${caminho}${juncao}limit=100&offset=${offset}`)
    tudo.push(...(pagina?.data ?? []))
    if (!pagina?.hasMore) return tudo
    offset += 100
    if (offset > 10000) fail(`mais de 10 mil registros em ${caminho}: pare e refine o filtro`)
  }
}

async function main() {
  console.log(`\nConciliacao de cobranca Asaas, escritorio ${SLUG}`)
  console.log(`Banco: ${env.VITE_SUPABASE_URL}`)
  console.log(VINCULAR ? 'Modo: VINCULAR (vai gravar espelho)\n' : 'Modo: relatorio (nao grava nada)\n')

  const { data: tenant, error: erroTenant } = await db
    .from('tenants')
    .select('id, name')
    .eq('slug', SLUG)
    .maybeSingle()
  if (erroTenant) fail(`nao consegui ler o escritorio: ${erroTenant.message}`)
  if (!tenant) fail(`escritorio ${SLUG} nao existe neste banco`)

  const { data: conexao, error: erroConexao } = await db
    .from('asaas_connections')
    .select('environment, webhook_token_hash, asaas_webhook_id')
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (erroConexao) fail(`nao consegui ler a conexao: ${erroConexao.message}`)
  if (!conexao) fail(`o escritorio ${SLUG} nao tem conta Asaas ligada`)

  const base = BASES[conexao.environment]
  if (!base) fail(`ambiente desconhecido na conexao: ${conexao.environment}`)

  console.log(`  ambiente da conexao:  ${conexao.environment}`)
  console.log(`  aviso de pagamento:   ${conexao.webhook_token_hash ? 'registrado' : 'NAO REGISTRADO'}`)

  /*
    SEM AVISO REGISTRADO, VINCULAR NAO SERVE PARA NADA e e pior que nao fazer:
    o espelho passaria a afirmar que aquela parcela tem cobranca viva, o indice
    unico parcial da 0125 recusaria emissao nova, e nenhum pagamento baixaria,
    porque aviso nenhum chega. Ficaria travado nos dois sentidos.
  */
  if (VINCULAR && !conexao.webhook_token_hash) {
    fail(
      'o aviso de pagamento nao esta registrado nesta conexao. Vincular agora travaria a parcela ' +
        'sem baixar nada. Religue o aviso em Configuracoes e rode de novo.',
    )
  }

  const { data: apiKey, error: erroChave } = await db.rpc('asaas_api_key', { p_tenant_id: tenant.id })
  if (erroChave) fail(`nao consegui ler a chave do cofre: ${erroChave.message}`)
  if (!apiKey) fail('a chave do Asaas nao esta no cofre desta conexao')

  /* ---------------------------------------------------------------- */
  /* 1. O que existe no Asaas                                         */
  /* ---------------------------------------------------------------- */

  const cobrancasAsaas = await todasAsPaginas(base, apiKey, '/payments')
  const clientesAsaas = await todasAsPaginas(base, apiKey, '/customers')
  const porIdDoCliente = new Map(clientesAsaas.map((c) => [c.id, c]))

  console.log(`\n  cobrancas na conta Asaas:  ${cobrancasAsaas.length}`)
  console.log(`  clientes na conta Asaas:   ${clientesAsaas.length}`)

  /* ---------------------------------------------------------------- */
  /* 2. O que existe no financeiro                                    */
  /* ---------------------------------------------------------------- */

  const { data: parcelas, error: erroParcelas } = await db
    .from('accounts_receivable')
    .select('id, client_id, description, value, due_date, status, payment_date')
    .eq('tenant_id', tenant.id)
    .is('payment_date', null)
    .order('due_date')
  if (erroParcelas) fail(`nao consegui ler as parcelas: ${erroParcelas.message}`)

  const { data: clientes, error: erroClientes } = await db
    .from('clients')
    .select('id, name, tax_id, tax_id_digits')
    .eq('tenant_id', tenant.id)
  if (erroClientes) fail(`nao consegui ler os clientes: ${erroClientes.message}`)
  const porIdDoNosso = new Map(clientes.map((c) => [c.id, c]))

  const { data: espelhos, error: erroEspelhos } = await db
    .from('asaas_charges')
    .select('receivable_id, asaas_payment_id, deleted')
    .eq('tenant_id', tenant.id)
  if (erroEspelhos) fail(`nao consegui ler os espelhos: ${erroEspelhos.message}`)

  const espelhoVivoPorParcela = new Map()
  const parcelaPorPagamento = new Map()
  for (const e of espelhos ?? []) {
    parcelaPorPagamento.set(e.asaas_payment_id, e.receivable_id)
    if (!e.deleted) espelhoVivoPorParcela.set(e.receivable_id, e.asaas_payment_id)
  }

  console.log(`  parcelas em aberto:        ${parcelas.length}`)
  console.log(`  parcelas com espelho vivo: ${espelhoVivoPorParcela.size}`)

  /* ---------------------------------------------------------------- */
  /* 3. O casamento                                                   */
  /* ---------------------------------------------------------------- */

  /*
    AS REGRAS, DA MAIS FORTE PARA A MAIS FRACA, e so a primeira e a segunda
    autorizam gravar espelho.

      alta    `externalReference` da cobranca e o id de uma parcela nossa. Nao e
              palpite: e a cobranca dizendo de quem ela e. Vale para cobranca
              que saiu por aqui e perdeu o espelho.
      alta    documento do cliente bate, valor bate ao centavo, e vencimento
              bate. Tres coincidencias ao mesmo tempo em cima do mesmo
              documento e identidade suficiente.
      media   documento e valor batem, vencimento nao. E o caso de quem
              renegociou a data no painel do Asaas. Precisa de gente: o
              vencimento de la ou o de ca e o que vale?
      baixa   so o documento bate. Nao casa nada; entra no relatorio para
              alguem ler.

    UMA COBRANCA SO CASA COM UMA PARCELA, e vice-versa: parcela que ja recebeu
    par sai da lista antes da rodada seguinte. Sem isso, duas medicoes de valor
    igual no mesmo dia casariam as duas com a primeira.
  */

  const vivas = cobrancasAsaas.filter((c) => c.deleted !== true)
  const semEspelho = vivas.filter((c) => !parcelaPorPagamento.has(c.id))

  const disponiveis = parcelas.filter((p) => !espelhoVivoPorParcela.has(p.id))
  const porParcelaId = new Map(disponiveis.map((p) => [p.id, p]))
  const usadas = new Set()

  const pares = []
  const semPar = []

  const documentoDaCobranca = (cobranca) => {
    const cliente = porIdDoCliente.get(cobranca.customer)
    return digitos(cliente?.cpfCnpj)
  }

  for (const cobranca of semEspelho) {
    const referencia = cobranca.externalReference
    if (referencia && porParcelaId.has(referencia) && !usadas.has(referencia)) {
      usadas.add(referencia)
      pares.push({ cobranca, parcela: porParcelaId.get(referencia), confianca: 'alta', motivo: 'externalReference' })
      continue
    }

    const documento = documentoDaCobranca(cobranca)
    if (documento === '') {
      semPar.push({ cobranca, confianca: 'nenhuma', motivo: 'cliente do Asaas sem documento' })
      continue
    }

    const candidatas = disponiveis.filter((p) => {
      if (usadas.has(p.id)) return false
      const nosso = porIdDoNosso.get(p.client_id)
      return digitos(nosso?.tax_id_digits ?? nosso?.tax_id) === documento
    })

    if (candidatas.length === 0) {
      semPar.push({ cobranca, confianca: 'nenhuma', motivo: 'nenhuma parcela aberta deste documento' })
      continue
    }

    const exata = candidatas.find(
      (p) => centavos(p.value) === centavos(cobranca.value) && p.due_date === cobranca.dueDate,
    )
    if (exata) {
      usadas.add(exata.id)
      pares.push({ cobranca, parcela: exata, confianca: 'alta', motivo: 'documento, valor e vencimento' })
      continue
    }

    const mesmoValor = candidatas.find((p) => centavos(p.value) === centavos(cobranca.value))
    if (mesmoValor) {
      semPar.push({
        cobranca,
        parcela: mesmoValor,
        confianca: 'media',
        motivo: `valor bate, vencimento nao (Asaas ${cobranca.dueDate}, aqui ${mesmoValor.due_date})`,
      })
      continue
    }

    semPar.push({
      cobranca,
      confianca: 'baixa',
      motivo: `documento bate, valor nao (Asaas ${dinheiro(cobranca.value)}, ${candidatas.length} parcela(s) aberta(s) deste cliente)`,
    })
  }

  const semCobranca = disponiveis.filter((p) => !usadas.has(p.id))

  /* ---------------------------------------------------------------- */
  /* 4. O relatorio                                                   */
  /* ---------------------------------------------------------------- */

  const hoje = new Date().toISOString().slice(0, 10)
  const emitiveis = semCobranca.filter((p) => {
    const nosso = porIdDoNosso.get(p.client_id)
    return p.due_date >= hoje && digitos(nosso?.tax_id_digits ?? nosso?.tax_id) !== ''
  })
  const soma = (lista, campo) => lista.reduce((t, x) => t + Number(x[campo] ?? 0), 0)

  /*
    PAGA OU EM ABERTO, E ESSA E A PERGUNTA QUE MUDA A DECISAO.

    Cobranca JA PAGA no Asaas casada com parcela ABERTA aqui e dinheiro que
    entrou e que o financeiro nao sabe. Vincular nao resolve isso: o aviso de
    pagamento dela passou antes de o espelho existir, e o Asaas nao reenvia
    evento antigo. Ou seja, o espelho vai dizer "paga" e a parcela vai seguir
    aberta ate alguem dar baixa a mao.

    Por isso a contagem sai ANTES de gravar, e nao so depois: ela e o tamanho
    do trabalho manual que o vinculo deixa na mesa.
  */
  const PAGAS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
  const estaPaga = (c) => PAGAS.has(c.status) || Boolean(c.paymentDate)
  const porStatus = (lista) => {
    const conta = {}
    for (const c of lista) conta[c.status] = (conta[c.status] ?? 0) + 1
    return Object.entries(conta)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} ${n}`)
      .join(', ')
  }

  const paresPagos = pares.filter((x) => estaPaga(x.cobranca))
  const semParLista = semPar.filter((x) => x.confianca === 'nenhuma').map((x) => x.cobranca)
  const semParAbertas = semParLista.filter((c) => !estaPaga(c))

  console.log('\n  CASAMENTO')
  console.log(`  cobrancas vivas no Asaas sem espelho:   ${semEspelho.length}`)
  console.log(`  casadas com confianca alta:             ${pares.length}   ${dinheiro(soma(pares.map((x) => x.parcela), 'value'))}`)
  console.log(`     dessas, JA PAGAS no Asaas:           ${paresPagos.length}   ${dinheiro(soma(paresPagos.map((x) => x.cobranca), 'value'))}`)
  console.log(`     dessas, ainda em aberto:             ${pares.length - paresPagos.length}`)
  console.log(`     status: ${porStatus(pares.map((x) => x.cobranca))}`)
  console.log(`  precisam de gente (media ou baixa):     ${semPar.filter((x) => x.confianca !== 'nenhuma').length}`)
  console.log(`  sem par nenhum no financeiro:           ${semParLista.length}`)
  console.log(`     dessas, ja pagas (historico):        ${semParLista.length - semParAbertas.length}`)
  console.log(`     dessas, AINDA ABERTAS no Asaas:      ${semParAbertas.length}   ${dinheiro(soma(semParAbertas, 'value'))}`)
  console.log('\n  PARCELAS SEM COBRANCA NENHUMA (ficam como estao)')
  console.log(`  total:                                  ${semCobranca.length}   ${dinheiro(soma(semCobranca, 'value'))}`)
  console.log(`  aceitariam emissao hoje, se alguem pedir:              ${emitiveis.length}   ${dinheiro(soma(emitiveis, 'value'))}`)
  console.log(`  recusariam hoje (vencida ou cliente sem documento):    ${semCobranca.length - emitiveis.length}`)

  const nome = (clientId) => porIdDoNosso.get(clientId)?.name ?? '(cliente nao encontrado)'
  const linhas = []
  linhas.push(`CONCILIACAO DE COBRANCA ASAAS - ${SLUG} - ${new Date().toISOString()}`)
  linhas.push(`ambiente: ${conexao.environment}   banco: ${env.VITE_SUPABASE_URL}`)
  linhas.push('')
  linhas.push('Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em mensagem.')
  linhas.push('')
  linhas.push(`== 1. CASADAS COM CONFIANCA ALTA (${pares.length}) ==`)
  linhas.push(`   [JA PAGA] = o dinheiro entrou e a parcela daqui segue aberta. Vincular NAO`)
  linhas.push(`   baixa essas: o aviso de pagamento delas passou antes de o espelho existir.`)
  linhas.push('')
  for (const { cobranca, parcela, motivo } of pares) {
    linhas.push(
      `  ${estaPaga(cobranca) ? '[JA PAGA] ' : '          '}${cobranca.id}  ${cobranca.status.padEnd(10)}  ${dinheiro(cobranca.value).padStart(14)}  venc ${cobranca.dueDate}`,
    )
    linhas.push(`    parcela ${parcela.id}  ${nome(parcela.client_id)}  ${parcela.description ?? ''}`)
    linhas.push(`    casou por: ${motivo}`)
  }
  linhas.push('')
  linhas.push(`== 2. PRECISAM DE DECISAO (${semPar.length}) ==`)
  for (const { cobranca, parcela, confianca, motivo } of semPar) {
    const cliente = porIdDoCliente.get(cobranca.customer)
    linhas.push(
      `  ${cobranca.id}  ${cobranca.status.padEnd(10)}  ${dinheiro(cobranca.value).padStart(14)}  venc ${cobranca.dueDate}  [${confianca}]`,
    )
    linhas.push(`    cliente no Asaas: ${cliente?.name ?? '(sem nome)'}  ${cliente?.cpfCnpj ?? '(sem documento)'}`)
    linhas.push(`    ${motivo}`)
    if (parcela) linhas.push(`    candidata: parcela ${parcela.id}  ${nome(parcela.client_id)}  ${parcela.description ?? ''}`)
  }
  linhas.push('')
  linhas.push(`== 2b. COBRANCAS AINDA ABERTAS NO ASAAS E SEM PAR AQUI (${semParAbertas.length}) ==`)
  linhas.push('   Boleto de pe na conta do Asaas sem parcela aberta correspondente no')
  linhas.push('   financeiro. Pode ser parcela que alguem ja deu baixa aqui sem o dinheiro')
  linhas.push('   ter entrado, parcela que nunca foi lancada, ou cliente com documento')
  linhas.push('   diferente nos dois lugares. Nenhuma e vinculada.')
  linhas.push('')
  for (const c of semParAbertas) {
    const cliente = porIdDoCliente.get(c.customer)
    linhas.push(
      `  ${c.id}  ${c.status.padEnd(10)}  ${dinheiro(c.value).padStart(14)}  venc ${c.dueDate}  ${cliente?.name ?? '(sem nome)'}  ${cliente?.cpfCnpj ?? ''}`,
    )
  }
  linhas.push('')
  linhas.push('== 3. PARCELAS SEM COBRANCA NENHUMA ==')
  linhas.push('   Ficam como estao. Nada aqui e emitido por este script: o escritorio')
  linhas.push('   emite quando quiser, pelo menu dos tres pontos da parcela.')
  linhas.push('')
  linhas.push(`   3a. aceitariam emissao hoje (${emitiveis.length}):`)
  for (const p of emitiveis) {
    linhas.push(`  ${p.id}  ${dinheiro(p.value).padStart(14)}  venc ${p.due_date}  ${nome(p.client_id)}  ${p.description ?? ''}`)
  }
  linhas.push('')
  linhas.push(`   3b. recusariam emissao hoje (${semCobranca.length - emitiveis.length}):`)
  for (const p of semCobranca.filter((x) => !emitiveis.includes(x))) {
    const nosso = porIdDoNosso.get(p.client_id)
    const porque = []
    if (p.due_date < hoje) porque.push('vencimento no passado')
    if (digitos(nosso?.tax_id_digits ?? nosso?.tax_id) === '') porque.push('cliente sem CPF ou CNPJ')
    linhas.push(
      `  ${p.id}  ${dinheiro(p.value).padStart(14)}  venc ${p.due_date}  ${nome(p.client_id)}  [${porque.join(' e ')}]`,
    )
  }

  const destino = resolve(ROOT, `scripts/conciliacao-asaas-${SLUG}-${hoje}.local`)
  writeFileSync(destino, `${linhas.join('\n')}\n`, { mode: 0o600 })
  chmodSync(destino, 0o600)
  console.log(`\n  detalhe com nome e documento: ${destino}`)

  /* ---------------------------------------------------------------- */
  /* 5. Vincular, so se pedirem                                       */
  /* ---------------------------------------------------------------- */

  if (!VINCULAR) {
    console.log('\n  Nada foi gravado. Leia o arquivo, e rode de novo com --vincular')
    console.log('  para gravar espelho SO das casadas com confianca alta.\n')
    return
  }

  let gravados = 0
  const falhas = []
  const jaPagas = []
  for (const { cobranca, parcela } of pares) {
    const espelho = espelhoDaCobranca(cobranca)

    /*
      AS QUATRO NOT NULL DA 0125 (status, billing_type, value, due_date) vem do
      que o Asaas mandou, e `espelhoEstaCompleto` e a mesma conferencia que
      `asaas-charge` faz antes de gravar. Faltando uma, a linha nao entra pela
      metade: ela fica de fora e aparece no relatorio, porque espelho incompleto
      ocupa o indice unico da parcela e nao serve para baixar nada.
    */
    if (!espelhoEstaCompleto(espelho)) {
      falhas.push(`${cobranca.id} -> ${parcela.id}: o Asaas nao mandou status, tipo, valor ou vencimento`)
      continue
    }

    const { error } = await db.from('asaas_charges').insert({
      tenant_id: tenant.id,
      receivable_id: parcela.id,
      environment: conexao.environment,
      asaas_payment_id: cobranca.id,
      external_reference: cobranca.externalReference ?? parcela.id,
      /* Nulo, e nao o usuario que rodou o script: ninguem clicou em emitir esta
         cobranca por aqui. A coluna existe para dizer quem emitiu, e inventar
         um nome seria mentira num campo de auditoria. */
      created_by_id: null,
      ...espelho,
    })
    if (error) {
      falhas.push(`${cobranca.id} -> ${parcela.id}: ${error.code} ${error.message}`)
      continue
    }
    gravados += 1
    if (espelho.payment_date !== null) jaPagas.push({ cobranca, parcela })
  }

  console.log(`\n  espelhos gravados: ${gravados}`)
  if (falhas.length > 0) {
    console.log(`  falhas: ${falhas.length}`)
    for (const f of falhas) console.log(`    ${f}`)
  }

  /*
    COBRANCA QUE JA ESTAVA PAGA ANTES DO VINCULO NAO BAIXA SOZINHA, e isso tem
    de ser dito em voz alta. O aviso de pagamento dela ja passou, e o Asaas nao
    reenvia evento antigo por causa de um espelho novo. Ou seja: o espelho diz
    "paga" e a parcela segue aberta no financeiro.

    Dar baixa aqui seria o script mexendo em dinheiro por conta propria, e a
    decisao e do escritorio - o painel da parcela ja tem "Marcar como Pago",
    com a data que o Asaas registrou aparecendo na tela.
  */
  if (jaPagas.length > 0) {
    console.log(`\n  ATENCAO: ${jaPagas.length} dessas cobrancas JA ESTAVAM PAGAS no Asaas.`)
    console.log('  O aviso de pagamento delas ja passou, entao a parcela NAO vai baixar sozinha.')
    console.log('  Alguem precisa abrir cada uma e usar "Marcar como Pago". A lista esta no arquivo.')
    linhas.push('')
    linhas.push(`== 5. VINCULADAS E JA PAGAS NO ASAAS, PRECISAM DE BAIXA A MAO (${jaPagas.length}) ==`)
    for (const { cobranca, parcela } of jaPagas) {
      linhas.push(
        `  parcela ${parcela.id}  ${nome(parcela.client_id)}  ${dinheiro(cobranca.value)}  pago em ${cobranca.paymentDate ?? '(sem data)'}`,
      )
    }
    writeFileSync(destino, `${linhas.join('\n')}\n`, { mode: 0o600 })
    chmodSync(destino, 0o600)
  }

  console.log('\n  Das que seguem em aberto, pagamento a partir de agora baixa a parcela sozinho.\n')
}

main().catch((erro) => fail(erro.message ?? String(erro)))
