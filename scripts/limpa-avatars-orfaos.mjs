#!/usr/bin/env node
// Remove do bucket `avatars` as fotos dos colaboradores do escritorio ATIVO.
//
//   node scripts/limpa-avatars-orfaos.mjs
//
// POR QUE EXISTE
//   O caminho do objeto e <tenant_id>/<collaborator_id>/<uuid>.<ext> (0088).
//   Quando o escritorio e apagado e reimportado do zero, os dois primeiros
//   segmentos mudam: o objeto continua no bucket sem nada que o mencione, e as
//   policies — que comparam esses segmentos — nao alcancam mais nem para
//   apagar. Arquivo com foto de gente real, sem dono e sem porta.
//
//   Rodar ANTES de apagar e o unico momento em que o banco ainda sabe de quem e
//   cada objeto.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const i = linha.indexOf('=')
  if (i > 0) env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/*
  Os caminhos vem do BANCO, e nao de uma listagem do bucket: `collaborators`
  e a unica fonte que sabe de quem e cada objeto.
*/
const { data: comFoto, error } = await db
  .from('collaborators')
  .select('name, avatar_path')
  .not('avatar_path', 'is', null)

if (error) {
  console.error('falha ao ler colaboradores:', error.message)
  process.exit(1)
}

console.log(`\n${comFoto.length} foto(s) de perfil no escritorio ativo`)

if (comFoto.length === 0) process.exit(0)

const caminhos = comFoto.map((c) => c.avatar_path)
const { error: delError } = await db.storage.from('avatars').remove(caminhos)

if (delError) {
  console.error('falha ao remover do bucket:', delError.message)
  process.exit(1)
}

console.log(`${caminhos.length} objeto(s) removido(s) do bucket avatars\n`)
