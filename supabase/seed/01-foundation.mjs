// Seed do modulo 1 (Fundacao) — dados simulados no escritorio de teste.
//
// POR QUE ISTO EXISTE
//   O dado real do cliente so entra no fim do projeto (ver docs/SCHEMA-PLAN.md).
//   Ate la, cada modulo termina com dado simulado para que o sistema possa ser
//   visto por dentro antes de o proximo comecar: lista cheia, lista vazia, erro,
//   filtro, e o recorte que cada funcao enxerga.
//
// POR QUE .mjs E NAO .sql
//   O plano previa supabase/seed/<NN>-<modulo>.sql. Nao da: criar usuario de
//   login exige a admin API do Supabase Auth, que nao tem equivalente em SQL
//   puro. Sem usuario de verdade nao ha JWT, sem JWT nao ha claim de tenant, e
//   sem claim a RLS nao devolve linha nenhuma — o seed pareceria vazio.
//
// COMO RODAR
//   npm run seed
//
// SEGURANCA
//   - Escreve SOMENTE no tenant de slug TEST_TENANT_SLUG. Se existir no banco
//     qualquer tenant fora da lista de escritorios de teste, aborta: sinal de
//     que ha dado real por perto. A lista e a trava vivem em
//     supabase/seed/tenants.mjs, compartilhadas pelos nove seeds.
//   - As senhas sao sorteadas a cada execucao e gravadas em
//     supabase/seed/credenciais.local (ignorado pelo git por *.local).
//   - Rodar de novo apaga o tenant de teste e recria do zero. Nunca toca em
//     outro tenant.
//   - Estas contas sao de desenvolvimento. Precisam ser apagadas antes de o
//     sistema receber dado de producao.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertOnlyTestTenants, TEST_TENANTS } from './tenants.mjs'
import { caminhoCredenciais } from './credenciais-path.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')

const TEST_TENANT_SLUG = 'fernando-costa-teste'
const TEST_EMAIL_DOMAIN = 'fc-teste.com.br'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      /* O .env do ambiente ATIVO vence o shell — ver npm run env:prod|env:dev.
         O contrario deixava um SUPABASE_ACCESS_TOKEN exportado numa sessao
         antiga sobreviver a troca de ambiente, autenticando numa conta enquanto
         o resto apontava para o projeto da outra. */
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env opcional quando as variaveis vem do ambiente */
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

function newPassword() {
  return `Fc${randomBytes(9).toString('base64url')}!7`
}

// A equipe. Espelha as seis funcoes de docs/ARCHITECTURE.md, com nomes e
// cidades plausiveis do dominio (escritorio de arquitetura em Goiania).
// Dado generico do tipo "Colaborador 1" esconde bug de ordenacao, de quebra de
// linha e de nome longo — por isso nao e usado aqui.
const TEAM = [
  {
    key: 'diretora',
    name: 'Helena Vasconcelos',
    role: 'director',
    area: 'commercial',
    status: 'active',
    weekly_hours: 44,
    login: true,
  },
  {
    key: 'coordenador',
    name: 'Rafael Bittencourt',
    role: 'coordinator',
    area: 'projects',
    status: 'active',
    weekly_hours: 44,
    coordinatorOf: 'diretora',
    login: true,
  },
  {
    key: 'financeiro',
    name: 'Juliana Prado',
    role: 'finance',
    area: 'finance',
    status: 'active',
    weekly_hours: 40,
    login: true,
  },
  {
    key: 'administrativo',
    name: 'Marcos Tavares',
    role: 'admin_staff',
    area: 'administrative',
    status: 'active',
    weekly_hours: 40,
    login: true,
  },
  {
    key: 'arquiteta',
    name: 'Camila Nogueira',
    role: 'architect',
    area: 'projects',
    status: 'active',
    weekly_hours: 40,
    coordinatorOf: 'coordenador',
    login: true,
  },
  {
    key: 'estagiario',
    name: 'Pedro Henrique Lima',
    role: 'intern',
    area: 'projects',
    status: 'active',
    weekly_hours: 30,
    coordinatorOf: 'coordenador',
    login: false,
  },
  // Casos de borda que a tela precisa saber desenhar. Sem eles, a lista fica
  // toda verde e o filtro de status nunca e exercitado.
  {
    key: 'ferias',
    name: 'Anna Beatriz Rezende',
    role: 'architect',
    area: 'projects',
    status: 'vacation',
    weekly_hours: 40,
    coordinatorOf: 'coordenador',
    login: false,
  },
  {
    key: 'afastado',
    name: 'Gustavo Menezes',
    role: 'architect',
    area: 'projects',
    status: 'on_leave',
    weekly_hours: 40,
    coordinatorOf: 'coordenador',
    login: true, // consegue logar, mas a RLS nao devolve nada: e o caso 3 dos testes
  },
  // Cadastrado pela Diretora, ainda sem primeiro acesso. user_id fica nulo ate
  // a pessoa entrar e a edge function register-access-request vincular.
  {
    key: 'sem_acesso',
    name: 'Larissa Fontes',
    role: 'coordinator',
    area: 'operations',
    status: 'active',
    weekly_hours: 44,
    login: false,
  },
]

// Quais menus cada funcao enxerga. Reproduz o recorte que o Layout.jsx do
// original aplica por funcao, agora como dado em vez de codigo.
const PERMISSIONS_BY_ROLE = {
  director: { view: 'all', edit: 'all' },
  coordinator: {
    view: ['dashboard_executive', 'crm', 'pipeline', 'projects', 'map', 'project_flow', 'activities', 'client_budget', 'suppliers'],
    edit: ['projects', 'project_flow', 'activities'],
  },
  finance: {
    view: ['dashboard_executive', 'receivables', 'payables', 'contracts', 'projects'],
    edit: ['receivables', 'payables'],
  },
  admin_staff: {
    view: ['dashboard_overview', 'crm', 'pipeline', 'contracts', 'projects', 'project_flow', 'activities', 'suppliers', 'client_budget', 'team'],
    edit: ['crm', 'pipeline', 'contracts', 'suppliers'],
  },
  // Arquiteto e Estagiario nao recebem menu: o original os manda direto para
  // "Minhas Atividades", que e liberada por funcao e nunca por permissao.
  architect: { view: [], edit: [] },
  intern: { view: [], edit: [] },
}

async function main() {
  console.log(`\nSeed do modulo 1 — ${URL}\n`)

  // 1. Trava de seguranca -----------------------------------------------------
  // Aborta se houver no banco tenant fora da lista de escritorios de teste.
  // A lista, e o que acontece quando o escritorio real nascer, estao em
  // supabase/seed/tenants.mjs.
  const allTenants = await assertOnlyTestTenants(db)

  // 2. Limpeza do que sobrou de execucao anterior -----------------------------
  const previous = allTenants.find((t) => t.slug === TEST_TENANT_SLUG)
  if (previous) {
    console.log('  Limpando execucao anterior...')
    const { data: oldUsers } = await db
      .from('collaborators')
      .select('user_id')
      .eq('tenant_id', previous.id)
      .not('user_id', 'is', null)

    // O tenant cascateia colaboradores, permissoes, solicitacoes, dominios e
    // vinculos. Os usuarios de auth.users nao cascateiam: vao um a um.
    await db.from('tenants').delete().eq('id', previous.id)
    for (const row of oldUsers ?? []) {
      await db.auth.admin.deleteUser(row.user_id)
    }
  }

  // 3. Escritorio -------------------------------------------------------------
  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .insert({ name: TEST_TENANTS[TEST_TENANT_SLUG].name, slug: TEST_TENANT_SLUG })
    .select()
    .single()
  if (tenantError) fail(`criar tenant: ${tenantError.message}`)
  console.log(`  Escritorio criado: ${tenant.name}`)

  const { error: domainError } = await db
    .from('tenant_email_domains')
    .insert({ tenant_id: tenant.id, domain: TEST_EMAIL_DOMAIN })
  if (domainError) fail(`criar dominio: ${domainError.message}`)

  // 4. Colaboradores, usuarios de login e vinculos ----------------------------
  const credentials = []
  const byKey = {}

  for (const person of TEAM) {
    const email = `${person.key}@${TEST_EMAIL_DOMAIN}`
    let userId = null

    if (person.login) {
      const password = newPassword()
      const { data: created, error: userError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: person.name },
      })
      if (userError) fail(`criar usuario ${email}: ${userError.message}`)
      userId = created.user.id
      credentials.push({ name: person.name, role: person.role, status: person.status, email, password })
    }

    const { data: collaborator, error: collaboratorError } = await db
      .from('collaborators')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        name: person.name,
        role: person.role,
        area: person.area,
        email,
        status: person.status,
        weekly_hours: person.weekly_hours,
      })
      .select()
      .single()
    if (collaboratorError) fail(`criar colaborador ${person.name}: ${collaboratorError.message}`)

    byKey[person.key] = collaborator

    if (userId) {
      const { error: linkError } = await db.from('tenant_users').insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: person.role === 'director' ? 'owner' : 'member',
      })
      if (linkError) fail(`vincular ${person.name} ao escritorio: ${linkError.message}`)
    }
  }

  // Coordenacao so depois de todos existirem: a FK e auto-referente.
  for (const person of TEAM) {
    if (!person.coordinatorOf) continue
    const { error } = await db
      .from('collaborators')
      .update({ coordinator_id: byKey[person.coordinatorOf].id })
      .eq('id', byKey[person.key].id)
    if (error) fail(`definir coordenador de ${person.name}: ${error.message}`)
  }
  console.log(`  ${TEAM.length} colaboradores criados (${credentials.length} com login)`)

  // 5. Permissoes -------------------------------------------------------------
  const { data: menus, error: menusError } = await db.from('menus').select('key, parent_key')
  if (menusError) fail(`ler menus: ${menusError.message}`)

  const groupKeys = new Set(menus.map((m) => m.parent_key).filter(Boolean))
  const leafKeys = menus.filter((m) => !groupKeys.has(m.key)).map((m) => m.key)

  const permissionRows = []
  for (const person of TEAM) {
    const rule = PERMISSIONS_BY_ROLE[person.role]
    for (const key of leafKeys) {
      const canView = rule.view === 'all' || rule.view.includes(key)
      const canEdit = rule.edit === 'all' || rule.edit.includes(key)
      permissionRows.push({
        tenant_id: tenant.id,
        collaborator_id: byKey[person.key].id,
        menu_key: key,
        can_view: canView,
        // O banco recusa can_edit sem can_view. Nao dependa disso: o erro
        // apareceria como falha do seed inteiro, longe da causa.
        can_edit: canEdit && canView,
      })
    }
  }

  const { error: permError } = await db.from('collaborator_permissions').insert(permissionRows)
  if (permError) fail(`gravar permissoes: ${permError.message}`)
  console.log(`  ${permissionRows.length} permissoes gravadas (${leafKeys.length} menus x ${TEAM.length} pessoas)`)

  // 6. Fila de aprovacao ------------------------------------------------------
  // A tela de Controle de Acesso precisa de pendente, aprovada e recusada para
  // que os tres estados visuais possam ser conferidos.
  const now = new Date()
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()

  const { error: requestsError } = await db.from('access_requests').insert([
    {
      tenant_id: tenant.id,
      email: `bruno.almeida@${TEST_EMAIL_DOMAIN}`,
      name: 'Bruno Almeida',
      status: 'pending',
      requested_at: daysAgo(2),
      last_attempt_at: daysAgo(0),
      attempts: 4,
      source: 'login',
    },
    {
      tenant_id: tenant.id,
      email: `tereza.campos@${TEST_EMAIL_DOMAIN}`,
      name: 'Tereza Campos',
      status: 'rejected',
      requested_at: daysAgo(21),
      last_attempt_at: daysAgo(20),
      attempts: 1,
      source: 'signup',
      decided_by: byKey.diretora.id,
      decided_at: daysAgo(19),
    },
    {
      tenant_id: tenant.id,
      email: `larissa.fontes@${TEST_EMAIL_DOMAIN}`,
      name: 'Larissa Fontes',
      status: 'approved',
      requested_at: daysAgo(9),
      last_attempt_at: daysAgo(9),
      attempts: 2,
      source: 'login_email',
      decided_by: byKey.diretora.id,
      decided_at: daysAgo(8),
    },
  ])
  if (requestsError) fail(`criar solicitacoes: ${requestsError.message}`)
  console.log('  3 solicitacoes de acesso (1 pendente, 1 aprovada, 1 recusada)')

  // 7. Credenciais ------------------------------------------------------------
  const file = caminhoCredenciais()
  const content =
    `Contas de teste — escritorio "${TEST_TENANT_SLUG}"\n` +
    `Gerado em ${now.toISOString()}\n` +
    `Projeto: ${URL}\n\n` +
    `Arquivo ignorado pelo git (*.local). Contas de desenvolvimento:\n` +
    `apagar antes de o sistema receber dado de producao.\n\n` +
    credentials
      .map(
        (c) =>
          `${c.name}\n  funcao: ${c.role}   status: ${c.status}\n  email:  ${c.email}\n  senha:  ${c.password}\n`,
      )
      .join('\n')
  writeFileSync(file, content, { mode: 0o600 })

  console.log(`\n  Credenciais em ${caminhoCredenciais().replace(ROOT + '/', '')}\n`)
  for (const c of credentials) {
    console.log(`    ${c.email.padEnd(34)} ${c.role.padEnd(12)} ${c.status}`)
  }
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
