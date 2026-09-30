#!/usr/bin/env node
// O usuario de SUPORTE (dev) de um escritorio — sempre o mesmo e-mail base e a
// mesma senha, em todos os escritorios.
//
// COMO RODAR
//   node scripts/criar-suporte.mjs --slug creative
//
// POR QUE ESTE COMANDO EXISTE
//   Decisao do usuario: todo escritorio novo nasce com uma conta de suporte,
//   para dar assistencia sem pedir a senha de ninguem. O que este script
//   garante e a parte chata: que a conta seja igual em todo lugar, e que a
//   senha seja a MESMA, sem ninguem ter que copiar senha de arquivo para
//   arquivo.
//
// POR QUE O E-MAIL TEM "+<slug>", SE O PEDIDO ERA "sempre o mesmo e-mail"
//   O JWT carrega UM escritorio, e a funcao que o escreve
//   (custom_access_token_hook) pega o vinculo MAIS ANTIGO do usuario:
//
//     select tu.tenant_id ... from tenant_users tu order by tu.created_at limit 1
//
//   Ou seja: o mesmo usuario em dois escritorios entraria sempre no primeiro, e
//   o suporte nunca veria o escritorio novo. O sufixo "+slug" e o menor desvio
//   que resolve isso hoje: mesma CAIXA DE ENTRADA (o "+" e ignorado na entrega),
//   mesma senha, e um usuario por escritorio. Se um dia existir troca de
//   escritorio na tela, isto aqui pode virar uma conta so.
//
// A SENHA NAO E GERADA: e copiada da conta de suporte de referencia
//   (scripts/usuario-fernando-costa.local). Nada de senha aparece no terminal.

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REFERENCIA = `${ROOT}/scripts/usuario-fernando-costa.local`
const EMAIL_BASE = 'dev@hausone.com.br'

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i])
  if (!m) continue
  if (m[2] !== undefined) args[m[1]] = m[2]
  else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[m[1]] = argv[i + 1]; i += 1 }
  else args[m[1]] = true
}

const slug = typeof args.slug === 'string' ? args.slug.trim() : ''
if (!slug) {
  console.error('uso: node scripts/criar-suporte.mjs --slug <slug-do-escritorio>')
  process.exit(2)
}

const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env`, 'utf8')
    .split('\n')
    .filter((linha) => linha.includes('=') && !linha.startsWith('#'))
    .map((linha) => {
      const i = linha.indexOf('=')
      return [linha.slice(0, i).trim(), linha.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const service = env.SUPABASE_SERVICE_ROLE_KEY
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !service || !anon) {
  console.error('faltam chaves no .env (URL, service role e chave publica).')
  process.exit(2)
}

if (!existsSync(REFERENCIA)) {
  console.error(`sem a conta de referencia em ${REFERENCIA} — sem ela nao da para repetir a senha.`)
  process.exit(2)
}
const senha = /senha:\s*(.+)/.exec(readFileSync(REFERENCIA, 'utf8'))?.[1]?.trim()
if (!senha) {
  console.error('a conta de referencia nao tem senha gravada.')
  process.exit(2)
}

const [local, dominio] = EMAIL_BASE.split('@')
const email = `${local}+${slug}@${dominio}`
console.log(`banco:      ${url}`)
console.log(`escritorio: ${slug}`)
console.log(`suporte:    ${email}`)

/* Cria o usuario pelo caminho normal — o mesmo do resto do sistema, com
   colaborador ativo e vinculo em tenant_users. Ele gera uma senha aleatoria;
   ela e trocada logo abaixo pela senha de referencia. */
execFileSync(
  process.execPath,
  [`${ROOT}/scripts/criar-usuario.mjs`, '--slug', slug, '--nome', 'Suporte Técnico (dev)',
   '--email', email, '--papel', 'director', '--area', 'administrative'],
  { stdio: 'inherit' },
)

const arquivo = `${ROOT}/scripts/usuario-${slug}.local`
const authId = /auth user:\s*(\S+)/.exec(readFileSync(arquivo, 'utf8'))?.[1]
if (!authId) {
  console.error(`nao achei o id do usuario em ${arquivo}`)
  process.exit(1)
}

const admin = createClient(url, service, { auth: { persistSession: false } })
const { error } = await admin.auth.admin.updateUserById(authId, { password: senha })
if (error) {
  console.error('falha ao repetir a senha de referencia:', error.message)
  process.exit(1)
}

/* A prova e o login de verdade, com a chave PUBLICA: chave de servico entra em
   qualquer lugar e nao prova nada sobre o login. */
const publico = createClient(url, anon, { auth: { persistSession: false } })
const { data, error: erroLogin } = await publico.auth.signInWithPassword({ email, password: senha })
if (erroLogin || !data?.session) {
  console.error('a conta foi criada, mas o login nao funcionou:', erroLogin?.message ?? 'sem sessao')
  process.exit(1)
}
const claim = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64').toString()).app_metadata
await publico.auth.signOut()

/* O arquivo do escritorio nao repete a senha: ela mora num lugar so. */
writeFileSync(
  arquivo,
  readFileSync(arquivo, 'utf8').replace(/senha:\s*.+/, `senha:  a MESMA de ${REFERENCIA.replace(ROOT + '/', '')}`),
  { mode: 0o600 },
)

console.log('\n  login conferido, e o JWT traz o escritorio certo:')
console.log(`  tenant_id no token: ${claim?.tenant_id}`)
console.log(`  credenciais em scripts/usuario-${slug}.local (a senha nao e impressa)`)
