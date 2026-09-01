#!/usr/bin/env node
// Monta a URL de conexao direta do ambiente ATIVO, com a senha do .env.
//
// POR QUE ISSO EXISTE
//   `supabase gen types --linked` passa pela Management API, e a conta do
//   projeto de DEV nao tem privilegio para esse endpoint ("does not have the
//   necessary privileges"). Nao e limitacao do projeto, e da conta.
//
//   Conectar DIRETO no Postgres contorna: a senha ja esta no .env do ambiente, e
//   `supabase/.temp/pooler-url` traz o resto da URL sem ela.
//
// Nao imprime nada alem da URL, e ela carrega a senha — quem chama redireciona
// para uma variavel, nunca para o terminal.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let senha = ''
for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const m = linha.match(/^SUPABASE_DB_PASSWORD=(.*)$/)
  if (m) senha = m[1].trim().replace(/^["']|["']$/g, '')
}

if (!senha) process.exit(1)

const url = readFileSync(resolve(ROOT, 'supabase/.temp/pooler-url'), 'utf8').trim()
process.stdout.write(url.replace('@', `:${encodeURIComponent(senha)}@`))
