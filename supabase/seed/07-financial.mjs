// Seed do modulo 7 (Financeiro).
//
// COMO RODAR
//   npm run seed:financial
//   Depende dos seeds 1 a 5 (precisa de contratos e projetos).
//
// SOBRE OS DADOS
//   As parcelas a receber saem da FUNCAO generate_contract_installments, e nao
//   de linhas escritas a mao. Motivo: e a funcao que a tela vai chamar, e seed
//   que grava direto testaria um caminho que ninguem usa. De quebra, o seed
//   confere que a soma das parcelas bate com o contrato — se o arredondamento
//   quebrar, aparece aqui e nao na conciliacao bancaria de alguem.
//
//   As contas a pagar sao escritas direto: nao ha funcao para elas, e o que
//   importa e cobrir os estados que a tela desenha.
//
//   Casos de borda: parcela paga, parcela vencida, parcela renegociada vencida
//   (que a decisao do usuario diz que CONTA como atraso), despesa recorrente com
//   ocorrencias, e despesa avulsa.

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
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/*
  A geração de parcelas NÃO roda com a chave de serviço.

  `generate_contract_installments` é `security definer` — passa por cima da RLS
  — e por isso confere a autorização por dentro, com `can_edit_menu`. A chave de
  serviço não é colaborador de ninguém: `auth_collaborator_id()` devolve nulo e
  a função recusa com `not_authorized`. Isso é a função funcionando, não um
  problema do banco.

  Então o seed faz login como a Diretora e chama a função pelo mesmo caminho que
  a tela vai usar. De quebra, ele passa a provar que a autorização por dentro
  funciona: se ela quebrasse, este seed continuaria passando com a chave de
  serviço e ninguém notaria.
*/
async function signedInAsDirector() {
  const creds = readFileSync(resolve(ROOT, 'supabase/seed/credenciais.local'), 'utf8')
  const m = creds.match(/email:\s+(diretora\S+)\n\s+senha:\s+(\S+)/)
  if (!m) fail('não achei as credenciais da Diretora. Rode: npm run seed')

  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email: m[1], password: m[2] })
  if (error) fail(`login da Diretora: ${error.message}`)
  return client
}

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const monthStart = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n, 1)
  return d.toISOString().slice(0, 10)
}
const brl = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

async function insertOne(table, row, select) {
  const clean = {}
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v
  const { data, error } = await db.from(table).insert(clean).select(select).single()
  if (error) fail(`inserir em ${table}: ${error.message}`)
  return data
}

async function main() {
  console.log(`\nSeed do módulo 7 (Financeiro) — ${env.VITE_SUPABASE_URL}\n`)

  const { data: foreign } = await db
    .from('tenants')
    .select('slug')
    .neq('slug', TEST_TENANT_SLUG)
    .limit(1)
  if (foreign?.length) fail(`existe tenant que não é o de teste: ${foreign[0].slug}`)

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()
  if (!tenant) fail('escritório de teste não existe. Rode: npm run seed')

  const { data: contracts } = await db
    .from('contracts')
    .select('id, contract_number, total_value, installment_count, installments_generated')
    .eq('tenant_id', tenant.id)
  const { data: projects } = await db
    .from('projects')
    .select('id, name')
    .eq('tenant_id', tenant.id)
  if (!contracts?.length) fail('não há contratos. Rode: npm run seed:contracts')

  const contract = (n) => contracts.find((c) => c.contract_number === n)
  const project = (s) => projects?.find((p) => p.name.startsWith(s))

  /*
    Limpeza — incondicional, de propósito.

    A versão anterior só limpava `if (prevR || prevP)`, e isso quebrou: uma
    rodada que morre DEPOIS de gravar as categorias e ANTES de gravar as contas
    deixa o banco num estado que a checagem lê como "vazio", e a rodada seguinte
    bate na chave única de `financial_categories`. Seed tem que ser re-executável
    a partir de qualquer meio-caminho, não só a partir do estado limpo.
  */
  const { count: prevR } = await db
    .from('accounts_receivable')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  const { count: prevP } = await db
    .from('accounts_payable')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  console.log(`  Apagando ${prevR ?? 0} recebíveis e ${prevP ?? 0} pagamentos anteriores...`)
  await db.from('accounts_receivable').delete().eq('tenant_id', tenant.id)
  // Ocorrências antes da mãe: a FK aponta para a linha-mãe.
  await db.from('accounts_payable').delete().eq('tenant_id', tenant.id).not('recurrence_parent_id', 'is', null)
  await db.from('accounts_payable').delete().eq('tenant_id', tenant.id)
  await db.from('financial_categories').delete().eq('tenant_id', tenant.id)
  // A bandeira do contrato tem que voltar, senão a função recusa gerar de novo.
  await db
    .from('contracts')
    .update({ installments_generated: false })
    .eq('tenant_id', tenant.id)

  // ── Categorias ────────────────────────────────────────────────────────────
  const CATEGORIES = [
    { name: 'Honorários de projeto', type: 'revenue', cost_center: 'architecture' },
    { name: 'Consultoria e mentoria', type: 'revenue', cost_center: 'mentoring' },
    { name: 'Folha e encargos', type: 'expense', cost_center: 'administrative' },
    { name: 'Softwares e licenças', type: 'expense', cost_center: 'administrative' },
    { name: 'Terceirizados de projeto', type: 'expense', cost_center: 'architecture' },
    { name: 'Materiais de obra', type: 'expense', cost_center: 'construction' },
  ]
  for (const c of CATEGORIES) {
    await insertOne('financial_categories', { tenant_id: tenant.id, ...c }, 'id')
  }

  /*
    ── Parcelas a receber, pela FUNÇÃO ─────────────────────────────────────

    Dois contratos com parcelamento definido no seed do módulo 4:
    FC-2026-018 (R$ 95.000 em 10) e FC-2026-019 (R$ 470.000 em 6). O segundo é
    justamente um dos valores que não divide redondo.
  */
  const asDirector = await signedInAsDirector()

  const gerados = []
  for (const numero of ['FC-2026-018', 'FC-2026-019', 'FC-2025-104']) {
    const c = contract(numero)
    if (!c?.installment_count) continue

    const { data, error } = await asDirector.rpc('generate_contract_installments', {
      p_contract_id: c.id,
    })
    if (error) fail(`gerar parcelas de ${numero}: ${error.message}`)
    if (data?.error) fail(`gerar parcelas de ${numero}: ${data.error}`)
    gerados.push({ numero, total: c.total_value, resultado: data })
  }

  /*
    CONFERE A SOMA, em vez de confiar nela.

    É a razão de o seed existir neste formato. Se o arredondamento quebrar, o
    sintoma no uso real seria a conciliação bancária não fechando por centavos,
    meses depois, sem ninguém saber de onde veio. Aqui falha na hora.
  */
  for (const g of gerados) {
    const c = contract(g.numero)
    const { data: parcelas } = await db
      .from('accounts_receivable')
      .select('value, installment_number')
      .eq('contract_id', c.id)
      .order('installment_number')

    const soma = parcelas.reduce((s, p) => s + Number(p.value), 0)
    const esperado = Number(c.total_value)
    if (Math.abs(soma - esperado) > 0.001) {
      fail(
        `as parcelas de ${g.numero} somam R$ ${brl(soma)} e o contrato é R$ ${brl(esperado)}. ` +
          `Diferença de R$ ${brl(soma - esperado)}.`,
      )
    }
    console.log(
      `  ${g.numero}: ${parcelas.length} parcelas somando R$ ${brl(soma)} ` +
        `(1ª de R$ ${brl(parcelas[0].value)}, demais de R$ ${brl(parcelas[1]?.value ?? parcelas[0].value)})`,
    )
  }

  /*
    Estados que a tela precisa desenhar. As parcelas nascem todas 'forecast' da
    função; algumas viram pagas, uma vira renegociada vencida — que pela decisão
    do usuário CONTA como atraso, e é o caso que prova a regra.
  */
  const { data: todas } = await db
    .from('accounts_receivable')
    .select('id, due_date, installment_number, contract_id')
    .eq('tenant_id', tenant.id)
    .order('due_date')

  const primeiras = todas.slice(0, 3)
  for (const [i, p] of primeiras.entries()) {
    await db
      .from('accounts_receivable')
      .update({
        status: 'paid',
        payment_date: dayOffset(-20 + i * 5),
        payment_method: i === 0 ? 'pix' : 'boleto',
        due_date: dayOffset(-25 + i * 5),
      })
      .eq('id', p.id)
  }
  // Uma vencida e não paga: entra em atraso pelo caminho comum.
  if (todas[3]) {
    await db.from('accounts_receivable').update({ due_date: dayOffset(-6) }).eq('id', todas[3].id)
  }
  // Uma renegociada E vencida: o caso que a decisão do usuário cobre.
  if (todas[4]) {
    await db
      .from('accounts_receivable')
      .update({ status: 'renegotiated', due_date: dayOffset(-2) })
      .eq('id', todas[4].id)
  }

  // ── Contas a pagar ────────────────────────────────────────────────────────
  const araguaia = project('Sede administrativa')

  // Recorrente: a linha-mãe é o modelo, as ocorrências apontam para ela.
  const modelo = await insertOne(
    'accounts_payable',
    {
      tenant_id: tenant.id,
      supplier_name: 'Autodesk',
      description: 'Assinatura AutoCAD + Revit (3 licenças)',
      category: 'software',
      value: 2340,
      due_date: monthStart(0),
      status: 'forecast',
      competence_month: monthStart(0),
      is_recurring: true,
      recurrence_frequency: 'monthly',
      recurrence_start_date: monthStart(-3),
      recurrence_count: 12,
      recurrence_status: 'active',
    },
    'id',
  )

  for (let i = -3; i <= 1; i++) {
    await insertOne(
      'accounts_payable',
      {
        tenant_id: tenant.id,
        supplier_name: 'Autodesk',
        description: `Assinatura AutoCAD + Revit — ${i <= 0 ? 'competência passada' : 'próxima'}`,
        category: 'software',
        value: 2340,
        due_date: monthStart(i),
        status: i < 0 ? 'paid' : 'forecast',
        payment_date: i < 0 ? monthStart(i) : undefined,
        payment_method: i < 0 ? 'direct_debit' : undefined,
        competence_month: monthStart(i),
        recurrence_parent_id: modelo.id,
      },
      'id',
    )
  }

  const AVULSAS = [
    {
      supplier_name: 'Studio Render 3D',
      description: 'Perspectivas externas — Alphaville',
      category: 'contractors',
      value: 4800,
      due_date: dayOffset(-9),
      status: 'forecast',
      competence_month: monthStart(0),
      project_id: project('Interiores Alphaville')?.id,
    },
    {
      supplier_name: 'Prefeitura de Aragarças',
      description: 'Taxa de alvará de construção',
      category: 'taxes',
      value: 1876.4,
      due_date: dayOffset(12),
      status: 'forecast',
      competence_month: monthStart(0),
      project_id: araguaia?.id,
    },
    {
      supplier_name: 'Contabilidade Prisma',
      description: 'Honorários contábeis do mês',
      category: 'office',
      value: 1450,
      due_date: dayOffset(-3),
      status: 'paid',
      payment_date: dayOffset(-3),
      payment_method: 'pix',
      competence_month: monthStart(0),
    },
    {
      supplier_name: 'Marmoraria São Jorge',
      description: 'Bancadas de granito — entrada da sede',
      category: 'materials',
      value: 12300,
      due_date: dayOffset(-15),
      status: 'renegotiated',
      competence_month: monthStart(-1),
      project_id: araguaia?.id,
    },
  ]
  for (const p of AVULSAS) {
    await insertOne('accounts_payable', { tenant_id: tenant.id, ...p }, 'id')
  }

  // ── Resumo, lido das VIEWS, que é de onde a tela lê ───────────────────────
  const { data: recv } = await db
    .from('accounts_receivable_status')
    .select('value, status, is_overdue')
    .eq('tenant_id', tenant.id)
  const { data: pay } = await db
    .from('accounts_payable_status')
    .select('value, status, is_overdue')
    .eq('tenant_id', tenant.id)

  const soma = (rows, f) => rows.filter(f).reduce((s, r) => s + Number(r.value), 0)

  console.log('')
  console.log(`  A receber: ${recv.length} parcelas`)
  console.log(`    previsto    R$ ${brl(soma(recv, (r) => r.status === 'forecast'))}`)
  console.log(`    recebido    R$ ${brl(soma(recv, (r) => r.status === 'paid'))}`)
  console.log(`    EM ATRASO   R$ ${brl(soma(recv, (r) => r.is_overdue))}  (${recv.filter((r) => r.is_overdue).length} parcelas)`)
  console.log(`  A pagar: ${pay.length} lançamentos`)
  console.log(`    previsto    R$ ${brl(soma(pay, (r) => r.status === 'forecast'))}`)
  console.log(`    pago        R$ ${brl(soma(pay, (r) => r.status === 'paid'))}`)
  console.log(`    EM ATRASO   R$ ${brl(soma(pay, (r) => r.is_overdue))}  (${pay.filter((r) => r.is_overdue).length} lançamentos)`)
  console.log('')

  /*
    Confere que o atraso inclui renegociado, que é a decisão do usuário na 0046.
    Sem esta checagem, alguém voltando a regra para "só previsto" não faria
    nenhum teste do seed falhar.
  */
  const renegociadaVencida = recv.find((r) => r.status === 'renegotiated' && r.is_overdue)
  if (!renegociadaVencida) {
    fail(
      'nenhuma parcela renegociada e vencida aparece em atraso. ' +
        'A regra da migration 0046 diz que deve aparecer — ver o cabeçalho dela.',
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
