#!/usr/bin/env node
// Cria o login de um colaborador que JA existe no escritorio e esta sem conta.
//
//   node scripts/criar-login-colaborador.mjs --email pessoa@escritorio.com.br
//   node scripts/criar-login-colaborador.mjs --email ... --slug outro-escritorio
//
// POR QUE EXISTE
//   O modulo Equipe grava o cadastro, e so. Quem nunca entrou no sistema fica
//   com `user_id` nulo: aparece como responsavel, recebe atividade, e nao
//   consegue entrar. Ate a migration 0108 e a edge function
//   create-collaborator-login chegarem a producao, a tela nao resolve isso
//   sozinha — e este comando e a ponte.
//
//   Nao confundir com criar-usuario.mjs, que cria as TRES linhas (login,
//   vinculo e colaborador) para gente de fora do escritorio. Aqui o colaborador
//   JA existe, com permissoes ja ajustadas: o que falta e so o login.
//
// A SENHA NASCE PROVISORIA
//   `user_metadata.senha_provisoria = true`, que e o que faz a tela obrigar a
//   troca no primeiro acesso. Sem essa marca, a senha gerada aqui seria
//   conhecida por duas pessoas para sempre.
//
// A SENHA NAO APARECE NA TELA nem em log: vai para scripts/senha-<slug>-<...>.local,
// modo 0600, que o .gitignore cobre. Terminal vira historico, historico vira anexo.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const arg = (nome) => {
  const comIgual = process.argv.find((a) => a.startsWith(`--${nome}=`))
  if (comIgual) return comIgual.slice(nome.length + 3)
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const EMAIL = (arg('email') ?? '').trim().toLowerCase()
const SLUG_ESPERADO = arg('slug') ?? 'fernando-costa'

if (!EMAIL) {
  console.error('uso: node scripts/criar-login-colaborador.mjs --email pessoa@escritorio.com.br')
  process.exit(2)
}

/* O nome do arquivo sai do e-mail, e nao do nome da pessoa: e o que garante um
   arquivo por conta, sem acento e sem espaco. */
const ARQUIVO = `${ROOT}/scripts/senha-${EMAIL.replace(/[^a-z0-9]+/g, '-')}.local`

const env = {}
for (const linha of readFileSync(`${ROOT}/.env`, 'utf8').split('\n')) {
  const i = linha.indexOf('=')
  if (i > 0) env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: colaborador, error: erroLeitura } = await db
  .from('collaborators')
  .select('id, name, role, status, email, user_id, tenant_id, tenants(slug, name)')
  .ilike('email', EMAIL)
  .maybeSingle()

if (erroLeitura) throw erroLeitura
if (!colaborador) throw new Error('colaborador nao encontrado')
if (colaborador.tenants?.slug !== SLUG_ESPERADO) throw new Error('escritorio inesperado: ' + colaborador.tenants?.slug)
if (colaborador.status !== 'active') throw new Error('colaborador nao esta ativo: ' + colaborador.status)
if (colaborador.user_id) throw new Error('ja tem login; este script e so para quem nao tem')

console.log(`colaborador: ${colaborador.name} (${colaborador.role}) — ${colaborador.tenants.name}`)

/* 10 bytes em base64url: forte o bastante e ainda digitavel por telefone. */
const senha = 'Hs' + randomBytes(10).toString('base64url') + '!7'

const { data: criado, error: erroCriacao } = await db.auth.admin.createUser({
  email: EMAIL,
  password: senha,
  email_confirm: true,
  user_metadata: { senha_provisoria: true },
})
if (erroCriacao) throw erroCriacao
const userId = criado.user.id
console.log('login criado no Auth')

const desfazer = async (motivo) => {
  await db.auth.admin.deleteUser(userId).catch(() => {})
  throw new Error('desfeito: ' + motivo)
}

/* Sem tenant_users o JWT sai sem tenant_id (0006) e a RLS nao devolve nada: a
   pessoa entra e ve o sistema vazio, sem erro em lugar nenhum. */
const { error: erroVinculo } = await db
  .from('tenant_users')
  .insert({ tenant_id: colaborador.tenant_id, user_id: userId, role: 'member' })
if (erroVinculo) await desfazer(erroVinculo.message)
console.log('vinculo de escritorio criado')

const { error: erroLigacao } = await db
  .from('collaborators')
  .update({ user_id: userId })
  .eq('id', colaborador.id)
if (erroLigacao) await desfazer(erroLigacao.message)
console.log('colaborador ligado ao login')

/* Confere entrando de verdade, com a chave publica — o mesmo caminho da tela. */
const publico = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
const { data: sessao, error: erroLogin } = await publico.auth.signInWithPassword({
  email: EMAIL,
  password: senha,
})
if (erroLogin) throw new Error('login nao funcionou: ' + erroLogin.message)
const claimTenant = JSON.parse(
  Buffer.from(sessao.session.access_token.split('.')[1], 'base64').toString(),
).app_metadata?.tenant_id
console.log('login conferido | tenant no JWT:', claimTenant === colaborador.tenant_id ? 'certo' : 'ERRADO')
console.log('marca de senha provisoria:', sessao.user.user_metadata?.senha_provisoria)
await publico.auth.signOut()

writeFileSync(
  ARQUIVO,
  [
    'Acesso criado por scripts/criar-login-colaborador.mjs',
    `Escritorio: ${colaborador.tenants.name}`,
    `Criado em: ${new Date().toISOString()}`,
    '',
    'Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em mensagem.',
    'A senha abaixo e PROVISORIA: no primeiro acesso o sistema obriga a troca.',
    '',
    `${colaborador.name}`,
    `  papel: ${colaborador.role}`,
    `  email: ${EMAIL}`,
    `  senha: ${senha}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
)
console.log('credenciais em', ARQUIVO.replace(ROOT + '/', ''))
