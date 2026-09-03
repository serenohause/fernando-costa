#!/usr/bin/env node
// Confere o que as MIGRATIONS NAO CARREGAM no projeto Supabase ativo.
//
//   npm run env:check
//
// POR QUE ESTE ARQUIVO EXISTE
//   `supabase db push` reproduz schema, RLS, funcoes e buckets. Nao reproduz
//   configuracao de PROJETO — e sao duas, as duas descobertas apanhando ao
//   montar o ambiente de desenvolvimento:
//
//   1. O HOOK DE TOKEN DESLIGADO. `custom_access_token_hook` e o que poe o
//      tenant_id no JWT. Sem ele todo usuario autenticado fica sem escritorio, a
//      RLS nega tudo, e o sintoma nao aponta para a causa: tres seeds abortaram
//      com "not_authorized", "a view nao devolveu linha" e "a Diretora leu 0
//      propriedades". Nenhuma dessas frases sugere "ligue um hook no painel".
//
//   2. A CHAVE HS256 LEGADA VIVA. Projeto novo nasce com ela em
//      `previously_used` — estado que CONTINUA VALIDANDO TOKEN. Como HS256 e
//      simetrica, quem tem o segredo assina token com o tenant_id que quiser e
//      passa por cima de toda a RLS. O ambiente de dev nasceu assim e o
//      test:forged pegou: quatro tabelas devolveram 200 para token forjado.
//
//   As duas sao invisiveis em code review, invisiveis no `db push` e nao doem no
//   primeiro minuto — doem no primeiro seed e na primeira auditoria. Este comando
//   as pergunta em voz alta, em qualquer projeto, antes de custar uma tarde.
//
// O QUE ELE NAO E
//   Nao substitui `npm run test:forged`, que FORJA um token de verdade e prova a
//   recusa. Este aqui le configuracao; aquele ataca. Configuracao certa com
//   comportamento errado e exatamente o que um teste que so le nao pega.

import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function env() {
  const valores = {}
  for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return valores
}

const cfg = env()
const REF = cfg.SUPABASE_PROJECT_REF
const TOKEN = cfg.SUPABASE_ACCESS_TOKEN

if (!REF || !TOKEN) {
  console.error('\n  ABORTADO: .env sem ref ou token. Rode `npm run env:prod` ou `npm run env:dev`.\n')
  process.exit(1)
}

let ok = 0
let falhas = 0

function conferir(nome, passou, detalhe, conserto) {
  if (passou) {
    ok += 1
    console.log(`PASS  ${nome}`)
  } else {
    falhas += 1
    console.log(`FALHA ${nome} — ${detalhe}`)
    if (conserto) console.log(`      conserto: ${conserto}`)
  }
}

async function api(caminho) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${caminho}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) {
    console.error(`\n  ABORTADO: Management API devolveu ${res.status} em ${caminho}.`)
    console.error('  Token e ref sao da MESMA conta? Cada token so alcanca a conta dele.\n')
    process.exit(1)
  }
  return res.json()
}

console.log(`\nConfiguracao de projeto — ${cfg.HAUSONE_ENV ?? '(env desconhecido)'} / ${REF}\n`)

const auth = await api('/config/auth')
conferir(
  '1.1  hook custom_access_token LIGADO',
  auth.hook_custom_access_token_enabled === true,
  'desligado — o JWT nasce sem tenant_id e a RLS nega tudo para usuario autenticado',
  'painel > Authentication > Hooks > Customize Access Token, ou PATCH /config/auth ' +
    'com hook_custom_access_token_enabled=true',
)
conferir(
  '1.2  o hook aponta para a funcao do schema',
  auth.hook_custom_access_token_uri === 'pg-functions://postgres/public/custom_access_token_hook',
  `aponta para ${auth.hook_custom_access_token_uri ?? '(nada)'}`,
  'a funcao e public.custom_access_token_hook, criada pelas migrations',
)

const { keys } = await api('/config/auth/signing-keys')
const hs256Vivas = keys.filter((k) => k.algorithm === 'HS256' && k.status !== 'revoked')
conferir(
  '2.1  nenhuma chave HS256 fora de "revoked"',
  hs256Vivas.length === 0,
  `HS256 em ${hs256Vivas.map((k) => k.status).join(', ')} — estado que AINDA VALIDA token, ` +
    'e HS256 e simetrica: quem tem o segredo forja qualquer tenant_id',
  'PATCH /config/auth/signing-keys/<id> com {"status":"revoked"} — confira antes que ' +
    'existe chave assimetrica in_use, senao ninguem entra',
)
conferir(
  '2.2  existe chave assimetrica em uso',
  keys.some((k) => k.status === 'in_use' && k.algorithm !== 'HS256'),
  'nenhuma chave nao-HS256 com status in_use',
)

/*
  3.1 compara o que ESTA no banco com o que ESTA no repositorio. Ambiente que
  parece igual e esta uma migration atras produz erro que ninguem relaciona com
  migration — coluna que nao existe, funcao que nao existe.
*/
const noDisco = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).length
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'select count(*)::int as n from supabase_migrations.schema_migrations' }),
})
const aplicadas = res.ok ? (await res.json())[0]?.n : null
conferir(
  '3.1  as migrations do repositorio estao aplicadas',
  aplicadas === noDisco,
  `banco tem ${aplicadas}, repositorio tem ${noDisco}`,
  'npm run db:push',
)

/*
  4.1 PERGUNTA PELO EFEITO, E NAO PELA CONFIGURACAO — e a diferenca importa aqui.

  A Management API devolve o HASH dos segredos de Edge Function, nunca o valor:
  nao da para ler `APP_ALLOWED_ORIGINS` e conferir se o dominio esta la. O que
  da para fazer e o que o navegador do cliente faz — um preflight — e ver se a
  resposta traz o cabecalho de origem permitida.

  ISTO EXISTE POR CAUSA DE UM BUG QUE CHEGOU AO ESCRITORIO: `APP_ALLOWED_ORIGINS`
  nunca tinha sido definido em producao, entao a funcao caia no default do
  codigo, que so conhecia a URL da Vercel. O escritorio passou a usar
  hausone.com.br, e o formulario publico de briefing — a unica tela que o CLIENTE
  FINAL abre — parou com "Houve uma falha ao contatar o escritorio". Nada
  acusava: as funcoes respondiam 200, o banco estava certo, e o erro so existia
  dentro do navegador de quem abria o link.
*/
const ORIGEM_DO_APP = {
  prod: 'https://www.hausone.com.br',
}

/*
  `APP_ORIGIN` no .env do ambiente vence o mapa acima — e o mapa so tem producao
  porque so dela eu conheco o dominio. Ambiente sem origem declarada AVISA e
  segue; chutar um dominio produziria uma falha que nao e falha, e checagem que
  grita errado deixa de ser lida.
*/
const origemEsperada = cfg.APP_ORIGIN ?? ORIGEM_DO_APP[cfg.HAUSONE_ENV]

if (!origemEsperada) {
  console.log(
    `AVISO 4.0  origem do app nao declarada para "${cfg.HAUSONE_ENV ?? '?'}" — ` +
      'a checagem de CORS foi pulada',
  )
  console.log('      conserto: APP_ORIGIN=<url do app deste ambiente> no .env')
}

if (origemEsperada) {
  const preflight = await fetch(`${cfg.VITE_SUPABASE_URL}/functions/v1/open-client-intake`, {
    method: 'OPTIONS',
    headers: { Origin: origemEsperada, 'Access-Control-Request-Method': 'POST' },
  })
  const permitida = preflight.headers.get('access-control-allow-origin')

  conferir(
    '4.1  o dominio do app e origem permitida nas edge functions',
    permitida === origemEsperada,
    `preflight de ${origemEsperada} devolveu ${permitida ?? '(nenhum cabecalho)'} — ` +
      'o navegador descarta a resposta, e o formulario publico de briefing para',
    'supabase secrets set APP_ALLOWED_ORIGINS="<origens separadas por virgula>" ' +
      '(ou POST /v1/projects/<ref>/secrets)',
  )

  /* CONTROLE: origem desconhecida NAO pode receber o cabecalho. Sem este caso, um
     `APP_ALLOWED_ORIGINS=*` passaria no 4.1 e a checagem viraria enfeite. */
  const invasor = await fetch(`${cfg.VITE_SUPABASE_URL}/functions/v1/open-client-intake`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://origem-desconhecida.test', 'Access-Control-Request-Method': 'POST' },
  })
  conferir(
    '4.2  origem desconhecida continua SEM o cabecalho',
    invasor.headers.get('access-control-allow-origin') === null,
    'a funcao devolveu Access-Control-Allow-Origin para uma origem que ninguem cadastrou',
    'a lista precisa ser explicita; `*` empresta o navegador de qualquer visitante',
  )
}

console.log(`\n${ok}/${ok + falhas} conferencias passaram.`)
if (falhas > 0) process.exit(1)
