// AS TAXAS DA CONTA ASAAS DO ESCRITORIO, lidas da conta e nao de pagina de preco.
//
// COMO RODAR
//   npm run env:prod
//   node scripts/taxas-asaas.mjs --escritorio fernando-costa
//
// POR QUE ELE EXISTE
//   A pagina publica do Asaas (asaas.com/regua-de-cobranca) diz R$ 0,55 por
//   notificacao de WhatsApp e R$ 0,99 pelo pacote de e-mail e SMS, e termina a
//   secao com esta frase: "As taxas apresentadas são padrão. Para conferir as
//   condições aplicadas ao seu contrato, consulte-as diretamente na sua conta
//   Asaas."
//
//   Ou seja: o numero publicado e um palpite educado sobre o contrato do
//   escritorio, nao o contrato. Quando a decisao envolve dinheiro recorrente,
//   o numero tem de vir da conta. `GET /v3/myAccount/fees/` devolve exatamente
//   isso, e e so leitura: nao altera nada na conta.
//
// O QUE ELE IMPRIME
//   As taxas, e nada mais. Nenhum nome de cliente, nenhum documento, nenhuma
//   cobranca. Pode colar a saida inteira numa mensagem.
//
// O QUE ELE NAO FAZ
//   Nao liga nem desliga canal de notificacao, nao emite cobranca, nao escreve
//   no banco. Se um dia alguem precisar LIGAR o WhatsApp, isso e
//   `PUT /v3/notifications/batch`, e e outro arquivo.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const BASES = {
  sandbox: 'https://api-sandbox.asaas.com',
  production: 'https://api.asaas.com',
}

function fail(mensagem) {
  console.error(`\n  ABORTADO: ${mensagem}\n`)
  process.exit(1)
}

const i = process.argv.indexOf('--escritorio')
const SLUG = i === -1 ? null : process.argv[i + 1]
if (!SLUG) fail('falta --escritorio <slug>. Exemplo: --escritorio fernando-costa')

const env = {}
try {
  for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  fail('.env nao encontrado. Rode npm run env:prod ou npm run env:dev.')
}
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env ativo')
}

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const reais = (valor) =>
  typeof valor === 'number'
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '(a conta nao informou)'

async function main() {
  const { data: tenant, error: erroTenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', SLUG)
    .maybeSingle()
  if (erroTenant) fail(`nao consegui ler o escritorio: ${erroTenant.message}`)
  if (!tenant) fail(`escritorio ${SLUG} nao existe neste banco`)

  const { data: conexao, error: erroConexao } = await db
    .from('asaas_connections')
    .select('environment')
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (erroConexao) fail(`nao consegui ler a conexao: ${erroConexao.message}`)
  if (!conexao) fail(`o escritorio ${SLUG} nao tem conta Asaas ligada`)

  const base = BASES[conexao.environment]
  if (!base) fail(`ambiente desconhecido na conexao: ${conexao.environment}`)

  const { data: apiKey, error: erroChave } = await db.rpc('asaas_api_key', {
    p_tenant_id: tenant.id,
  })
  if (erroChave) fail(`nao consegui ler a chave do cofre: ${erroChave.message}`)
  if (!apiKey) fail('a chave do Asaas nao esta no cofre desta conexao')

  const resposta = await fetch(`${base}/v3/myAccount/fees/`, {
    headers: { access_token: apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  const json = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    fail(`o Asaas respondeu ${resposta.status}. ${json?.errors?.[0]?.description ?? ''}`)
  }

  const n = json?.notification ?? {}

  console.log(`\nTaxas da conta Asaas, escritorio ${SLUG}, ambiente ${conexao.environment}`)
  console.log(`Lidas de ${base}/v3/myAccount/fees/ em ${new Date().toISOString().slice(0, 10)}\n`)
  console.log('  NOTIFICACAO')
  console.log(`    WhatsApp, por mensagem enviada:        ${reais(n.whatsAppFeeValue)}`)
  console.log(`    pacote de e-mail e SMS, por transacao: ${reais(n.messagingFeeValue)}`)
  console.log(`    robo de voz, por ligacao:              ${reais(n.phoneCallFeeValue)}`)

  /* O resto da resposta entra cru, e sem filtro nosso: taxa de boleto, de Pix e
     de cartao interessam na mesma conversa, e a forma do objeto e deles, nao
     nossa. Filtrar por nome de campo escolhido hoje esconderia campo novo. */
  for (const [bloco, valor] of Object.entries(json ?? {})) {
    if (bloco === 'notification' || bloco === 'object') continue
    console.log(`\n  ${bloco.toUpperCase()}`)
    console.log(`${JSON.stringify(valor, null, 2).replace(/^/gm, '    ')}`)
  }
  console.log('')
}

main().catch((erro) => fail(erro.message ?? String(erro)))
