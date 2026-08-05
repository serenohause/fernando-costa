// Seed do modulo 4 (Contratos) — contratos no escritorio de teste.
//
// COMO RODAR
//   npm run seed:contracts
//   Depende dos seeds 1, 2 e 3 (escritorio, clientes e negociacoes).
//
// SOBRE OS DADOS
//   Os casos que a tela de contratos precisa saber desenhar: os cinco status,
//   parcelamento definido e ausente, parcelas ja geradas e por gerar, contrato
//   nascido de negociacao ganha e contrato avulso.

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
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log(`\nSeed do módulo 4 (Contratos) — ${env.VITE_SUPABASE_URL}\n`)

  // Trava de seguranca: aborta se houver no banco tenant fora da lista de
  // escritorios de teste. A lista, e o que acontece quando o escritorio real
  // nascer, estao em supabase/seed/tenants.mjs.
  await assertOnlyTestTenants(db)

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()
  if (!tenant) fail('escritório de teste não existe. Rode: npm run seed')

  const { data: clients } = await db
    .from('clients')
    .select('id, name, tax_id, email, birth_date, address_zipcode, address_street, address_number, address_complement, address_city, address_state, site_zipcode, site_street, site_number, site_city, site_state')
    .eq('tenant_id', tenant.id)
  if (!clients?.length) fail('não há clientes. Rode: npm run seed:crm')

  const { data: negotiations } = await db
    .from('negotiations')
    .select('id, name, status, origin, referrer_name, client_id')
    .eq('tenant_id', tenant.id)

  const client = (start) => clients.find((c) => c.name.startsWith(start))
  const negotiation = (start) => negotiations?.find((n) => n.name.startsWith(start))

  const { count: previous } = await db
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  if (previous) {
    console.log(`  Apagando ${previous} contratos da execução anterior...`)
    await db.from('contracts').delete().eq('tenant_id', tenant.id)
  }

  /*
    O contrato congela o cadastro do cliente no momento da assinatura — é a
    decisão registrada em docs/SCHEMA-PLAN.md. O seed reproduz isso copiando o
    cadastro atual, que é o que a tela faz ao criar. Um dos contratos abaixo
    guarda um endereço DIFERENTE do cadastro de propósito: é o caso que prova
    que a cópia é congelamento e não espelho.
  */
  const snapshotOf = (c) => ({
    client_id: c.id,
    client_legal_name: c.name,
    client_tax_id: c.tax_id,
    client_email: c.email,
    client_birth_date: c.birth_date,
    client_address_zipcode: c.address_zipcode,
    client_address_street: c.address_street,
    client_address_number: c.address_number,
    client_address_complement: c.address_complement,
    client_address_city: c.address_city,
    client_address_state: c.address_state,
    site_zipcode: c.site_zipcode,
    site_street: c.site_street,
    site_number: c.site_number,
    site_city: c.site_city,
    site_state: c.site_state,
  })

  const beatriz = client('Beatriz')
  const mariana = client('Mariana')
  const horizonte = client('Construtora')
  const joaquim = client('Joaquim')
  const araguaia = client('Agropecuária')

  const CONTRACTS = [
    // Nascido da negociação ganha. Parcelado e já com parcelas geradas.
    {
      ...snapshotOf(beatriz),
      contract_number: 'FC-2026-018',
      contract_type: 'architecture_interiors',
      total_value: 95000,
      billing_type: 'monthly_installments',
      status: 'in_progress',
      signature_date: daysFromNow(-9),
      start_date: daysFromNow(-7),
      project_name: 'Interiores Alphaville — Beatriz',
      negotiation_id: negotiation('Interiores Alphaville')?.id ?? null,
      origin: 'instagram',
      installment_count: 10,
      first_due_date: daysFromNow(21),
      installment_frequency: 'monthly',
      installments_generated: true,
      layout_study_days: 15,
      renderings_days: 20,
      display_order: 1,
      notes: 'Cliente já tem arquitetura aprovada com outro escritório. Escopo é só interiores.',
    },
    // Parcelamento definido, parcelas AINDA NÃO geradas — o botão do módulo 7.
    {
      ...snapshotOf(araguaia),
      contract_number: 'FC-2026-019',
      contract_type: 'architecture_engineering',
      total_value: 470000,
      billing_type: 'by_phase',
      status: 'approved',
      signature_date: daysFromNow(-2),
      start_date: daysFromNow(5),
      project_name: 'Sede administrativa — Vale do Araguaia',
      negotiation_id: negotiation('Sede administrativa')?.id ?? null,
      origin: 'referral',
      installment_count: 6,
      first_due_date: daysFromNow(30),
      installment_frequency: 'monthly',
      installments_generated: false,
      layout_study_days: 20,
      renderings_days: 25,
      legal_permit_days: 45,
      construction_docs_days: 60,
      engineering_docs_days: 40,
      display_order: 2,
    },
    // À vista, sem parcelamento nenhum: os três campos nulos, como o check exige.
    {
      ...snapshotOf(mariana),
      contract_number: 'FC-2026-020',
      contract_type: 'architecture',
      total_value: 185000,
      billing_type: 'upfront',
      status: 'negotiating',
      project_name: 'Residência Alto de Pinheiros',
      negotiation_id: negotiation('Residência Alto')?.id ?? null,
      origin: 'instagram',
      display_order: 3,
      notes: 'Aguardando aprovação da comissão do condomínio antes da assinatura.',
    },
    /*
      Snapshot DIVERGENTE do cadastro atual, de propósito.

      O cliente mudou de endereço depois de assinar. O cadastro no CRM tem o
      endereço novo; o contrato guarda o que valia na assinatura. É o caso que
      prova que a cópia é congelamento e não espelho — se alguém "consertar" o
      contrato para bater com o cadastro, apaga a informação de qual endereço
      constava do documento assinado.
    */
    {
      ...snapshotOf(joaquim),
      client_address_street: 'Rua Trinta e Um de Março',
      client_address_number: '88',
      client_address_district: undefined,
      contract_number: 'FC-2025-104',
      contract_type: 'architecture',
      total_value: 128000,
      billing_type: 'monthly_installments',
      status: 'completed',
      signature_date: daysFromNow(-380),
      start_date: daysFromNow(-375),
      project_name: 'Casa de campo Caldas Novas',
      origin: 'referral',
      referrer_name: 'Eduardo Sampaio Vilhena',
      installment_count: 12,
      first_due_date: daysFromNow(-350),
      installment_frequency: 'monthly',
      installments_generated: true,
      display_order: 4,
      notes: 'Endereço do cliente no contrato é o da época da assinatura. Ele mudou depois.',
    },
    // Rescindido: o quinto status, que a tela precisa saber desenhar.
    {
      ...snapshotOf(horizonte),
      contract_number: 'FC-2025-097',
      contract_type: 'full',
      total_value: 340000,
      billing_type: 'percent_of_construction',
      status: 'terminated',
      signature_date: daysFromNow(-210),
      start_date: daysFromNow(-200),
      project_name: 'Geminadas Cidade Vera Cruz',
      origin: 'website',
      display_order: 5,
      notes: 'Rescindido a pedido do cliente após mudança no plano de vendas das unidades.',
    },
  ]

  /*
    Uma inserção por contrato, e não um lote.

    O PostgREST, em inserção de várias linhas, monta uma lista única de colunas
    com a união das chaves de todas as linhas — e a linha que não traz uma delas
    recebe NULO EXPLÍCITO, não o valor padrão da coluna. Aqui os contratos têm
    formatos legitimamente diferentes: o parcelado informa `installment_count` e
    `installments_generated`, o "à vista" precisa que os três campos de
    parcelamento fiquem nulos, e o check da tabela exige exatamente isso.

    Uniformizar as chaves resolveria o nulo mas apagaria os valores padrão das
    colunas. Cinco inserções separadas custam nada num seed e deixam cada linha
    usar o padrão do banco onde ela omite. De quebra, o erro aponta QUAL
    contrato falhou em vez de falhar o lote inteiro.

    Isso já mordeu o seed do módulo 3, está comentado lá, e mordeu de novo aqui.
  */
  const created = []
  for (const contract of CONTRACTS) {
    const row = { tenant_id: tenant.id }
    for (const [key, value] of Object.entries(contract)) {
      if (value !== undefined) row[key] = value
    }

    const { data, error } = await db
      .from('contracts')
      .insert(row)
      .select('contract_number, status, total_value, installments_generated, installment_count')
      .single()
    if (error) fail(`inserir contrato ${contract.contract_number}: ${error.message}`)
    created.push(data)
  }

  const total = created.reduce((a, c) => a + Number(c.total_value), 0)
  console.log(`  ${created.length} contratos criados`)
  console.log(`  valor somado: R$ ${total.toLocaleString('pt-BR')}`)
  console.log('')
  for (const c of created) {
    const parcelas = c.installment_count
      ? `${c.installment_count}x ${c.installments_generated ? '(geradas)' : '(a gerar)'}`
      : 'sem parcelamento'
    console.log(`    ${c.contract_number.padEnd(14)}${c.status.padEnd(14)}${parcelas}`)
  }
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
