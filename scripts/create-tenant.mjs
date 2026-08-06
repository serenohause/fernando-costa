#!/usr/bin/env node
// Cadastro de um escritorio NOVO: tenant + primeiro Diretor, em uma execucao.
//
// COMO RODAR
//   npm run create-tenant -- \
//     --name "Atelie Norte" \
//     --slug atelie-norte \
//     --director-name "Fulano de Tal" \
//     --director-email fulano@atelienorte.com.br \
//     [--director-area projects] \
//     [--email-domain atelienorte.com.br] \
//     [--sim-criar-escritorio-de-verdade]
//
//   Sem --sim-criar-escritorio-de-verdade o script mostra o que vai criar e
//   espera a confirmacao digitada (o slug, por extenso). A bandeira existe
//   para automacao; o nome dela e longo de proposito, para que ninguem a use
//   por reflexo.
//
// POR QUE E COMANDO E NAO TELA
//   Criar tenant e a operacao mais privilegiada de um sistema multitenant:
//   quem a faz nasce fora de todo escritorio, antes de existir qualquer
//   fronteira que a RLS possa aplicar. Uma tela para isso exigiria um papel
//   acima de Diretor, uma rota alcancavel pela internet e uma policy que
//   escreve em `tenants` — tres superficies novas no produto para uma operacao
//   que acontece uma vez por cliente. A escolha do usuario foi nao acrescentar
//   nenhuma: quem cadastra escritorio e quem tem a chave de servico, e a chave
//   de servico nunca sai do computador de quem opera.
//
// O OVO E A GALINHA — por que o primeiro Diretor nasce ATIVO
//   O fluxo normal de entrada e: a pessoa tenta entrar, cai em
//   `access_requests`, e um DIRETOR aprova (migration 0013). Um escritorio
//   recem-criado nao tem Diretor nenhum, entao ninguem pode aprovar ninguem e
//   o escritorio nasceria inacessivel para sempre. O primeiro Diretor e, por
//   isso, criado ja `active` e ja vinculado em `tenant_users` — sem passar por
//   `access_requests`. E a unica excecao ao fluxo de aprovacao no sistema
//   inteiro, e e ela que justifica este comando existir. Do segundo
//   colaborador em diante o caminho e o normal, pela tela de Controle de
//   Acesso.
//
// A UNICA COISA QUE ESTE SCRIPT NAO PODE TER: a trava de escritorio de teste
//   Os dez seeds de supabase/seed/ abortam ao encontrar no banco qualquer
//   tenant fora da lista de supabase/seed/tenants.mjs, e isso e proposital —
//   seed reescreve dado e nao pode rodar perto de dado de cliente. Este
//   comando e o contrario: ele existe justamente para rodar contra o banco de
//   producao, porque e la que escritorio novo nasce. Herdar a trava seria
//   herda-la ao contrario.
//
//   O que substitui a trava, ja que ela nao pode existir aqui:
//     - confirmacao digitada antes da primeira escrita, mostrando a URL do
//       projeto (e facil ter o .env do banco errado, e dificil digitar o slug
//       de um escritorio que voce nao pretendia criar);
//     - recusa se o slug ja existir — este script nunca sobrescreve;
//     - NENHUM delete fora do desfazer do proprio erro. Diferente dos seeds,
//       este script so cria;
//     - desfazer automatico se falhar no meio. Tenant orfao sem Diretor e um
//       escritorio que ninguem acessa e que trava os seeds para sempre.
//
// SEGURANCA
//   - Escreve com a service role key, que ignora RLS.
//   - A senha do Diretor vai para scripts/credenciais-<slug>.local, modo 0600,
//     ignorado pelo git por *.local. Nunca para o stdout: terminal vira log,
//     log vira anexo de mensagem.
//   - `tenant_email_domains` e OPCIONAL e recusa dominio publico. A unicidade
//     de `domain` e GLOBAL (migration 0002): cadastrar gmail.com rotearia
//     qualquer usuario de Gmail do mundo para este escritorio e impediria
//     qualquer outro tenant de reivindicar o dominio. O escritorio Fernando
//     Costa esta de fora por esse motivo (docs/ARCHITECTURE.md).
//
// CONFERENCIA
//   No fim, o comando prova com LOGIN REAL (chave publicavel, nao a de
//   servico) que:
//     1. o Diretor novo entra e o JWT traz o tenant_id do escritorio novo;
//     2. ele ve o escritorio dele e so ele;
//     3. ele ve zero linha dos outros escritorios;
//     4. um usuario de outro escritorio ve zero linha do novo.
//   Qualquer uma que falhe faz o comando terminar com codigo 1 e um aviso
//   alto. A conferencia NAO desfaz o escritorio: ele foi criado e existe, e
//   apagar dado por causa de uma sonda que pode ter falhado sozinha e pior do
//   que avisar. O que sair impresso e a instrucao de limpeza.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// A barra lateral (src/components/layout/AppLayout.tsx) mostra o nome do
// escritorio em text-lg com tracking-[0.15em], caixa alta e `truncate`. Cabem
// cerca de 14 caracteres — "FERNANDO COSTA" tem exatamente 14. Ver a nota em
// supabase/seed/tenants.mjs, que e onde essa medida foi decidida.
const SIDEBAR_MAX_CHARS = 14

// Dominio publico NAO entra em tenant_email_domains, e a recusa e dura porque
// o estrago e global e silencioso: `domain` e unico no banco inteiro, entao
// cadastrar um destes rotearia gente que nao e do escritorio para dentro dele
// e queimaria o dominio para todos os outros tenants, para sempre.
//
// A lista e um PISO, nao um teto: ela nao tem como conhecer todo provedor de
// e-mail do mundo. Por isso o dominio tambem aparece na confirmacao digitada —
// quem opera precisa olhar para ele antes de escrever o slug.
const PUBLIC_EMAIL_DOMAINS = new Set([
  'aol.com',
  'bol.com.br',
  'click21.com.br',
  'daum.net',
  'fastmail.com',
  'free.fr',
  'gmail.com',
  'gmx.com',
  'gmx.net',
  'globo.com',
  'googlemail.com',
  'hanmail.net',
  'hotmail.com',
  'hotmail.com.br',
  'icloud.com',
  'ig.com.br',
  'inbox.com',
  'live.com',
  'live.com.br',
  'mac.com',
  'mail.com',
  'mail.ru',
  'me.com',
  'msn.com',
  'naver.com',
  'oi.com.br',
  'orange.fr',
  'outlook.com',
  'outlook.com.br',
  'pm.me',
  'pop.com.br',
  'proton.me',
  'protonmail.com',
  'qq.com',
  'r7.com',
  'rediffmail.com',
  'seznam.cz',
  'superig.com.br',
  'terra.com.br',
  't-online.de',
  'uol.com.br',
  'web.de',
  'yahoo.com',
  'yahoo.com.br',
  'yahoo.co.uk',
  'yandex.com',
  'yandex.ru',
  'ymail.com',
  'zipmail.com.br',
  'zoho.com',
  '163.com',
  '126.com',
])

// Espelham os checks do banco. Validar aqui nao substitui o banco — serve para
// o erro chegar ANTES da confirmacao, e nao como 23514 no meio da escrita.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const COLLABORATOR_AREAS = ['commercial', 'projects', 'operations', 'administrative', 'finance']

// ---------------------------------------------------------------------------
// Ambiente e utilitarios
// ---------------------------------------------------------------------------

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env opcional quando as variaveis vem do ambiente */
  }
  return env
}

function abort(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      out._.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[arg.slice(2)] = true
      continue
    }
    out[arg.slice(2)] = next
    i += 1
  }
  return out
}

// 96 bits de aleatoriedade, com maiuscula, minuscula, digito e simbolo
// garantidos pelas bordas — a politica de senha do projeto Supabase pode exigir
// as quatro classes, e uma senha recusada no meio da criacao deixaria o tenant
// pela metade por um motivo bobo.
function newPassword() {
  return `Ab${randomBytes(12).toString('base64url')}!9`
}

function usage() {
  console.error(`
  Cadastra um escritorio novo (tenant + primeiro Diretor).

    npm run create-tenant -- \\
      --name "Atelie Norte" \\
      --slug atelie-norte \\
      --director-name "Fulano de Tal" \\
      --director-email fulano@atelienorte.com.br \\
      [--director-area ${COLLABORATOR_AREAS.join('|')}] \\
      [--email-domain atelienorte.com.br] \\
      [--sim-criar-escritorio-de-verdade]

  --email-domain e OPCIONAL e so vale para escritorio com dominio PROPRIO:
  a unicidade e global, entao um dominio publico (gmail.com, outlook.com...)
  e recusado.
`)
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Validacao dos argumentos (nenhuma escrita acontece aqui)
// ---------------------------------------------------------------------------

function readInput(args) {
  const name = typeof args.name === 'string' ? args.name.trim() : ''
  const slug = typeof args.slug === 'string' ? args.slug.trim().toLowerCase() : ''
  const directorName =
    typeof args['director-name'] === 'string' ? args['director-name'].trim() : ''
  const directorEmail =
    typeof args['director-email'] === 'string' ? args['director-email'].trim().toLowerCase() : ''
  const directorArea =
    typeof args['director-area'] === 'string' ? args['director-area'].trim().toLowerCase() : null
  const emailDomain =
    typeof args['email-domain'] === 'string' ? args['email-domain'].trim().toLowerCase() : null

  if (!name || !slug || !directorName || !directorEmail) usage()

  if (!SLUG_RE.test(slug)) {
    abort(
      `slug invalido: "${slug}".\n` +
        `  O banco exige kebab-case ASCII (tenants_slug_format_check, migration 0002):\n` +
        `  so a-z, 0-9 e hifen entre blocos. Ex: atelie-norte`,
    )
  }
  if (!EMAIL_RE.test(directorEmail)) abort(`e-mail do Diretor invalido: "${directorEmail}"`)
  if (directorArea !== null && !COLLABORATOR_AREAS.includes(directorArea)) {
    abort(`area invalida: "${directorArea}". Valores: ${COLLABORATOR_AREAS.join(', ')}`)
  }

  if (emailDomain !== null) {
    if (!DOMAIN_RE.test(emailDomain)) {
      abort(
        `dominio invalido: "${emailDomain}".\n` +
          `  Sem "@" e sem barra. Ex: atelienorte.com.br`,
      )
    }
    if (PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
      abort(
        `"${emailDomain}" e um dominio de e-mail PUBLICO e nao pode ser cadastrado.\n\n` +
          `  A unicidade de tenant_email_domains.domain e GLOBAL, e nao por escritorio\n` +
          `  (migration 0002). Cadastrar "${emailDomain}" aqui faria duas coisas, as duas\n` +
          `  irreversiveis sem intervencao no banco:\n\n` +
          `    1. rotearia QUALQUER pessoa do mundo com e-mail @${emailDomain} para este\n` +
          `       escritorio no primeiro acesso;\n` +
          `    2. impediria qualquer outro tenant de reivindicar o dominio, para sempre.\n\n` +
          `  E o motivo exato pelo qual o escritorio Fernando Costa esta de fora desta\n` +
          `  tabela (docs/ARCHITECTURE.md). O caminho para escritorio sem dominio proprio\n` +
          `  e este comando: a conta nasce com senha definida aqui e ja vinculada.\n\n` +
          `  Rode de novo SEM --email-domain.`,
      )
    }
  }

  return { name, slug, directorName, directorEmail, directorArea, emailDomain }
}

// ---------------------------------------------------------------------------
// Preflight: tudo que precisa ser lido antes de a primeira linha ser escrita
// ---------------------------------------------------------------------------

async function preflight(db, input) {
  const warnings = []

  const { data: tenants, error: tenantsError } = await db
    .from('tenants')
    .select('id, slug, name, status')
  if (tenantsError) abort(`ler tenants: ${tenantsError.message}`)

  const clash = tenants.find((t) => t.slug === input.slug)
  if (clash) {
    abort(
      `ja existe escritorio com o slug "${input.slug}".\n\n` +
        `  Encontrado:\n` +
        `    nome:   ${clash.name}\n` +
        `    slug:   ${clash.slug}\n` +
        `    status: ${clash.status}\n` +
        `    id:     ${clash.id}\n\n` +
        `  Este comando NUNCA sobrescreve escritorio. Escolha outro slug.`,
    )
  }

  // Nome repetido nao e erro, mas e o defeito que a nota de supabase/seed/
  // tenants.mjs descreve: o nome e o que aparece no topo da tela, e dois
  // escritorios com o mesmo rotulo tornam impossivel saber, olhando, de quem e
  // o dado que esta na tela.
  const sameName = tenants.filter((t) => t.name.toLowerCase() === input.name.toLowerCase())
  for (const t of sameName) {
    warnings.push(
      `ja existe escritorio chamado "${t.name}" (slug ${t.slug}). O nome e o que\n` +
        `      aparece no topo da tela: dois escritorios com o mesmo rotulo tornam\n` +
        `      impossivel saber, olhando, de quem e o dado exibido.`,
    )
  }

  if (input.name.length > SIDEBAR_MAX_CHARS) {
    warnings.push(
      `o nome tem ${input.name.length} caracteres e a barra lateral comporta cerca de\n` +
        `      ${SIDEBAR_MAX_CHARS}. Na tela a equipe vai ler todo dia:\n\n` +
        `          ${input.name.slice(0, SIDEBAR_MAX_CHARS).toUpperCase()}…\n` +
        `          BACKOFFICE\n\n` +
        `      em vez de "${input.name.toUpperCase()}". Nao e impedimento — o nome completo\n` +
        `      continua no titulo da aba e no banco. Marcar ambiente ("(teste)", "(novo)")\n` +
        `      cabe no SLUG, que e onde isso serve para alguma coisa.`,
    )
  }

  if (input.emailDomain) {
    const { data: domainRow, error: domainError } = await db
      .from('tenant_email_domains')
      .select('domain, tenant_id')
      .eq('domain', input.emailDomain)
      .maybeSingle()
    if (domainError) abort(`ler tenant_email_domains: ${domainError.message}`)
    if (domainRow) {
      const owner = tenants.find((t) => t.id === domainRow.tenant_id)
      abort(
        `o dominio "${input.emailDomain}" ja pertence ao escritorio ` +
          `"${owner?.name ?? domainRow.tenant_id}" (${owner?.slug ?? '?'}).\n` +
          `  A unicidade e global e este comando nao toma dominio de ninguem.`,
      )
    }
  }

  // E-mail e global no Supabase Auth. Reaproveitar uma conta existente poria
  // uma pessoa que ja trabalha em outro escritorio dentro deste, em silencio —
  // por isso e recusa, e nao reuso.
  const existingUserId = await findAuthUserByEmail(db, input.directorEmail)
  if (existingUserId) {
    abort(
      `ja existe conta no Auth com o e-mail "${input.directorEmail}" (id ${existingUserId}).\n\n` +
        `  E-mail e global no Supabase Auth. Reaproveitar essa conta aqui poderia por\n` +
        `  alguem de OUTRO escritorio dentro deste sem que ninguem percebesse, entao o\n` +
        `  comando recusa em vez de adivinhar.\n\n` +
        `  Se a conta e mesmo da pessoa certa, o caminho e cria-la com outro e-mail ou\n` +
        `  remover a conta antiga antes, conscientemente.`,
    )
  }

  const { data: menus, error: menusError } = await db.from('menus').select('key, parent_key')
  if (menusError) abort(`ler menus: ${menusError.message}`)
  const groupKeys = new Set(menus.map((m) => m.parent_key).filter(Boolean))
  const leafKeys = menus.filter((m) => !groupKeys.has(m.key)).map((m) => m.key)

  return { tenants, leafKeys, warnings }
}

// Percorre as paginas ate o fim. `listUsers` devolve a primeira pagina por
// padrao; parar nela faria a checagem de e-mail duplicado passar em silencio
// justamente no banco que tem gente demais.
async function findAuthUserByEmail(db, email) {
  const wanted = email.toLowerCase()
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) abort(`listar usuarios do Auth: ${error.message}`)
    for (const u of data.users) {
      if ((u.email ?? '').toLowerCase() === wanted) return u.id
    }
    if (data.users.length < 200) return null
  }
}

// ---------------------------------------------------------------------------
// Confirmacao
// ---------------------------------------------------------------------------

async function confirm(url, input, warnings) {
  console.log('\n' + '='.repeat(74))
  console.log('  VOU CRIAR UM ESCRITORIO NOVO')
  console.log('='.repeat(74))
  console.log(`  projeto Supabase : ${url}`)
  console.log(`  nome             : ${input.name}`)
  console.log(`  slug             : ${input.slug}`)
  console.log(`  Diretor          : ${input.directorName}`)
  console.log(`  e-mail do Diretor: ${input.directorEmail}`)
  console.log(`  area do Diretor  : ${input.directorArea ?? '(nao informada)'}`)
  console.log(`  dominio de e-mail: ${input.emailDomain ?? '(nenhum — recomendado)'}`)
  console.log('='.repeat(74))

  if (warnings.length > 0) {
    console.log('')
    for (const w of warnings) console.log(`  AVISO: ${w}\n`)
  }

  console.log('  Este comando escreve em banco que pode ter DADO REAL DE CLIENTE.')
  console.log('  Confira a URL do projeto acima antes de seguir.\n')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`  Para confirmar, digite o slug "${input.slug}": `)
  rl.close()

  if (answer.trim() !== input.slug) {
    abort('confirmacao nao bateu com o slug. Nada foi criado.')
  }
}

// ---------------------------------------------------------------------------
// Criacao
// ---------------------------------------------------------------------------

async function create(db, input, leafKeys) {
  // Pilha de desfazer. Um escritorio criado pela metade — tenant sem Diretor —
  // e um escritorio que ninguem acessa E que trava os dez seeds para sempre,
  // porque a trava de supabase/seed/tenants.mjs conta tenants, nao Diretores.
  const undo = []
  let createdUserId = null
  let createdTenantId = null

  async function rollback(reason) {
    console.error(`\n  FALHOU: ${reason}`)
    console.error('  Desfazendo o que ja tinha sido criado...')
    const leftovers = []
    for (const step of undo.reverse()) {
      try {
        const error = await step.run()
        if (error) leftovers.push(`${step.what}: ${error}`)
        else console.error(`    desfeito: ${step.what}`)
      } catch (e) {
        leftovers.push(`${step.what}: ${e.message}`)
      }
    }
    if (leftovers.length === 0) {
      console.error('\n  Nada ficou pela metade. O banco esta como antes.\n')
      process.exit(1)
    }
    console.error('\n  NAO CONSEGUI DESFAZER TUDO. Ficou no banco:')
    for (const l of leftovers) console.error(`    - ${l}`)
    console.error('\n  Limpeza a mao, nesta ordem:')
    if (createdTenantId) {
      console.error(
        `    1. delete from public.tenants where id = '${createdTenantId}';\n` +
          `       (cascateia collaborators, collaborator_permissions, tenant_users,\n` +
          `        tenant_email_domains e access_requests)`,
      )
    }
    if (createdUserId) {
      console.error(
        `    2. o usuario do Auth NAO cascateia: apague ${createdUserId}\n` +
          `       (${input.directorEmail}) no painel, em Authentication > Users.`,
      )
    }
    console.error('')
    process.exit(1)
  }

  // 1. O escritorio ----------------------------------------------------------
  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .insert({ name: input.name, slug: input.slug })
    .select('id, name, slug')
    .single()
  if (tenantError) await rollback(`criar tenant: ${tenantError.message}`)
  createdTenantId = tenant.id
  undo.push({
    what: `tenant ${tenant.slug}`,
    run: async () => (await db.from('tenants').delete().eq('id', tenant.id)).error?.message,
  })
  console.log(`  escritorio criado: ${tenant.name} (${tenant.slug})`)

  // 2. O usuario de login do Diretor ------------------------------------------
  // Senha definida aqui, e nao convite por e-mail: o projeto segue sem provedor
  // de e-mail transacional por decisao registrada em docs/ARCHITECTURE.md. E o
  // mesmo caminho usado nas 15 contas do escritorio real (scripts/
  // import-base44.mjs, passo 31). A senha vai para arquivo *.local e e trocada
  // no primeiro acesso.
  const password = newPassword()
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email: input.directorEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.directorName },
  })
  if (userError) await rollback(`criar usuario do Diretor: ${userError.message}`)
  createdUserId = created.user.id
  undo.push({
    what: `usuario do Auth ${input.directorEmail}`,
    run: async () => (await db.auth.admin.deleteUser(created.user.id)).error?.message,
  })
  console.log(`  usuario de login criado: ${input.directorEmail}`)

  // 3. O colaborador ---------------------------------------------------------
  //
  // EXCECAO DELIBERADA, e e a razao de este comando existir: status 'active' e
  // user_id ja preenchido, SEM passar por access_requests.
  //
  // O fluxo normal (migration 0013, approve_access_request) exige que um
  // DIRETOR do escritorio aprove quem entra. Um escritorio recem-criado nao tem
  // Diretor nenhum: ninguem poderia aprovar ninguem, e o escritorio nasceria
  // permanentemente inacessivel. Este e o unico ponto do sistema onde alguem
  // vira colaborador ativo sem aprovacao — e ele acontece fora do produto, com
  // a chave de servico, antes de o escritorio ter qualquer usuario. Do segundo
  // colaborador em diante o caminho e o normal, pela tela de Controle de
  // Acesso.
  const { data: collaborator, error: collaboratorError } = await db
    .from('collaborators')
    .insert({
      tenant_id: tenant.id,
      user_id: created.user.id,
      name: input.directorName,
      role: 'director',
      area: input.directorArea,
      email: input.directorEmail,
      status: 'active',
    })
    .select('id')
    .single()
  if (collaboratorError) await rollback(`criar colaborador: ${collaboratorError.message}`)
  console.log('  colaborador Diretor criado (status active — ver comentario no codigo)')

  // 4. O vinculo que vira claim no JWT ---------------------------------------
  // Sem esta linha o hook custom_access_token_hook (migration 0006) nao acha
  // tenant nenhum, o JWT sai sem tenant_id, e a RLS nao devolve linha alguma:
  // o Diretor entraria e veria um sistema vazio.
  const { error: linkError } = await db
    .from('tenant_users')
    .insert({ tenant_id: tenant.id, user_id: created.user.id, role: 'owner' })
  if (linkError) await rollback(`vincular Diretor ao escritorio: ${linkError.message}`)
  console.log('  vinculo em tenant_users criado (role owner)')

  // 5. As permissoes ---------------------------------------------------------
  //
  // O ACESSO NAO DEPENDE DESTAS LINHAS. can_edit_menu ganhou atalho de Diretor
  // na migration 0019 e can_view_menu ganhou o mesmo atalho na 0059: as duas
  // devolvem true para Diretor active do tenant do JWT sem consultar a matriz.
  // A barra lateral tambem nao consulta (src/features/auth/navigation.ts:138
  // devolve o menu inteiro quando role === 'director'). Um Diretor sem
  // nenhuma linha aqui ja veria e editaria tudo.
  //
  // Elas sao criadas mesmo assim, e por um motivo so: a tela de Controle de
  // Acesso monta a matriz a partir de MENUS_SISTEMA e preenche cada casinha com
  // a linha gravada, caindo para `false` quando nao ha linha
  // (src/features/team/components/PermissoesManager.tsx). Sem estas linhas, o
  // unico Diretor do escritorio apareceria na tela com as 16 caixas
  // desmarcadas — uma tela dizendo "esta pessoa nao acessa nada" sobre quem
  // acessa tudo. E a mesma escolha do seed do modulo 1, que grava
  // director: { view: 'all', edit: 'all' }.
  //
  // Agrupadores (financial, team_group) ficam de fora: nao recebem permissao
  // propria, a sidebar os exibe quando um filho tem can_view.
  const permissionRows = leafKeys.map((key) => ({
    tenant_id: tenant.id,
    collaborator_id: collaborator.id,
    menu_key: key,
    can_view: true,
    can_edit: true,
  }))
  const { error: permError } = await db.from('collaborator_permissions').insert(permissionRows)
  if (permError) await rollback(`gravar permissoes: ${permError.message}`)
  console.log(`  ${permissionRows.length} permissoes gravadas (todos os menus)`)

  // 6. O dominio de e-mail, se houver ----------------------------------------
  if (input.emailDomain) {
    const { error: domainError } = await db
      .from('tenant_email_domains')
      .insert({ tenant_id: tenant.id, domain: input.emailDomain })
    if (domainError) await rollback(`cadastrar dominio: ${domainError.message}`)
    console.log(`  dominio de e-mail cadastrado: ${input.emailDomain}`)
  } else {
    console.log('  dominio de e-mail: nenhum (auto-cadastro por dominio nao sera usado)')
  }

  return { tenantId: tenant.id, userId: created.user.id, collaboratorId: collaborator.id, password }
}

// ---------------------------------------------------------------------------
// Credenciais
// ---------------------------------------------------------------------------

function writeCredentials(url, input, password) {
  const file = resolve(HERE, `credenciais-${input.slug}.local`)
  const content =
    `Primeiro Diretor — escritorio "${input.slug}" (${input.name})\n` +
    `Gerado em ${new Date().toISOString()}\n` +
    `Projeto: ${url}\n\n` +
    `Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em\n` +
    `mensagem. Entregar por canal seguro. Esta e a senha INICIAL e precisa ser\n` +
    `trocada no primeiro acesso.\n\n` +
    `${input.directorName}\n` +
    `  funcao: director   status: active\n` +
    `  email:  ${input.directorEmail}\n` +
    `  senha:  ${password}\n`
  writeFileSync(file, content, { mode: 0o600 })
  return file
}

// ---------------------------------------------------------------------------
// Conferencia com login real
// ---------------------------------------------------------------------------

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

function clientFor(url, anonKey, accessToken) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

// Sessao real de um usuario cuja senha nao conhecemos (o Diretor de OUTRO
// escritorio, que ja existia). O link e gerado pela admin API e trocado por
// sessao pela chave publicavel: o token sai do mesmo caminho de um login de
// verdade, com o mesmo hook e o mesmo claim. Nada e alterado no usuario, e a
// sonda so le.
//
// A alternativa seria conferir a quarta assercao com a service role key, que
// ignora RLS — ou seja, nao conferir nada.
async function sessionByMagicLink(db, url, anonKey, email) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) return { error: error.message }
  const hashed = data?.properties?.hashed_token
  if (!hashed) return { error: 'generateLink nao devolveu hashed_token' }
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: hashed,
    type: 'email',
  })
  if (verifyError) return { error: verifyError.message }
  if (!verified?.session) return { error: 'verifyOtp nao devolveu sessao' }
  return { session: verified.session }
}

async function verify(db, url, anonKey, input, ids) {
  console.log('\n' + '='.repeat(74))
  console.log('  CONFERENCIA (login real, chave publicavel — a de servico nao entra aqui)')
  console.log('='.repeat(74))

  const results = []
  const record = (n, description, ok, detail) => {
    results.push({ n, description, ok, detail })
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${n}. ${description}${detail ? ` — ${detail}` : ''}`)
  }

  // 1. O Diretor novo entra ---------------------------------------------------
  const loginClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: login, error: loginError } = await loginClient.auth.signInWithPassword({
    email: input.directorEmail,
    password: ids.password,
  })
  if (loginError || !login?.session) {
    record(1, 'o Diretor novo entra', false, loginError?.message ?? 'sem sessao')
    return results
  }
  const claims = decodeJwt(login.session.access_token)
  const claimTenant = claims.app_metadata?.tenant_id ?? null
  record(
    1,
    'o Diretor novo entra e o JWT traz o tenant do escritorio novo',
    claimTenant === ids.tenantId,
    `claim tenant_id = ${claimTenant ?? 'AUSENTE'}`,
  )

  const director = clientFor(url, anonKey, login.session.access_token)

  // 2. Ve o escritorio dele, e so ele -----------------------------------------
  const { data: visibleTenants, error: tenantsError } = await director
    .from('tenants')
    .select('id, slug')
  const onlyOwn =
    !tenantsError && visibleTenants?.length === 1 && visibleTenants[0].id === ids.tenantId
  record(
    2,
    've o escritorio dele e so ele',
    onlyOwn,
    tenantsError
      ? tenantsError.message
      : `${visibleTenants.length} escritorio(s): ${visibleTenants.map((t) => t.slug).join(', ') || '-'}`,
  )

  // 3. Ve zero linha dos outros escritorios -----------------------------------
  //
  // A sonda so vale onde a chave de servico ENXERGA linha. Perguntar "quantas
  // linhas de outro escritorio voce ve?" numa tabela vazia devolve zero por
  // motivo nenhum, e uma assercao dessas passa para sempre — este projeto ja
  // escreveu assercao vazia assim antes.
  const others = ids.otherTenants
  const probeTables = ['collaborators', 'clients', 'projects', 'accounts_receivable']
  let probed = 0
  const leaked = []
  for (const other of others) {
    for (const table of probeTables) {
      const { count: realCount, error: realError } = await db
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', other.id)
      if (realError || !realCount) continue
      probed += 1
      const { count: seen, error: seenError } = await director
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', other.id)
      if (seenError) continue
      if (seen !== 0) leaked.push(`${other.slug}.${table}=${seen} (existem ${realCount})`)
    }
  }
  if (probed === 0) {
    record(
      3,
      've zero linha dos outros escritorios',
      false,
      'NAO CONFERIDO: nenhum outro escritorio tem linha nas tabelas sondadas',
    )
  } else {
    record(
      3,
      've zero linha dos outros escritorios',
      leaked.length === 0,
      leaked.length === 0
        ? `${probed} sondas, todas zero`
        : `VAZOU: ${leaked.join('; ')}`,
    )
  }

  // 4. Um usuario de outro escritorio ve zero do novo -------------------------
  const outsider = ids.outsider
  if (!outsider) {
    record(
      4,
      'um usuario de outro escritorio ve zero do novo',
      false,
      'NAO CONFERIDO: nao ha colaborador active com login em outro escritorio',
    )
  } else {
    const { session, error: sessionError } = await sessionByMagicLink(
      db,
      url,
      anonKey,
      outsider.email,
    )
    if (!session) {
      record(4, 'um usuario de outro escritorio ve zero do novo', false, sessionError)
    } else {
      const stranger = clientFor(url, anonKey, session.access_token)
      const { data: strangerTenants } = await stranger.from('tenants').select('id, slug')
      const sawNewTenant = (strangerTenants ?? []).some((t) => t.id === ids.tenantId)
      const { count: sawCollaborators } = await stranger
        .from('collaborators')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', ids.tenantId)
      const ok = !sawNewTenant && (sawCollaborators ?? 0) === 0
      record(
        4,
        `um usuario de outro escritorio (${outsider.tenantSlug}) ve zero do novo`,
        ok,
        ok
          ? 'tenants e collaborators do escritorio novo: 0 linhas'
          : `VAZOU: tenant=${sawNewTenant ? 'visivel' : 'oculto'}, collaborators=${sawCollaborators}`,
      )
    }
  }

  return results
}

// Escolhe alguem de outro escritorio para a quarta assercao: colaborador
// active, com login, do tenant que tiver mais gente — quanto mais povoado, mais
// a assercao significa alguma coisa.
async function pickOutsider(db, tenants, newTenantId) {
  const candidates = tenants.filter((t) => t.id !== newTenantId)
  for (const tenant of candidates) {
    const { data, error } = await db
      .from('collaborators')
      .select('email, tenant_id')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .not('user_id', 'is', null)
      .limit(1)
    if (error || !data?.length) continue
    return { email: data[0].email, tenantSlug: tenant.slug }
  }
  return null
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) usage()

  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    abort('faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.')
  }
  if (!anonKey) {
    abort(
      'falta VITE_SUPABASE_ANON_KEY no .env. Ela e a chave da CONFERENCIA: sem ela\n' +
        '  o comando criaria o escritorio sem conseguir provar, com login real, que a\n' +
        '  fronteira entre escritorios esta de pe.',
    )
  }

  const input = readInput(args)
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { tenants, leafKeys, warnings } = await preflight(db, input)

  if (args['sim-criar-escritorio-de-verdade'] === true) {
    console.log('\n  --sim-criar-escritorio-de-verdade: seguindo sem confirmacao digitada.')
    console.log(`  projeto: ${url}   escritorio: ${input.name} (${input.slug})`)
    for (const w of warnings) console.log(`\n  AVISO: ${w}`)
    console.log('')
  } else {
    await confirm(url, input, warnings)
  }

  console.log('')
  const ids = await create(db, input, leafKeys)

  const file = writeCredentials(url, input, ids.password)
  console.log(`\n  Senha do Diretor em ${file.replace(`${ROOT}/`, '')} (modo 0600).`)
  console.log('  Entregar por canal seguro. Ela nao aparece no terminal de proposito.')

  ids.otherTenants = tenants
  ids.outsider = await pickOutsider(db, tenants, ids.tenantId)

  const results = await verify(db, url, anonKey, input, ids)
  const failed = results.filter((r) => !r.ok)

  if (failed.length === 0) {
    console.log(`\n  Escritorio "${input.name}" (${input.slug}) criado e conferido.`)
    // Este comando cria UM Diretor de proposito: e o minimo para destravar o
    // ovo e a galinha, e nao cabe a ele inventar o resto da equipe. Mas um
    // escritorio com um Diretor so fica sem quem administre no dia em que ele
    // entrar de ferias — auth_collaborator_id() devolve null para quem nao
    // esta active, e Diretor e o unico papel que gerencia equipe. E item
    // obrigatorio em docs/ARCHITECTURE.md, e o unico que este comando nao tem
    // como cumprir sozinho.
    console.log(
      `\n  PROXIMO PASSO: o escritorio tem UM Diretor. Diretor e o unico papel que\n` +
        `  gerencia equipe, e Diretor em Ferias ou Afastado nao le nada — com um so,\n` +
        `  o escritorio fica sem quem administre no primeiro afastamento. Cadastre o\n` +
        `  segundo pela tela de Controle de Acesso, com este Diretor logado.\n`,
    )
    return
  }

  console.error('\n' + '!'.repeat(74))
  console.error('  A CONFERENCIA FALHOU. O ESCRITORIO FOI CRIADO E EXISTE NO BANCO.')
  console.error('!'.repeat(74))
  for (const f of failed) console.error(`  - ${f.n}. ${f.description}: ${f.detail}`)
  console.error(
    '\n  Nada foi desfeito automaticamente: apagar dado de um escritorio recem-criado\n' +
      '  por causa de uma sonda que pode ter falhado sozinha e pior do que avisar.\n' +
      '  Decida olhando o que falhou. Para desfazer a mao:\n\n' +
      `    delete from public.tenants where id = '${ids.tenantId}';\n` +
      '      (cascateia collaborators, permissoes, tenant_users e dominio)\n' +
      `    e apague o usuario ${ids.userId} (${input.directorEmail}) no painel,\n` +
      '      em Authentication > Users — auth.users nao cascateia.\n',
  )
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
