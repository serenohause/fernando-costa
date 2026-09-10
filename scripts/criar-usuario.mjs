#!/usr/bin/env node
// Cria um usuario ATIVO num escritorio que ja existe, sem passar pela aprovacao.
//
//   node scripts/criar-usuario.mjs --slug=fernando-costa \
//     --nome "Suporte Tecnico" --email suporte@exemplo.com.br --papel director
//
// POR QUE EXISTE
//   O caminho normal de entrar num escritorio e a tela de Controle de Acesso: a
//   pessoa pede acesso e um Diretor aprova (`approve_access_request`, migration
//   0013). Esse caminho e o certo para gente do escritorio, e nao deve ter
//   atalho.
//
//   Este comando e para a conta que NAO e do escritorio: a conta de quem opera o
//   sistema por fora — desenvolvimento, suporte, teste em producao. Ela precisa
//   existir sem que um Diretor tenha de aprovar alguem que ele nao conhece, e
//   precisa poder ser apagada depois sem deixar rastro em access_requests.
//
//   `scripts/create-tenant.mjs` ja abre a mesma excecao, mas so para o PRIMEIRO
//   Diretor de um escritorio recem-criado (que nao tem quem aprove). Este aqui
//   serve o escritorio que ja esta de pe.
//
// AS TRES LINHAS, E POR QUE AS TRES
//   1. auth.users        — o login.
//   2. tenant_users      — e a UNICA lida pelo hook custom_access_token_hook
//                          (0006), que escreve o claim tenant_id no JWT. Sem
//                          ela o login funciona, o JWT sai sem tenant, a RLS
//                          nao devolve linha nenhuma e a pessoa entra num
//                          sistema vazio — sem erro em lugar nenhum.
//   3. collaborators     — quem a pessoa e dentro do escritorio.
//
//   Falhar no meio deixa lixo. Por isso o desfazer abaixo remove o que ja foi
//   criado, na ordem inversa.
//
// A SENHA NAO APARECE NA TELA nem em log: vai para um arquivo *.local, modo
// 0600, que o .gitignore cobre. Mesma regra de create-tenant.mjs e de
// redefinir-senhas.mjs — senha em terminal fica no histórico do shell.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
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
  console.error('  Rode: npm run env:prod   (ou env:dev)\n')
  process.exit(2)
}

/*
  Aceita `--chave=valor` E `--chave valor`, porque o proprio texto de uso mostra
  as duas formas (`--slug=x` e `--nome "Fulano"`). A primeira versao so entendia
  a forma com `=`: `--email x@y.com` virava `email: true`, e o erro que voltava
  era do servidor de Auth reclamando de booleano onde esperava string — bem
  longe da causa.
*/
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
const slug = args.slug
const nome = args.nome
const email = args.email
/* `director` e o unico papel com atalho em can_edit_menu/can_view_menu (0019 e
   0059): ele enxerga e edita tudo sem depender da matriz de permissoes. E o que
   se quer numa conta de teste — qualquer outro papel exigiria configurar menu a
   menu, e o teste passaria a medir a matriz em vez do sistema. */
const papel = args.papel ?? 'director'
const area = args.area ?? 'administrative'

if (!slug || !nome || !email) {
  console.error(`
  Cria um usuario ativo num escritorio existente.

    node scripts/criar-usuario.mjs --slug=fernando-costa \\
      --nome "Suporte Tecnico" --email suporte@exemplo.com.br [--papel director]

  Papeis: director (padrao), coordinator, admin_staff, finance, architect, intern
`)
  process.exit(2)
}

const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const senha = `Ab${randomBytes(12).toString('base64url')}!9`

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

const { data: tenant, error: tenantErro } = await db
  .from('tenants')
  .select('id, name')
  .eq('slug', slug)
  .maybeSingle()

if (tenantErro) await abortar(`ler o escritorio: ${tenantErro.message}`)
if (!tenant) await abortar(`escritorio "${slug}" nao existe neste banco.`)

console.log(`  escritorio: ${tenant.name}`)

/* E-mail ja usado aborta ANTES de criar qualquer coisa: createUser devolveria
   "already registered" e nao ha o que desfazer, mas o erro cru nao diz que a
   conta ja existe neste escritorio ou em outro. */
const { data: jaColaborador } = await db
  .from('collaborators')
  .select('id, name, status, tenant_id')
  .eq('email', email)
  .limit(1)
  .maybeSingle()

if (jaColaborador) {
  await abortar(
    `ja existe colaborador com este e-mail (${jaColaborador.name}, ${jaColaborador.status}). ` +
      'Use scripts/redefinir-senhas.mjs se a intencao e recuperar o acesso dele.',
  )
}

const { data: criado, error: userErro } = await db.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { full_name: nome },
})
if (userErro) await abortar(`criar usuario: ${userErro.message}`)
desfazer.push(() => db.auth.admin.deleteUser(criado.user.id))
console.log('  usuario de login criado')

const { error: vinculoErro } = await db
  .from('tenant_users')
  .insert({ tenant_id: tenant.id, user_id: criado.user.id, role: 'member' })
if (vinculoErro) await abortar(`vincular ao escritorio: ${vinculoErro.message}`)
desfazer.push(() =>
  db.from('tenant_users').delete().eq('tenant_id', tenant.id).eq('user_id', criado.user.id),
)
console.log('  vinculo em tenant_users criado (claim tenant_id no JWT)')

const { data: colaborador, error: colabErro } = await db
  .from('collaborators')
  .insert({
    tenant_id: tenant.id,
    user_id: criado.user.id,
    name: nome,
    role: papel,
    area,
    email,
    status: 'active',
  })
  .select('id')
  .single()
if (colabErro) await abortar(`criar colaborador: ${colabErro.message}`)
console.log(`  colaborador criado (${papel}, ativo)`)

/*
  O ARQUIVO E O UNICO LUGAR ONDE A SENHA APARECE. Modo 0600 e *.local, coberto
  pelo .gitignore — a mesma regra dos outros arquivos de credencial do projeto.
*/
const arquivo = resolve(ROOT, `scripts/usuario-${slug}.local`)
const conteudo =
  `Conta criada por scripts/criar-usuario.mjs\n` +
  `Escritorio: ${tenant.name} (${slug})\n` +
  `Banco: ${URL}\n` +
  `Criada em: ${new Date().toISOString()}\n\n` +
  `Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em\n` +
  `mensagem.\n\n` +
  `${nome}\n` +
  `  papel:  ${papel}\n` +
  `  email:  ${email}\n` +
  `  senha:  ${senha}\n` +
  `  colaborador: ${colaborador.id}\n` +
  `  auth user:   ${criado.user.id}\n\n` +
  `PARA APAGAR ESTA CONTA:\n` +
  `  delete from public.collaborators where id = '${colaborador.id}';\n` +
  `  delete from public.tenant_users where user_id = '${criado.user.id}';\n` +
  `  e o usuario do Auth no painel, em Authentication > Users.\n`

const jaExistia = existsSync(arquivo)
writeFileSync(arquivo, jaExistia ? readFileSync(arquivo, 'utf8') + '\n---\n' + conteudo : conteudo, {
  mode: 0o600,
})

console.log(`\n  credenciais em ${arquivo.replace(ROOT + '/', '')}`)
console.log('  (a senha nao e impressa aqui de proposito)\n')
