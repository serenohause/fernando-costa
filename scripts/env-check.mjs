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

console.log(`\n${ok}/${ok + falhas} conferencias passaram.`)
if (falhas > 0) process.exit(1)
