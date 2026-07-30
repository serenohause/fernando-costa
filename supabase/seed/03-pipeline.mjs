// Seed do modulo 3 (Pipeline) — negociacoes e briefings no escritorio de teste.
//
// COMO RODAR
//   npm run seed:pipeline
//   Depende dos seeds 1 e 2 (escritorio, colaboradores e clientes).
//
// SEGURANCA
//   Mesma trava dos anteriores: pergunta ao banco se existe tenant que nao seja
//   o de teste e aborta se existir. Rodar de novo apaga so o que ele criou.
//
// SOBRE OS DADOS
//   O funil precisa ter linha em toda etapa, senao a tela de quadro nasce com
//   colunas vazias e ninguem ve o layout de verdade. Alem disso, os casos que
//   quebram tela de pipeline: negociacao ganha, perdida com motivo, valor alto e
//   valor nulo, sem cliente vinculado, com varios servicos e com nenhum.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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
const URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) {
  console.error('Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.')
  process.exit(1)
}

const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const hoursFromNow = (n) => new Date(Date.now() + n * 3600_000).toISOString()

async function main() {
  console.log(`\nSeed do módulo 3 (Pipeline) — ${URL}\n`)

  const { data: foreign, error: foreignError } = await db
    .from('tenants')
    .select('slug, name')
    .neq('slug', TEST_TENANT_SLUG)
    .limit(5)
  if (foreignError) fail(`não consegui verificar os tenants: ${foreignError.message}`)
  if (foreign.length > 0) {
    fail(
      `existe tenant que não é o de teste no banco:\n` +
        foreign.map((t) => `    - ${t.slug} (${t.name})`).join('\n'),
    )
  }

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()
  if (!tenant) fail(`escritório de teste não existe. Rode: npm run seed`)

  const { data: clients } = await db
    .from('clients')
    .select('id, name')
    .eq('tenant_id', tenant.id)
    .order('name')
  if (!clients?.length) fail('não há clientes. Rode: npm run seed:crm')

  const { data: team } = await db
    .from('collaborators')
    .select('id, name, role')
    .eq('tenant_id', tenant.id)
  const byRole = (r) => team.find((c) => c.role === r)
  const diretora = byRole('director')
  const coordenador = byRole('coordinator')
  const administrativo = byRole('admin_staff')
  if (!diretora) fail('não achei a Diretora no escritório de teste')

  const client = (nameStart) => clients.find((c) => c.name.startsWith(nameStart))

  // Limpeza: negotiations cascateia serviços e histórico; intakes têm FK própria.
  const { count: previous } = await db
    .from('negotiations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  if (previous) {
    console.log(`  Apagando ${previous} negociações da execução anterior...`)
    await db.from('client_intakes').delete().eq('tenant_id', tenant.id)
    await db.from('negotiations').delete().eq('tenant_id', tenant.id)
  } else {
    await db.from('client_intakes').delete().eq('tenant_id', tenant.id)
  }

  /*
    Uma negociação por etapa do funil, para o quadro nascer com todas as colunas
    povoadas. Mais os casos de borda: ganha, perdida com motivo, sem cliente
    vinculado, valor nulo, valor alto.
  */
  const NEGOTIATIONS = [
    {
      name: 'Residência Alto de Pinheiros — Mariana',
      client: 'Mariana',
      owner: diretora,
      funnel_stage: 'lead_received',
      status: 'active',
      estimated_value: 185000,
      close_probability: 20,
      origin: 'instagram',
      expected_close_date: daysFromNow(75),
      services: ['architecture', 'interiors'],
    },
    {
      name: 'Reforma de apartamento — Eduardo Vilhena',
      client: 'Eduardo',
      owner: coordenador ?? diretora,
      funnel_stage: 'qualified',
      status: 'active',
      estimated_value: 62000,
      close_probability: 45,
      origin: 'referral',
      referrer_name: 'Mariana Rezende Andrade',
      expected_close_date: daysFromNow(40),
      services: ['interiors'],
    },
    {
      name: 'Geminadas Cidade Vera Cruz — Horizonte Norte',
      client: 'Construtora',
      owner: diretora,
      funnel_stage: 'proposal_sent',
      status: 'active',
      estimated_value: 340000,
      close_probability: 60,
      origin: 'website',
      expected_close_date: daysFromNow(25),
      services: ['architecture', 'structural', 'electrical', 'plumbing'],
    },
    {
      name: 'Casa de campo Caldas Novas — Joaquim',
      client: 'Joaquim',
      owner: administrativo ?? diretora,
      funnel_stage: 'negotiating',
      status: 'active',
      estimated_value: 128000,
      close_probability: 75,
      origin: 'referral',
      referrer_name: 'Eduardo Sampaio Vilhena',
      expected_close_date: daysFromNow(12),
      services: ['architecture', 'interiors', 'consulting'],
    },
    {
      name: 'Sede administrativa — Vale do Araguaia',
      client: 'Agropecuária',
      owner: diretora,
      funnel_stage: 'closing',
      status: 'active',
      estimated_value: 470000,
      close_probability: 90,
      origin: 'referral',
      expected_close_date: daysFromNow(5),
      services: ['architecture', 'structural'],
    },
    // Ganha: a coluna do quadro precisa mostrar o que sai do funil por cima.
    {
      name: 'Interiores Alphaville — Beatriz Pinheiro',
      client: 'Beatriz',
      owner: coordenador ?? diretora,
      funnel_stage: 'closing',
      status: 'won',
      estimated_value: 95000,
      close_probability: 100,
      origin: 'instagram',
      closed_at: daysFromNow(-9),
      services: ['interiors'],
    },
    // Perdida com motivo: exercita os campos que só existem nesse estado.
    {
      name: 'Casa Pirenópolis — Maria das Graças',
      client: 'Maria das Graças',
      owner: diretora,
      funnel_stage: 'negotiating',
      status: 'lost',
      estimated_value: 210000,
      close_probability: 0,
      origin: 'other',
      closed_at: daysFromNow(-21),
      loss_reason: 'chose_competitor',
      loss_notes: 'Escolheu escritório de Brasília por proximidade das reuniões presenciais.',
      services: ['architecture'],
    },
    // Sem cliente vinculado e sem valor: lead cru, que é como a maioria entra.
    {
      name: 'Contato de evento — sem escopo definido',
      client: null,
      owner: diretora,
      funnel_stage: 'lead_received',
      status: 'active',
      estimated_value: null,
      close_probability: null,
      origin: 'event',
      services: [],
    },
  ]

  const created = []
  for (const n of NEGOTIATIONS) {
    const linked = n.client ? client(n.client) : null
    const { data: row, error } = await db
      .from('negotiations')
      .insert({
        tenant_id: tenant.id,
        name: n.name,
        client_id: linked?.id ?? null,
        commercial_owner_id: n.owner.id,
        estimated_value: n.estimated_value,
        close_probability: n.close_probability,
        status: n.status,
        funnel_stage: n.funnel_stage,
        origin: n.origin,
        referrer_name: n.referrer_name ?? null,
        expected_close_date: n.expected_close_date ?? null,
        closed_at: n.closed_at ?? null,
        loss_reason: n.loss_reason ?? null,
        loss_notes: n.loss_notes ?? null,
      })
      .select('id, name, status, funnel_stage')
      .single()
    if (error) fail(`criar negociação "${n.name}": ${error.message}`)

    if (n.services.length) {
      const { error: sError } = await db.from('negotiation_services').insert(
        n.services.map((s) => ({
          tenant_id: tenant.id,
          negotiation_id: row.id,
          service_type: s,
        })),
      )
      if (sError) fail(`serviços de "${n.name}": ${sError.message}`)
    }

    created.push({ ...row, services: n.services.length, clientId: linked?.id ?? null })
  }

  // Uma troca de responsável, para a tela de histórico ter o que mostrar.
  if (coordenador) {
    const alvo = created.find((c) => c.name.startsWith('Casa de campo'))
    const { error } = await db.from('negotiation_owner_history').insert({
      tenant_id: tenant.id,
      negotiation_id: alvo.id,
      previous_owner_id: diretora.id,
      new_owner_id: administrativo?.id ?? coordenador.id,
      changed_by_id: diretora.id,
      changed_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    })
    if (error) fail(`histórico de responsável: ${error.message}`)
  }

  /*
    Briefings nos três estados que a tela pública precisa saber desenhar. O
    válido tem 24h como no original; os outros já nascem no estado final.
  */
  const intakeFor = (nameStart, extra) => {
    const neg = created.find((c) => c.name.startsWith(nameStart))
    return { tenant_id: tenant.id, negotiation_id: neg.id, client_id: neg.clientId, ...extra }
  }

  /*
    `created_at` explícito nas TRÊS linhas, e não só nas duas do passado.

    Dois motivos, e o segundo não é óbvio:

    1. A tabela tem check `expires_at > created_at`, e o default de `created_at`
       é agora — então vencimento no passado com criação em agora é recusado,
       com razão: link que nasce vencido é dado impossível. Um briefing expirado
       de verdade foi criado antes de vencer, e é isso que o seed reproduz.

    2. Em inserção de várias linhas, o PostgREST monta UMA lista de colunas com
       a união das chaves de todas as linhas, e a linha que não traz uma delas
       recebe NULO EXPLÍCITO — não o valor padrão da coluna. Informar
       `created_at` em duas linhas e omitir na terceira faz a terceira falhar
       com "null value in column created_at". Ou todas informam, ou nenhuma.
  */
  const { data: intakes, error: iError } = await db
    .from('client_intakes')
    .insert([
      intakeFor('Residência Alto', {
        status: 'active',
        created_at: hoursFromNow(0),
        expires_at: hoursFromNow(24),
      }),
      /*
        O briefing enviado vem PREENCHIDO, e com dado que DIVERGE do cadastro.

        Sem isso a tela de conferência mostra "Nada a aplicar" e não dá para ver
        se ela funciona. O que ela existe para resolver é justamente a
        divergência: o cliente corrige o telefone, acrescenta o CPF que faltava,
        e informa o endereço da obra que ninguém tinha.

        Comparando com o cadastro do Eduardo no seed do CRM:
        - telefone: DIFERENTE (ele trocou de número)
        - e-mail: IGUAL (não deve aparecer como mudança)
        - CPF: IGUAL, mas escrito com pontuação diferente — a tela precisa
          saber que 816.247.390-25 e 81624739025 são o mesmo documento, senão
          oferece "aplicar" para algo que não mudou
        - data de nascimento e endereço da obra: NOVOS, o cadastro não tem
      */
      intakeFor('Reforma de apartamento', {
        status: 'submitted',
        created_at: hoursFromNow(-64),
        expires_at: hoursFromNow(-40),
        submitted_at: hoursFromNow(-44),
        full_name: 'Eduardo Sampaio Vilhena',
        phone: '(62) 99614-2280',
        email: 'eduardo.vilhena@outlook.com',
        city: 'Goiânia',
        state: 'GO',
        country: 'Brasil',
        client_type: 'individual',
        tax_id: '816.247.390-25',
        birth_date: '1979-08-23',
        address_zipcode: '74810-100',
        address_street: 'Avenida Portugal',
        address_number: '1240',
        address_complement: 'Apto 1802',
        address_district: 'Setor Marista',
        address_city: 'Goiânia',
        address_state: 'GO',
        site_zipcode: '74265-090',
        site_street: 'Rua C-140',
        site_number: '77',
        site_district: 'Jardim América',
        site_city: 'Goiânia',
        site_state: 'GO',
      }),
      intakeFor('Geminadas Cidade', {
        status: 'expired',
        created_at: hoursFromNow(-30),
        expires_at: hoursFromNow(-6),
      }),
    ])
    .select('token, status, expires_at')
  if (iError) fail(`criar briefings: ${iError.message}`)

  console.log(`  ${created.length} negociações (uma por etapa do funil, mais ganha, perdida e lead cru)`)
  console.log(`  ${created.reduce((a, c) => a + c.services, 0)} serviços vinculados`)
  console.log(`  ${intakes.length} briefings: ativo, enviado e expirado`)
  console.log('')
  for (const c of created) {
    console.log(`    ${c.name.slice(0, 44).padEnd(46)}${c.funnel_stage.padEnd(16)}${c.status}`)
  }
  console.log('\n  Tokens de briefing (o ativo abre o formulário público):')
  for (const i of intakes) {
    console.log(`    ${i.status.padEnd(11)} ${i.token}`)
  }
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
