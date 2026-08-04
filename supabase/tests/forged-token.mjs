// Token forjado tem que ser RECUSADO.
//
// COMO RODAR
//   npm run test:forged
//
// POR QUE ESTE ARQUIVO EXISTE
//   Todas as outras suites provam que a RLS segura token LEGITIMO. Nenhuma
//   provava que ela recusa token FORJADO — e docs/ARCHITECTURE.md registrava
//   isso como ponto cego conhecido desde o modulo 1.
//
//   O buraco deixou de ser teorico na auditoria do modulo 8: a chave de
//   assinatura HS256 do projeto estava com status `previously_used`, e chave
//   nesse estado CONTINUA VALIDANDO TOKEN. HS256 e simetrica — o segredo que
//   verifica e o mesmo que assina. Um token forjado com tenant_id escolhido a
//   mao lia checklists, valores e comissoes de qualquer escritorio, passando por
//   cima de toda a RLS e de toda policy de storage. As 572 assercoes de padrao
//   passavam ao lado disso sem piscar, porque nenhuma tentava assinar nada.
//
//   A chave foi revogada. Este teste existe para acusar se alguem religar.
//
// A PARTE QUE NAO PODE SER RELAXADA
//   O teste usa o SEGREDO REAL do projeto, buscado na Management API. Forjar com
//   segredo adivinhado nao prova nada: o 401 viria da assinatura errada, nao da
//   chave estar revogada, e o teste passaria para sempre mesmo com a chave
//   religada. Este projeto ja escreveu uma assercao vazia exatamente assim.
//
//   Por isso, se o segredo NAO puder ser obtido, o teste ABORTA em vez de pular.
//   Teste de seguranca que se cala quando nao consegue verificar e pior que
//   teste nenhum — ele vira um "passou" no relatorio.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHmac } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROJECT_REF = 'yctbmijdyjjcoydasndy'

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

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

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

const b64 = (buf) => Buffer.from(buf).toString('base64url')

function forgeHs256(secret, claims) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64(JSON.stringify(claims))
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function forgeAlgNone(claims) {
  return `${b64(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64(JSON.stringify(claims))}.`
}

function claimsFor(tenantId) {
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: '00000000-0000-0000-0000-000000000001',
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
    app_metadata: { tenant_id: tenantId },
  }
}

async function restGet(path, token) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, body: await res.text() }
}

async function main() {
  console.log(`\nToken forjado — ${env.VITE_SUPABASE_URL}\n`)

  if (!env.SUPABASE_ACCESS_TOKEN) {
    fail(
      'SUPABASE_ACCESS_TOKEN ausente. Sem ele nao da para buscar o segredo real, ' +
        'e forjar com segredo adivinhado nao prova nada. Este teste NAO pula.',
    )
  }

  const cfg = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/postgrest`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  })
  if (!cfg.ok) fail(`Management API devolveu ${cfg.status} ao buscar o segredo JWT.`)
  const { jwt_secret: secret } = await cfg.json()
  if (!secret) fail('Management API nao devolveu jwt_secret.')

  /*
    O estado das chaves de assinatura, direto da fonte. Nao e detalhe de
    ambiente: `previously_used` VALIDA token, `revoked` nao. A diferenca entre os
    dois textos e a diferenca entre a RLS valer e nao valer.
  */
  const keysRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth/signing-keys`,
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } },
  )
  if (!keysRes.ok) fail(`Management API devolveu ${keysRes.status} ao listar signing keys.`)
  const { keys } = await keysRes.json()

  const hs256 = keys.filter((k) => k.algorithm === 'HS256')
  const live = hs256.filter((k) => k.status !== 'revoked')
  check(
    '1.1  nenhuma chave HS256 fora de "revoked"',
    live.length === 0,
    `chaves HS256 ainda validas: ${live.map((k) => k.status).join(', ')}`,
  )
  check(
    '1.2  existe chave assimetrica em uso',
    keys.some((k) => k.status === 'in_use' && k.algorithm !== 'HS256'),
    'nenhuma chave nao-HS256 com status in_use',
  )

  // 2. O ataque de verdade: assinado com o segredo REAL do projeto.
  const forged = forgeHs256(secret, claimsFor('11111111-1111-1111-1111-111111111111'))
  for (const table of ['budget_checklists', 'accounts_receivable', 'clients', 'collaborators']) {
    const { status, body } = await restGet(`${table}?select=id&limit=1`, forged)
    check(
      `2.${table}  token HS256 assinado com o segredo real e recusado`,
      status === 401,
      `HTTP ${status}: ${body.slice(0, 120)}`,
    )
  }

  // 3. alg:none — o classico. Nunca passou aqui, e tem que continuar nao passando.
  const none = forgeAlgNone(claimsFor('11111111-1111-1111-1111-111111111111'))
  const noneRes = await restGet('clients?select=id&limit=1', none)
  check('3.1  token alg:none e recusado', noneRes.status === 401, `HTTP ${noneRes.status}`)

  /*
    4. CONTROLE POSITIVO, e ele e obrigatorio.

    Sem ele, este arquivo passaria inteiro se a API estivesse fora do ar, se a
    URL estivesse errada, ou se a tabela nao existisse — tudo devolve erro, e
    "deu erro" e exatamente o que os casos acima esperam. Foi assim que uma
    regressao de GRANT passou despercebida neste projeto (migration 0036): o
    teste de negacao recebia 42501 em vez de resultado vazio e parecia sucesso.
  */
  const loginRes = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'diretora@fc-teste.com.br', password: 'Fcf5gHM3kBFXAV!7' }),
  })
  const login = await loginRes.json()
  if (!login.access_token) {
    fail(
      'login da Diretora falhou; sem ele o controle positivo nao existe e os ' +
        'casos de negacao acima nao provam nada. Rode: npm run seed',
    )
  }

  const alg = JSON.parse(Buffer.from(login.access_token.split('.')[0], 'base64url')).alg
  check('4.1  token legitimo NAO e HS256', alg !== 'HS256', `alg do login real: ${alg}`)

  const control = await restGet('budget_checklists?select=id&limit=1', login.access_token)
  check(
    '4.2  CONTROLE: token legitimo LE o mesmo caminho',
    control.status === 200 && control.body.startsWith('['),
    `HTTP ${control.status}: ${control.body.slice(0, 120)}`,
  )

  console.log(`\n${passed}/${passed + failed} casos passaram.`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => fail(err.message))
