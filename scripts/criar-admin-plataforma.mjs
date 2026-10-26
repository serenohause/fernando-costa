#!/usr/bin/env node
// Cria uma conta da EQUIPE DO PRODUTO e a autoriza a ler a fila de leads.
//
//   node scripts/criar-admin-plataforma.mjs --email admin@hausone.com.br \
//     --nome "Equipe HausOne"
//
// POR QUE EXISTE, AO LADO DE criar-usuario.mjs
//   Aquele cria conta DENTRO de um escritorio: auth.users + tenant_users +
//   collaborators. E o certo para quem trabalha num escritorio, inclusive para
//   a conta de suporte.
//
//   Esta conta e de outra especie. Quem le a fila de leads da landing page e
//   quem FAZ o produto, e essa pessoa nao e colaboradora de escritorio nenhum.
//   Dar a ela um escritorio significaria uma de duas coisas, e as duas sao
//   piores: por a nossa conta na lista de equipe de um cliente, ou inventar um
//   tenant que nao e escritorio (o CLAUDE.md define tenant como "um escritorio
//   de arquitetura"). Foi por isso que /Leads saiu de dentro do AppLayout.
//
// AS DUAS LINHAS, E SO DUAS
//   1. auth.users       — o login.
//   2. platform_admins  — a autorizacao, e a UNICA coisa que a policy
//                         product_leads_select_platform (migration 0112) olha.
//
//   NAO cria tenant_users: sem ela o JWT nasce sem claim de tenant, que e
//   exatamente o certo aqui. NAO cria collaborators: a conta nao aparece na
//   equipe de escritorio nenhum, e nao enxerga tela nenhuma do backoffice.
//
//   Consequencia que vale saber: esta conta abre /Leads e mais nada. Qualquer
//   outra rota do sistema cai em "Acesso Pendente", porque o AppLayout exige
//   colaborador ativo. Isso nao e limitacao acidental, e o desenho.
//
// SENHA PROPRIA, E NAO A DA CONTA DE SUPORTE
//   Achado de auditoria: escritorio novo em producao nasce com uma conta
//   dev+<slug>@hausone.com.br e a MESMA senha em todos. Se o admin da
//   plataforma fosse uma dessas, a tranca de uma fila com e-mail e telefone de
//   gente que nao e cliente de ninguem passaria a ser senha reaproveitada entre
//   escritorios. Aqui a senha e sorteada, unica, e so aparece num arquivo
//   *.local modo 0600 — nunca na tela, nunca em log, nunca em mensagem.
//
// DESFAZER
//   O arquivo gerado traz o SQL. Em resumo: apagar a linha de platform_admins
//   tira o acesso a fila na hora (a policy deixa de casar), e apagar o usuario
//   do Auth tira o login.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const i = linha.indexOf('=')
  if (i > 0) env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('\n  Faltam VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.')
  console.error('  Rode: npm run env:dev   (ou env:prod)\n')
  process.exit(2)
}

/* Mesma leitura de argumentos de criar-usuario.mjs: aceita --chave=valor e
   --chave valor, porque o texto de uso mostra as duas formas. */
const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i])
  if (!m) continue
  if (m[2] !== undefined) {
    args[m[1]] = m[2]
  } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
    args[m[1]] = argv[i + 1]
    i += 1
  } else {
    args[m[1]] = true
  }
}

const email = args.email
const nome = args.nome ?? 'Equipe HausOne'

if (!email) {
  console.error(`
  Cria uma conta da equipe do produto, fora de escritorio, com acesso a /Leads.

    node scripts/criar-admin-plataforma.mjs --email admin@hausone.com.br \\
      [--nome "Equipe HausOne"]
`)
  process.exit(2)
}

const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const desfazer = []
async function abortar(motivo) {
  console.error(`\n  FALHOU: ${motivo}`)
  if (desfazer.length > 0) {
    console.error('  desfazendo o que ja foi criado...')
    for (const passo of desfazer.reverse()) {
      try {
        await passo()
      } catch (erro) {
        console.error(`    nao consegui desfazer: ${erro.message}`)
      }
    }
  }
  console.error('')
  process.exit(1)
}

console.log(`\n  banco: ${URL}`)

/*
  A FUNCAO precisa existir antes de qualquer coisa. Sem as migrations aplicadas
  neste banco, createUser funcionaria e a autorizacao falharia depois, deixando
  um login orfao que ninguem pediu.

  POR QUE UMA FUNCAO, E NAO UM INSERT NA TABELA: service_role NAO tem privilegio
  em platform_admins. Nao e esquecimento da 0112 — e o padrao novo do Supabase,
  registrado em supabase/config.toml, de tabela nova nao ser auto-exposta as
  roles da Data API. Medido: PostgREST devolve 42501. O caminho e
  public.grant_platform_admin, security definer, com EXECUTE so para
  service_role (migration 0114). `anon` e `authenticated` continuam de fora, e
  por isso ninguem logado no sistema se promove.

  A sonda usa um uuid que nao existe: a funcao levanta 22023 ("nao existe
  usuario"), que PROVA que ela esta la e executavel. Erro de funcao ausente diz
  outra coisa (42883), e e isso que separa os dois casos.
*/
const SONDA = '00000000-0000-4000-8000-000000000000'
const { error: sondaErro } = await db.rpc('grant_platform_admin', { p_user_id: SONDA })
if (sondaErro && !(sondaErro.message ?? '').includes('nao existe usuario')) {
  await abortar(
    `public.grant_platform_admin nao responde neste banco (${sondaErro.message}). ` +
      'As migrations 0112 e 0114 foram aplicadas aqui? Rode: npm run db:push',
  )
}

/*
  E-mail ja usado aborta ANTES de criar qualquer coisa. `listUsers` com filtro,
  e nao um select em auth.users: o Auth e o dono daquela tabela.
*/
const { data: existentes, error: buscaErro } = await db.auth.admin.listUsers({
  page: 1,
  perPage: 1,
  // @ts-expect-error o filtro existe na API e nao esta nos tipos da lib
  filter: email,
})
if (buscaErro) await abortar(`procurar o e-mail: ${buscaErro.message}`)

const jaExiste = (existentes?.users ?? []).find(
  (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
)

let userId
const senha = `Ab${randomBytes(12).toString('base64url')}!9`

if (jaExiste) {
  /*
    Conta que ja existe NAO ganha senha nova por acidente. Este comando pode ser
    rodado duas vezes (ou em dev e depois em prod), e trocar a senha de uma
    conta em uso sem avisar e pior do que nao fazer nada. Aqui ele so acrescenta
    a autorizacao que falta.
  */
  userId = jaExiste.id
  console.log('  usuario de login JA EXISTIA; senha nao foi trocada')
} else {
  const { data: criado, error: userErro } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome },
  })
  if (userErro) await abortar(`criar usuario: ${userErro.message}`)
  userId = criado.user.id
  desfazer.push(() => db.auth.admin.deleteUser(userId))
  console.log('  usuario de login criado')
}

const { data: concedido, error: adminErro } = await db.rpc('grant_platform_admin', {
  p_user_id: userId,
  p_note: nome,
})
if (adminErro) await abortar(`autorizar na fila de leads: ${adminErro.message}`)

/*
  Conferencia, e nao suposicao: a policy olha platform_admins, e se a concessao
  nao pegou o acesso nao existe. A funcao devolve true quando gravou, e e esse
  `true` que se confere — service_role nao pode LER a tabela para confirmar por
  fora, que e a mesma razao pela qual a escrita passa por funcao.
*/
if (concedido !== true) await abortar('a concessao nao confirmou a gravacao')
console.log('  autorizado em platform_admins, confirmado pelo banco (acesso a /Leads)')

const arquivo = resolve(ROOT, 'scripts/admin-plataforma.local')
const conteudo =
  `Conta da EQUIPE DO PRODUTO, criada por scripts/criar-admin-plataforma.mjs\n` +
  `Banco: ${URL}\n` +
  `Criada em: ${new Date().toISOString()}\n\n` +
  `Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em\n` +
  `mensagem.\n\n` +
  `${nome}\n` +
  `  email: ${email}\n` +
  `  senha: ${jaExiste ? '(nao trocada: a conta ja existia)' : senha}\n` +
  `  auth user: ${userId}\n\n` +
  `ESTA CONTA NAO E DE ESCRITORIO NENHUM. Ela abre /Leads e mais nada:\n` +
  `qualquer outra rota cai em "Acesso Pendente", porque o AppLayout exige\n` +
  `colaborador ativo. E o desenho, nao defeito.\n\n` +
  `PARA TIRAR O ACESSO A FILA (o login continua existindo):\n` +
  `  node -e "..." nao: use o par da funcao de concessao, com o .env do mesmo\n` +
  `  ambiente ativo:\n` +
  `    select public.revoke_platform_admin('${userId}');\n` +
  `  pelo painel da Supabase, ou por um rpc com a chave de servico.\n\n` +
  `PARA APAGAR A CONTA INTEIRA:\n` +
  `  a linha acima, e o usuario do Auth no painel, em Authentication > Users.\n`

const jaTinhaArquivo = existsSync(arquivo)
writeFileSync(
  arquivo,
  jaTinhaArquivo ? readFileSync(arquivo, 'utf8') + '\n---\n' + conteudo : conteudo,
  { mode: 0o600 },
)

console.log(`\n  credenciais em ${arquivo.replace(ROOT + '/', '')}`)
console.log('  (a senha nao e impressa aqui de proposito)\n')
