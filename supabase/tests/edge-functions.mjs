// Teste das edge functions do modulo 1 (Fundacao), contra o projeto hospedado.
//
// Irmao dos testes de RLS: la o alvo e a policy, aqui o alvo e o que roda com
// service_role, ou seja, justamente o que a RLS nao consegue barrar. As tres
// funcoes tem chave de bypass na mao; o que impede abuso e a checagem de
// autorizacao que elas fazem lendo o banco. E isso que este arquivo exercita.
//
// COMO RODAR
//   npm run test:functions
//
// PRE-REQUISITOS
//   - .env com VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e
//     SUPABASE_SERVICE_ROLE_KEY (esta ultima nunca com prefixo VITE_).
//   - As tres funcoes publicadas: supabase functions deploy <nome>.
//   - Migration 0013 aplicada (public.approve_access_request). Sem ela os casos
//     de aprovacao falham com 500.
//   - Auth Hook custom_access_token_hook ligado no painel (nao e usado nas
//     asercoes daqui, mas o vinculo em tenant_users so vira acesso com ele).
//
// LIMPEZA
//   O finally apaga os dois tenants de teste (que cascateiam colaboradores,
//   permissoes, solicitacoes, dominios e vinculos) e os usuarios de auth.users
//   com o prefixo fixo. Rodar de novo limpa o que tiver sobrado.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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
const URL_BASE = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !ANON_KEY || !SERVICE_KEY) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  process.exit(2)
}

const PREFIX = 'ef-test-'
const DOMAIN_A = 'ef-test-a.example.com'
const DOMAIN_B = 'ef-test-b.example.com'
const DOMAIN_UNKNOWN = 'ef-test-desconhecido.example.com'
const PASSWORD = 'ef-test-' + Math.random().toString(36).slice(2) + 'Aa1!'

const admin = createClient(URL_BASE, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const loginClient = createClient(URL_BASE, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const results = []

function record(caso, descricao, expected, observed) {
  results.push({ caso, descricao, expected, observed, pass: expected === observed })
}

function check(caso, descricao, expected, observed) {
  record(caso, descricao, String(expected), String(observed))
}

async function callFn(name, { token, body, method = 'POST', rawBody } = {}) {
  const headers = { apikey: ANON_KEY, 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const init = { method, headers }
  if (method === 'POST') init.body = rawBody ?? JSON.stringify(body ?? {})

  const res = await fetch(`${URL_BASE}/functions/v1/${name}`, init)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* resposta nao-JSON e informacao por si so */
  }
  return { status: res.status, json, text }
}

// 'STATUS:code' condensa o que interessa: HTTP + o codigo estavel do contrato.
function outcome({ status, json }) {
  const code = json?.error?.code ?? json?.status ?? null
  return code ? `${status}:${code}` : String(status)
}

async function createUser(slug, domain) {
  const email = `${PREFIX}${slug}@${domain}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  return { id: data.user.id, email }
}

async function signIn(email) {
  const { data, error } = await loginClient.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login falhou para ${email}: ${error.message}`)
  return data.session.access_token
}

async function cleanup() {
  await admin.from('tenants').delete().in('slug', [`${PREFIX}a`, `${PREFIX}b`])
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith(PREFIX)) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
}

async function insertOne(table, row, columns = 'id') {
  const { data, error } = await admin.from(table).insert(row).select(columns).single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data
}

async function main() {
  await cleanup()

  // Fixture -----------------------------------------------------------------
  const tenantA = await insertOne('tenants', { name: 'EF Test A', slug: `${PREFIX}a` })
  const tenantB = await insertOne('tenants', { name: 'EF Test B', slug: `${PREFIX}b` })

  await insertOne('tenant_email_domains', { tenant_id: tenantA.id, domain: DOMAIN_A })
  await insertOne('tenant_email_domains', { tenant_id: tenantB.id, domain: DOMAIN_B })

  const users = {
    directorA: await createUser('director-a', DOMAIN_A),
    architectA: await createUser('architect-a', DOMAIN_A),
    leaveDirectorA: await createUser('leave-director-a', DOMAIN_A),
    directorB: await createUser('director-b', DOMAIN_B),
    newcomer1: await createUser('newcomer1', DOMAIN_A),
    newcomer2: await createUser('newcomer2', DOMAIN_A),
    preseeded: await createUser('preseeded', DOMAIN_A),
    outsider: await createUser('outsider', DOMAIN_UNKNOWN),
  }

  const collabDirectorA = await insertOne('collaborators', {
    tenant_id: tenantA.id,
    user_id: users.directorA.id,
    name: 'Diretora A',
    role: 'director',
    email: users.directorA.email,
    status: 'active',
  })
  await insertOne('collaborators', {
    tenant_id: tenantA.id,
    user_id: users.architectA.id,
    name: 'Arquiteto A',
    role: 'architect',
    email: users.architectA.email,
    status: 'active',
  })
  await insertOne('collaborators', {
    tenant_id: tenantA.id,
    user_id: users.leaveDirectorA.id,
    name: 'Diretor Afastado A',
    role: 'director',
    email: users.leaveDirectorA.email,
    status: 'on_leave',
  })
  const collabDirectorB = await insertOne('collaborators', {
    tenant_id: tenantB.id,
    user_id: users.directorB.id,
    name: 'Diretor B',
    role: 'director',
    email: users.directorB.email,
    status: 'active',
  })
  // Cadastrado pelo Diretor antes do primeiro login: user_id nulo.
  const collabPreseeded = await insertOne('collaborators', {
    tenant_id: tenantA.id,
    user_id: null,
    name: 'Cadastrado Antes',
    role: 'architect',
    email: users.preseeded.email,
    status: 'active',
  })

  for (const [uid, tid] of [
    [users.directorA.id, tenantA.id],
    [users.architectA.id, tenantA.id],
    [users.leaveDirectorA.id, tenantA.id],
    [users.directorB.id, tenantB.id],
  ]) {
    await insertOne('tenant_users', { tenant_id: tid, user_id: uid, role: 'member' }, 'user_id')
  }

  const tokens = {
    directorA: await signIn(users.directorA.email),
    architectA: await signIn(users.architectA.email),
    leaveDirectorA: await signIn(users.leaveDirectorA.email),
    directorB: await signIn(users.directorB.email),
    newcomer1: await signIn(users.newcomer1.email),
    newcomer2: await signIn(users.newcomer2.email),
    preseeded: await signIn(users.preseeded.email),
    outsider: await signIn(users.outsider.email),
  }

  const allResponses = []
  const call = async (name, opts) => {
    const res = await callFn(name, opts)
    allResponses.push(res.text)
    return res
  }

  // 1. register-access-request ----------------------------------------------

  check('1.1', 'sem JWT: 401', '401', String((await call('register-access-request', {})).status))

  check(
    '1.2',
    'JWT invalido: 401',
    '401',
    String((await call('register-access-request', { token: 'nao.e.um.jwt' })).status),
  )

  check(
    '1.3',
    'dominio desconhecido: recusa sem criar nada',
    '403:domain_not_allowed',
    outcome(await call('register-access-request', { token: tokens.outsider })),
  )
  {
    const { count } = await admin
      .from('access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', users.outsider.email)
    check('1.3b', 'dominio desconhecido nao gravou solicitacao', '0', String(count))
  }

  check(
    '1.4',
    'primeira solicitacao: cria pendente',
    '200:request_created',
    outcome(await call('register-access-request', { token: tokens.newcomer1, body: { source: 'login' } })),
  )
  {
    const { data } = await admin
      .from('access_requests')
      .select('tenant_id, status, attempts, source, name')
      .eq('email', users.newcomer1.email)
    check('1.4b', 'uma unica linha, no tenant do dominio, pendente', '1|pending|1', `${data.length}|${data[0]?.status}|${data[0]?.attempts}`)
    check('1.4c', 'tenant resolvido pelo dominio, nao pelo cliente', tenantA.id, data[0]?.tenant_id)
  }

  check(
    '1.5',
    'segunda tentativa: incrementa attempts, nao duplica',
    '200:request_updated',
    outcome(await call('register-access-request', { token: tokens.newcomer1 })),
  )
  {
    const { data } = await admin
      .from('access_requests')
      .select('id, attempts, last_attempt_at')
      .eq('email', users.newcomer1.email)
    check('1.5b', 'continua uma linha, attempts = 2', '1|2', `${data.length}|${data[0]?.attempts}`)
    check('1.5c', 'last_attempt_at preenchido', 'true', String(Boolean(data[0]?.last_attempt_at)))
  }

  check(
    '1.6',
    'tenant_id no corpo e ignorado',
    '200:request_created',
    outcome(
      await call('register-access-request', {
        token: tokens.newcomer2,
        body: { tenant_id: tenantB.id, tenantId: tenantB.id },
      }),
    ),
  )
  {
    const { data } = await admin
      .from('access_requests')
      .select('tenant_id')
      .eq('email', users.newcomer2.email)
      .single()
    check('1.6b', 'gravou no tenant do dominio (A), nao no que o corpo pediu (B)', tenantA.id, data?.tenant_id)
  }

  check(
    '1.7',
    'colaborador pre-cadastrado sem user_id: vincula em vez de solicitar',
    '200:collaborator_linked',
    outcome(await call('register-access-request', { token: tokens.preseeded })),
  )
  {
    const { data } = await admin
      .from('collaborators')
      .select('user_id')
      .eq('id', collabPreseeded.id)
      .single()
    check('1.7b', 'user_id vinculado', users.preseeded.id, data?.user_id)

    const { count: reqCount } = await admin
      .from('access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', users.preseeded.email)
    check('1.7c', 'nenhuma solicitacao criada para quem ja tinha cadastro', '0', String(reqCount))

    const { count: tuCount } = await admin
      .from('tenant_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', users.preseeded.id)
      .eq('tenant_id', tenantA.id)
    check('1.7d', 'vinculo em tenant_users criado (sem ele o JWT sai sem tenant_id)', '1', String(tuCount))
  }

  check(
    '1.8',
    'segunda chamada de quem ja esta vinculado e idempotente',
    '200:collaborator_linked',
    outcome(await call('register-access-request', { token: tokens.preseeded })),
  )

  check(
    '1.9',
    'source fora da lista: 400, nao 500',
    '400:invalid_body',
    outcome(await call('register-access-request', { token: tokens.newcomer1, body: { source: 'sql' } })),
  )

  check(
    '1.10',
    'JSON malformado: 400, nao 500',
    '400:invalid_body',
    outcome(await call('register-access-request', { token: tokens.newcomer1, rawBody: '{nao json' })),
  )

  check(
    '1.11',
    'GET: 405',
    '405:method_not_allowed',
    outcome(await call('register-access-request', { token: tokens.newcomer1, method: 'GET' })),
  )

  // 2. approve-access-request -----------------------------------------------

  const { data: req1 } = await admin
    .from('access_requests')
    .select('id')
    .eq('email', users.newcomer1.email)
    .single()
  const { data: req2 } = await admin
    .from('access_requests')
    .select('id')
    .eq('email', users.newcomer2.email)
    .single()

  const approveBody = (requestId, extra = {}) => ({
    requestId,
    name: 'Novato Aprovado',
    role: 'architect',
    area: 'projects',
    weeklyHours: 40,
    ...extra,
  })

  check(
    '2.1',
    'sem JWT: 401',
    '401',
    String((await call('approve-access-request', { body: approveBody(req1.id) })).status),
  )

  check(
    '2.2',
    'Arquiteto do mesmo tenant: 403',
    '403:forbidden',
    outcome(await call('approve-access-request', { token: tokens.architectA, body: approveBody(req1.id) })),
  )

  check(
    '2.3',
    'Diretor de OUTRO tenant: 403',
    '403:forbidden',
    outcome(await call('approve-access-request', { token: tokens.directorB, body: approveBody(req1.id) })),
  )

  check(
    '2.4',
    'Diretor afastado (status on_leave): 403',
    '403:forbidden',
    outcome(await call('approve-access-request', { token: tokens.leaveDirectorA, body: approveBody(req1.id) })),
  )

  check(
    '2.5',
    'role inexistente no corpo: 400, nao 500',
    '400:invalid_body',
    outcome(
      await call('approve-access-request', {
        token: tokens.directorA,
        body: approveBody(req1.id, { role: 'superuser' }),
      }),
    ),
  )

  check(
    '2.6',
    'requestId que nao e uuid: 400',
    '400:invalid_body',
    outcome(await call('approve-access-request', { token: tokens.directorA, body: approveBody('nao-uuid') })),
  )

  check(
    '2.7',
    'solicitacao inexistente: 404',
    '404:request_not_found',
    outcome(
      await call('approve-access-request', {
        token: tokens.directorA,
        body: approveBody('00000000-0000-0000-0000-000000000000'),
      }),
    ),
  )

  {
    const { count } = await admin
      .from('collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('email', users.newcomer1.email)
    check('2.8', 'CONTROLE: nenhuma tentativa negada criou colaborador', '0', String(count))
  }

  // Atomicidade: coordinator_id de outro tenant viola a FK composta
  // (coordinator_id, tenant_id). O erro estoura no meio da funcao, depois de o
  // colaborador ter sido inserido - e e exatamente isso que a transacao
  // precisa desfazer.
  const atomicity = await call('approve-access-request', {
    token: tokens.directorA,
    body: approveBody(req2.id, { coordinatorId: collabDirectorB.id }),
  })
  check('2.9', 'coordenador de outro tenant: falha sem vazar detalhe do banco', '500:internal_error', outcome(atomicity))
  {
    const { count: collabCount } = await admin
      .from('collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('email', users.newcomer2.email)
    const { data: reqAfter } = await admin
      .from('access_requests')
      .select('status, decided_by, decided_at')
      .eq('id', req2.id)
      .single()
    check('2.9b', 'ATOMICIDADE: nenhum colaborador ficou para tras', '0', String(collabCount))
    check(
      '2.9c',
      'ATOMICIDADE: solicitacao continua pendente e sem decisao',
      'pending|null|null',
      `${reqAfter?.status}|${reqAfter?.decided_by}|${reqAfter?.decided_at}`,
    )
  }

  check(
    '2.10',
    'Diretor ativo do tenant aprova',
    '200:approved',
    outcome(await call('approve-access-request', { token: tokens.directorA, body: approveBody(req1.id) })),
  )
  {
    const { data: collab } = await admin
      .from('collaborators')
      .select('id, name, role, area, weekly_hours, status, user_id, tenant_id')
      .eq('email', users.newcomer1.email)
      .single()
    // weekly_hours e numeric(5,2): o banco guarda 40.00 e o PostgREST devolve o
    // numero 40. A comparacao e por valor, nao por texto.
    check(
      '2.10b',
      'colaborador criado com os dados enviados',
      `architect|projects|40|active|${tenantA.id}`,
      `${collab?.role}|${collab?.area}|${Number(collab?.weekly_hours)}|${collab?.status}|${collab?.tenant_id}`,
    )
    check('2.10c', 'user_id vinculado ao login que ja existia no Auth', users.newcomer1.id, collab?.user_id)

    const { count: tuCount } = await admin
      .from('tenant_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', users.newcomer1.id)
      .eq('tenant_id', tenantA.id)
    check('2.10d', 'vinculo em tenant_users criado', '1', String(tuCount))

    const { data: perms } = await admin
      .from('collaborator_permissions')
      .select('menu_key, can_view, can_edit')
      .eq('collaborator_id', collab.id)

    const { data: menus } = await admin.from('menus').select('key, parent_key')
    const groupKeys = new Set(menus.filter((m) => m.parent_key).map((m) => m.parent_key))
    const expectedKeys = menus.filter((m) => !groupKeys.has(m.key)).map((m) => m.key).sort()

    check('2.10e', 'uma permissao por menu nao-agrupador', String(expectedKeys.length), String(perms.length))
    check(
      '2.10f',
      'as chaves batem exatamente com os menus nao-agrupadores',
      expectedKeys.join(','),
      perms.map((p) => p.menu_key).sort().join(','),
    )
    check(
      '2.10g',
      'nenhum agrupador recebeu permissao',
      '',
      perms.map((p) => p.menu_key).filter((k) => groupKeys.has(k)).join(','),
    )
    check(
      '2.10h',
      'toda permissao nasce em falso',
      'true',
      String(perms.every((p) => p.can_view === false && p.can_edit === false)),
    )

    const { data: reqAfter } = await admin
      .from('access_requests')
      .select('status, decided_by, decided_at')
      .eq('id', req1.id)
      .single()
    check(
      '2.10i',
      'solicitacao aprovada, assinada pelo colaborador do JWT',
      `approved|${collabDirectorA.id}|true`,
      `${reqAfter?.status}|${reqAfter?.decided_by}|${Boolean(reqAfter?.decided_at)}`,
    )
  }

  check(
    '2.11',
    'aprovar de novo a mesma solicitacao: 409',
    '409:request_not_pending',
    outcome(await call('approve-access-request', { token: tokens.directorA, body: approveBody(req1.id) })),
  )

  // Aprovacao de quem ainda NAO tem login no Auth: colaborador nasce com
  // user_id nulo, esperando o primeiro acesso (que cai em
  // register-access-request e vincula).
  const semLoginEmail = `${PREFIX}sem-login@${DOMAIN_A}`
  const reqSemLogin = await insertOne('access_requests', {
    tenant_id: tenantA.id,
    email: semLoginEmail,
    name: 'Sem Login Ainda',
    status: 'pending',
    source: 'login',
  })
  check(
    '2.12',
    'aprovar e-mail sem usuario no Auth',
    '200:approved',
    outcome(
      await call('approve-access-request', {
        token: tokens.directorA,
        body: approveBody(reqSemLogin.id, { role: 'intern', area: null, weeklyHours: null }),
      }),
    ),
  )
  {
    const { data: collab } = await admin
      .from('collaborators')
      .select('user_id, role, area, weekly_hours')
      .eq('email', semLoginEmail)
      .single()
    check(
      '2.12b',
      'colaborador criado sem vinculo de login',
      'null|intern|null|null',
      `${collab?.user_id}|${collab?.role}|${collab?.area}|${collab?.weekly_hours}`,
    )
  }

  // 3. reject-access-request -------------------------------------------------

  check(
    '3.1',
    'sem JWT: 401',
    '401',
    String((await call('reject-access-request', { body: { requestId: req2.id } })).status),
  )

  check(
    '3.2',
    'Arquiteto: 403',
    '403:forbidden',
    outcome(await call('reject-access-request', { token: tokens.architectA, body: { requestId: req2.id } })),
  )

  check(
    '3.3',
    'Diretor de outro tenant: 403',
    '403:forbidden',
    outcome(await call('reject-access-request', { token: tokens.directorB, body: { requestId: req2.id } })),
  )

  check(
    '3.4',
    'corpo sem requestId: 400',
    '400:invalid_body',
    outcome(await call('reject-access-request', { token: tokens.directorA, body: {} })),
  )

  check(
    '3.5',
    'Diretor ativo recusa',
    '200:rejected',
    outcome(await call('reject-access-request', { token: tokens.directorA, body: { requestId: req2.id } })),
  )
  {
    const { data } = await admin
      .from('access_requests')
      .select('status, decided_by, decided_at')
      .eq('id', req2.id)
      .single()
    check(
      '3.5b',
      'status rejected com decided_by e decided_at',
      `rejected|${collabDirectorA.id}|true`,
      `${data?.status}|${data?.decided_by}|${Boolean(data?.decided_at)}`,
    )
    const { count } = await admin
      .from('collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('email', users.newcomer2.email)
    check('3.5c', 'recusa nao cria colaborador', '0', String(count))
  }

  check(
    '3.6',
    'recusar de novo: 409',
    '409:request_not_pending',
    outcome(await call('reject-access-request', { token: tokens.directorA, body: { requestId: req2.id } })),
  )

  // Depois de recusado, o mesmo e-mail pode pedir de novo: o unique parcial so
  // vale para pendente. E o caso que o original comenta explicitamente.
  check(
    '3.7',
    'recusado pode solicitar de novo',
    '200:request_created',
    outcome(await call('register-access-request', { token: tokens.newcomer2 })),
  )

  // 4. Vazamento -------------------------------------------------------------

  const joined = allResponses.join('\n')
  check('4.1', 'nenhuma resposta contem a service role key', 'false', String(joined.includes(SERVICE_KEY)))
  check('4.2', 'nenhuma resposta contem a string service_role', 'false', String(joined.includes('service_role')))
  check(
    '4.3',
    'nenhuma resposta vaza nome de constraint/relacao do Postgres',
    'false',
    String(/violates|constraint|relation "|pg_|SQLSTATE/i.test(joined)),
  )
}

let exitCode = 0
try {
  await main()
} catch (e) {
  console.error('Falha ao executar o teste:', e)
  exitCode = 2
} finally {
  await cleanup()
}

const width = Math.max(...results.map((r) => r.caso.length), 4)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.caso.padEnd(width)}  ${r.descricao}`)
  if (!r.pass) console.log(`        esperado=${JSON.stringify(r.expected)} observado=${JSON.stringify(r.observed)}`)
}
const fails = results.filter((r) => !r.pass).length
console.log(`\n${results.length - fails}/${results.length} casos passaram.`)
process.exit(exitCode || (fails ? 1 : 0))
