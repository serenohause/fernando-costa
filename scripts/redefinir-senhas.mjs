#!/usr/bin/env node
// Gera senha nova para TODO colaborador do escritorio e escreve o arquivo de
// credenciais completo.
//
//   node scripts/redefinir-senhas.mjs                  todos
//   node scripts/redefinir-senhas.mjs --so-quem-nunca-entrou
//   node scripts/redefinir-senhas.mjs --dry-run        so lista quem seria afetado
//
// POR QUE EXISTE
//   `import-base44.mjs` cria conta e senha apenas para quem AINDA NAO TEM login,
//   e reaproveita quem ja tem. Isso esta certo para importacao rodada em cima de
//   um escritorio em uso — e deixa um buraco no dia da estreia: quem foi criado
//   numa passada antiga tem uma senha que ninguem sabe qual e, e o arquivo de
//   credenciais so cobre a passada que o gerou.
//
//   Aqui a senha e trocada de verdade, para todo mundo, e o arquivo sai
//   completo.
//
// O ARQUIVO TEM SENHA DE GENTE REAL
//   Sai em scripts/credenciais-escritorio.local, modo 0600, ignorado pelo git
//   (*.local). Nada de senha vai para o stdout: terminal vira log, log vira
//   anexo de mensagem. O que aparece na tela e contagem e nome de arquivo.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const SO_QUEM_NUNCA_ENTROU = process.argv.includes('--so-quem-nunca-entrou')
const DRY_RUN = process.argv.includes('--dry-run')
const SLUG = process.argv.find((a) => a.startsWith('--slug='))?.slice(7) ?? 'fernando-costa'

const env = {}
for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const i = linha.indexOf('=')
  if (i > 0) env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/*
  Mesmo formato de senha do import-base44: 12 caracteres de base64url do CSPRNG,
  com prefixo e sufixo que garantem letra, numero e simbolo — o suficiente para
  qualquer politica de senha e curto o bastante para ser digitado uma vez.
*/
const novaSenha = () => `Fc${randomBytes(9).toString('base64url')}!7`

const { data: tenant, error: tenantError } = await db
  .from('tenants').select('id, name').eq('slug', SLUG).maybeSingle()
if (tenantError) { console.error('falha ao achar o escritorio:', tenantError.message); process.exit(1) }
if (!tenant) { console.error(`escritorio "${SLUG}" nao existe neste banco`); process.exit(1) }

const { data: colaboradores, error } = await db
  .from('collaborators')
  .select('id, name, email, role, status, user_id')
  .eq('tenant_id', tenant.id)
  .order('name')
if (error) { console.error('falha ao ler colaboradores:', error.message); process.exit(1) }

/* Quem nunca entrou: `last_sign_in_at` nulo no Auth. E a informacao que separa
   "senha que a pessoa escolheu" de "senha que ninguem sabe". */
const entradas = new Map()
for (let page = 1; ; page += 1) {
  const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 })
  if (e) { console.error('falha ao listar contas:', e.message); process.exit(1) }
  for (const u of data.users) entradas.set(u.id, u.last_sign_in_at)
  if (data.users.length < 200) break
}

const alvos = colaboradores.filter((c) => {
  if (!c.user_id) return false
  if (!SO_QUEM_NUNCA_ENTROU) return true
  return !entradas.get(c.user_id)
})

const semConta = colaboradores.filter((c) => !c.user_id)

console.log(`\nEscritorio: ${tenant.name}`)
console.log(`  colaboradores:              ${colaboradores.length}`)
console.log(`  com conta de login:         ${colaboradores.length - semConta.length}`)
console.log(`  senhas a redefinir:         ${alvos.length}`)
if (semConta.length) {
  console.log(`  SEM conta (nao alcancados): ${semConta.length} — rode a importacao para cria-las`)
}

if (DRY_RUN) {
  console.log('\n  (dry-run) nada foi alterado\n')
  process.exit(0)
}

const linhas = []
let trocadas = 0

for (const c of alvos) {
  const senha = novaSenha()
  const { error: e } = await db.auth.admin.updateUserById(c.user_id, { password: senha })
  if (e) {
    console.log(`  FALHA  ${c.name}: ${e.message}`)
    continue
  }
  trocadas += 1
  linhas.push({ nome: c.name, email: c.email, funcao: c.role, situacao: c.status, senha })
}

const arquivo = resolve(HERE, 'credenciais-escritorio.local')
const cabecalho =
  `Contas de acesso — ${tenant.name}\n` +
  `Senhas REDEFINIDAS em ${new Date().toISOString()}\n` +
  `Projeto: ${env.VITE_SUPABASE_URL}\n\n` +
  `Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em\n` +
  `mensagem. Sao contas de PRODUCAO, de gente real: cada um troca a senha no\n` +
  `primeiro acesso, em Perfil > Senha.\n\n`

const corpo = linhas
  .map((l) => `${l.nome}\n  e-mail: ${l.email}\n  senha:  ${l.senha}\n  funcao: ${l.funcao}${l.situacao !== 'active' ? ` (${l.situacao})` : ''}\n`)
  .join('\n')

writeFileSync(arquivo, cabecalho + corpo, { mode: 0o600 })

console.log(`\n  ${trocadas} senha(s) redefinida(s)`)
console.log(`  arquivo: ${arquivo}\n`)
