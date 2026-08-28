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
//     - diario em disco + desfazer automatico, inclusive por interrupcao. Ver
//       a secao abaixo.
//
// O DIARIO — por que existe, e o que ele fecha
//   O pior estado que este comando pode produzir nao e erro: e MORTE SUBITA no
//   meio. Ctrl-C, queda de rede ou `kill` entre criar o tenant e criar o
//   Diretor deixa um escritorio que ninguem acessa (nao ha Diretor, e entrar
//   exige aprovacao de um) e que trava os dez seeds para sempre (a trava de
//   supabase/seed/tenants.mjs conta tenants, nao Diretores) — sem nada, em
//   lugar nenhum, explicando por que.
//
//   Por isso, ANTES de cada escrita, o estado vai para
//   scripts/create-tenant-<slug>.journal.local (0600, ignorado pelo git por
//   *.local), gravado de forma atomica (arquivo temporario + rename). Tres
//   coisas decorrem disso:
//     1. SIGINT/SIGTERM disparam o mesmo desfazer do erro tratado, em vez de
//        matar o processo no meio;
//     2. se o desfazer nao terminar, o diario fica em disco com o que sobrou;
//     3. a execucao SEGUINTE le os diarios pendentes, confere no banco o que
//        de fato ficou, e oferece limpar antes de seguir — em vez de a pessoa
//        descobrir pelo seed abortando semanas depois.
//
//   O QUE O DIARIO NAO COBRE, e fica na mao:
//     - o diario e um arquivo LOCAL. Se a proxima execucao for em outra
//       maquina (ou o *.local for apagado), ela nao ve pendencia nenhuma;
//     - `kill -9` durante o proprio rename, ou perda de energia antes de o
//       sistema de arquivos gravar de fato (nao ha fsync);
//     - `kill -9` na janela entre gravar o diario e a escrita chegar ao banco:
//       aqui o diario EXISTE e a recuperacao resolve, porque ela nao acredita
//       no diario — ela pergunta ao banco o que realmente existe.
//   Em qualquer um desses, a limpeza a mao e: apagar o tenant pelo slug (que
//   cascateia tudo) e apagar o usuario do Auth pelo e-mail, no painel.
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
//
//   A quarta usa uma conta de ESCRITORIO DE TESTE, cuja senha esta em
//   supabase/seed/credenciais*.local e e legitimamente nossa. Nao personifica
//   pessoa de verdade: minerar sessao de um Diretor real (por magic link da
//   admin API, que seria tecnicamente possivel) deixaria evento de login no
//   nome dessa pessoa, para sempre, num Auth com dado de cliente. Se nao
//   houver escritorio de teste neste banco, a assercao 4 e PULADA e anunciada
//   — assercao pulada e anunciada e honesta; assercao que passa por cima de
//   uma pessoa real, nao.
//
//   FALHA faz o comando sair com codigo 1. PULADA sai com 0, mas imprime um
//   bloco proprio: o escritorio foi criado, e o que nao foi provado esta dito.
//   A conferencia NAO desfaz o escritorio: ele foi criado e existe, e apagar
//   dado por causa de uma sonda que pode ter falhado sozinha e pior do que
//   avisar.

import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const JOURNAL_SUFFIX = '.journal.local'
const SEED_DIR = resolve(ROOT, 'supabase/seed')

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
      /* O .env do ambiente ATIVO vence o shell — ver npm run env:prod|env:dev.
         O contrario deixava um SUPABASE_ACCESS_TOKEN exportado numa sessao
         antiga sobreviver a troca de ambiente, autenticando numa conta enquanto
         o resto apontava para o projeto da outra. */
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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

function rel(path) {
  return path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path
}

// Os dois arquivos de credencial de seed divergem na acentuacao ("funcao" num,
// "função" no outro). Comparar sem acento e mais barato do que exigir que os
// seeds concordem.
function stripAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Leitura do stdin em FILA, e nao uma interface de readline por pergunta.
//
// Este comando pergunta ate duas vezes (limpar entulho de execucao
// interrompida, e confirmar a criacao). As duas formas obvias falham quando a
// entrada vem de um pipe, e nao de um terminal:
//   - uma interface por pergunta: fechar a primeira descarta o que ja tinha
//     sido lido do stdin, e a segunda pergunta recebe EOF sem ninguem ter
//     respondido;
//   - uma interface compartilhada com `question()`: o readline entrega TODAS as
//     linhas do pipe de uma vez, e a que chega sem pergunta pendente e jogada
//     fora — depois disso a interface fecha no EOF e a segunda pergunta estoura
//     com ERR_USE_AFTER_CLOSE.
// Guardar toda linha que chega e servir as perguntas a partir da fila funciona
// nos dois casos. Resposta que nunca vem (EOF) vira string vazia, que nao bate
// com nenhuma confirmacao e portanto aborta — que e o desfecho seguro.
const lineQueue = []
const lineWaiters = []
let stdinReader = null
let stdinEnded = false

function startStdinReader() {
  if (stdinReader) return
  stdinReader = createInterface({ input: process.stdin })
  stdinReader.on('line', (line) => {
    const waiter = lineWaiters.shift()
    if (waiter) waiter(line)
    else lineQueue.push(line)
  })
  stdinReader.on('close', () => {
    stdinEnded = true
    while (lineWaiters.length > 0) lineWaiters.shift()('')
  })
}

function ask(question) {
  startStdinReader()
  process.stdout.write(question)
  if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift())
  if (stdinEnded) return Promise.resolve('')
  return new Promise((resolve) => lineWaiters.push(resolve))
}

// Sem isto o processo fica preso no stdin aberto depois da ultima pergunta.
function closePrompts() {
  if (stdinReader) {
    stdinReader.close()
    stdinReader = null
  }
  process.stdin.pause()
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
// Diario de execucao
// ---------------------------------------------------------------------------

function journalPath(slug) {
  return resolve(HERE, `create-tenant-${slug}${JOURNAL_SUFFIX}`)
}

// Gravacao ATOMICA: escreve num temporario e renomeia. `rename` no mesmo
// sistema de arquivos e atomico, entao um kill no meio deixa o diario ANTERIOR
// intacto em vez de um JSON pela metade que a recuperacao nao saberia ler.
function saveJournal(state) {
  const file = journalPath(state.slug)
  const tmp = `${file}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, file)
  } catch (e) {
    // Sem diario nao ha escrita: o diario e a unica coisa que transforma "morri
    // no meio" em "da para limpar depois". Gravar no banco sem ele seria abrir
    // exatamente o buraco que ele existe para fechar.
    abort(
      `nao consegui gravar o diario em ${rel(file)}: ${e.message}\n` +
        `  Nada foi criado. Sem o diario, uma interrupcao deixaria escritorio orfao\n` +
        `  sem nenhum rastro, entao o comando prefere nao comecar.`,
    )
  }
}

function clearJournal(slug) {
  rmSync(journalPath(slug), { force: true })
  rmSync(`${journalPath(slug)}.tmp`, { force: true })
}

function listJournals() {
  let names = []
  try {
    names = readdirSync(HERE).filter((f) => f.endsWith(JOURNAL_SUFFIX))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const file = resolve(HERE, name)
    try {
      out.push({ file, state: JSON.parse(readFileSync(file, 'utf8')) })
    } catch (e) {
      // Diario ilegivel e o caso residual que o rename atomico quase elimina.
      // "Quase" nao e "nunca", entao ele aparece — em voz alta, com o caminho.
      out.push({ file, state: null, parseError: e.message })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Recuperacao de execucao interrompida
// ---------------------------------------------------------------------------

// Roda ANTES da checagem de slug duplicado, de proposito: o entulho mais
// provavel de uma execucao interrompida e justamente um tenant com o slug que
// se esta tentando criar de novo, e "slug ja existe" sem explicacao seria a
// pior forma de descobrir isso.
async function recoverInterrupted(db, url, args) {
  const journals = listJournals()
  if (journals.length === 0) return

  for (const { file, state, parseError } of journals) {
    if (parseError || !state?.slug) {
      console.error(`\n  DIARIO ILEGIVEL: ${rel(file)}`)
      console.error(`    ${parseError ?? 'sem slug'}`)
      console.error(
        '    Uma execucao anterior foi interrompida durante a propria gravacao do\n' +
          '    diario. Abra o arquivo, veja o slug e o e-mail que estao la, confira no\n' +
          '    banco se existem, e apague o arquivo quando resolver.',
      )
      abort('diario ilegivel em disco. Resolva antes de criar escritorio novo.')
    }

    if (state.url !== url) {
      console.error(`\n  AVISO: ${rel(file)} e de OUTRO projeto Supabase (${state.url}).`)
      console.error('    Nao mexo nele. Rode o comando com o .env daquele projeto.\n')
      continue
    }

    // A recuperacao NAO acredita no diario: ela pergunta ao banco o que de fato
    // existe. O diario diz onde olhar; quem responde e o banco. E isso que
    // cobre o kill entre gravar o diario e a escrita chegar (ou nao chegar).
    const { data: tenant, error: tenantError } = await db
      .from('tenants')
      .select('id, slug, name, created_at')
      .eq('slug', state.slug)
      .maybeSingle()
    if (tenantError) abort(`ler tenants durante a recuperacao: ${tenantError.message}`)

    const userId = state.directorEmail ? await findAuthUserByEmail(db, state.directorEmail) : null

    let directorCount = 0
    if (tenant) {
      const { count } = await db
        .from('collaborators')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('role', 'director')
      directorCount = count ?? 0
    }

    if (!tenant && !userId) {
      rmSync(file, { force: true })
      console.log(
        `\n  Diario de execucao interrompida em ${rel(file)}: nada ficou no banco.\n` +
          '  Arquivo apagado. Seguindo.\n',
      )
      continue
    }

    console.error('\n' + '!'.repeat(74))
    console.error('  EXECUCAO ANTERIOR NAO TERMINOU, E DEIXOU COISA NO BANCO')
    console.error('!'.repeat(74))
    console.error(`  diario     : ${rel(file)}`)
    console.error(`  comecou em : ${state.startedAt}`)
    console.error(`  escritorio : ${state.name} (${state.slug})`)
    console.error(`  Diretor    : ${state.directorEmail}`)
    console.error('\n  No banco, agora:')
    if (tenant) {
      console.error(`    - tenant "${tenant.slug}" (${tenant.name}), id ${tenant.id}`)
      console.error(
        `      Diretores nele: ${directorCount}` +
          (directorCount === 0
            ? '  <- escritorio ORFAO: ninguem consegue entrar, e ele trava os dez seeds'
            : ''),
      )
    } else {
      console.error('    - tenant: nao existe (nao chegou a ser criado, ou ja foi desfeito)')
    }
    console.error(
      userId
        ? `    - usuario do Auth ${state.directorEmail}, id ${userId}`
        : '    - usuario do Auth: nao existe',
    )
    console.error('')

    if (args['sim-criar-escritorio-de-verdade'] === true) {
      abort(
        'ha entulho de execucao interrompida e --sim-criar-escritorio-de-verdade nao\n' +
          '  apaga nada sozinho. Rode o comando SEM a bandeira para decidir o que fazer,\n' +
          '  olhando o que esta escrito acima.',
      )
    }

    const answer = await ask(
      `  Digite o slug "${state.slug}" para APAGAR isso, ou "manter" para deixar como esta: `,
    )
    const typed = answer.trim()

    if (typed === 'manter') {
      console.log(
        `\n  Mantido. O diario continua em ${rel(file)} e este aviso volta na proxima\n` +
          '  execucao.\n',
      )
      continue
    }
    if (typed !== state.slug) {
      abort('resposta nao bateu com o slug nem com "manter". Nada foi apagado.')
    }

    const { removed, leftovers } = await destroyPartial(db, state.slug, state.directorEmail)
    for (const r of removed) console.log(`    apagado: ${r}`)
    if (leftovers.length > 0) {
      console.error('\n  NAO CONSEGUI APAGAR TUDO:')
      for (const l of leftovers) console.error(`    - ${l}`)
      abort(`${rel(file)} foi mantido para a proxima tentativa. Resolva antes de seguir.`)
    }
    rmSync(file, { force: true })
    console.log(`    apagado: ${rel(file)}\n`)
  }
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
//
// Devolve { id, error } em vez de abortar: esta funcao tambem e chamada de
// dentro do desfazer, onde abortar significaria desistir da limpeza no meio.
async function findAuthUser(db, email) {
  const wanted = email.toLowerCase()
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { id: null, error: error.message }
    for (const u of data.users) {
      if ((u.email ?? '').toLowerCase() === wanted) return { id: u.id, error: null }
    }
    if (data.users.length < 200) return { id: null, error: null }
  }
}

async function findAuthUserByEmail(db, email) {
  const { id, error } = await findAuthUser(db, email)
  if (error) abort(`listar usuarios do Auth: ${error}`)
  return id
}

// Apaga o que uma execucao criou, perguntando ao BANCO o que existe — nunca a
// uma lista em memoria.
//
// POR QUE NAO HA PILHA DE DESFAZER
//   A primeira versao empilhava "o que ja criei" e desfazia de tras para a
//   frente. Isso tem um buraco que so aparece com sinal: quando SIGINT/SIGTERM
//   chega COM UMA ESCRITA EM VOO, o item ainda nao esta na pilha — a chamada
//   nao retornou — mas ja chegou ao servidor. O desfazer entao anunciava "nada
//   ficou pela metade" enquanto deixava, por exemplo, um usuario de Auth
//   criado e invisivel. Foi exatamente o que aconteceu no teste de interrupcao.
//
//   Perguntar ao banco nao tem esse buraco: se a linha existe, ela e apagada,
//   tenha a chamada retornado ou nao. E e o mesmo caminho que a recuperacao da
//   execucao seguinte usa, entao ha um comportamento so para manter e auditar.
async function destroyPartial(db, slug, directorEmail) {
  const removed = []
  const leftovers = []

  const { data: tenant, error: readError } = await db
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (readError) {
    leftovers.push(`nao consegui ler o tenant ${slug}: ${readError.message}`)
  } else if (tenant) {
    const { error } = await db.from('tenants').delete().eq('id', tenant.id)
    if (error) leftovers.push(`tenant ${slug} (${tenant.id}): ${error.message}`)
    else removed.push(`tenant ${slug} (cascateou colaboradores, permissoes, vinculos e dominio)`)
  }

  // auth.users NAO cascateia com tenants: vai a parte, sempre.
  const { id: userId, error: lookupError } = await findAuthUser(db, directorEmail)
  if (lookupError) {
    leftovers.push(`nao consegui procurar o usuario ${directorEmail} no Auth: ${lookupError}`)
  } else if (userId) {
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) leftovers.push(`usuario do Auth ${directorEmail} (${userId}): ${error.message}`)
    else removed.push(`usuario do Auth ${directorEmail}`)
  }

  return { removed, leftovers }
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

  const answer = await ask(`  Para confirmar, digite o slug "${input.slug}": `)

  if (answer.trim() !== input.slug) {
    abort('confirmacao nao bateu com o slug. Nada foi criado.')
  }
}

// ---------------------------------------------------------------------------
// Criacao
// ---------------------------------------------------------------------------

async function create(db, url, input, leafKeys) {
  // Um escritorio criado pela metade — tenant sem Diretor — e um escritorio que
  // ninguem acessa E que trava os dez seeds para sempre, porque a trava de
  // supabase/seed/tenants.mjs conta tenants, nao Diretores. O diario abaixo e o
  // que torna esse estado recuperavel.
  const journal = {
    version: 1,
    url,
    slug: input.slug,
    name: input.name,
    directorEmail: input.directorEmail,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    // "pending" quer dizer "mandei escrever e nao sei se chegou". A recuperacao
    // resolve perguntando ao banco, nao lendo este campo.
    tenant: { status: 'pending', id: null },
    authUser: { status: 'not_started', id: null },
    done: [],
  }

  // Escrita em voo. O desfazer por SINAL espera esta promessa terminar antes de
  // olhar o banco: sem isso, o `createUser` que ja saiu pela rede mas ainda nao
  // voltou nao seria visto por ninguem — nem pela limpeza (que consultaria o
  // Auth cedo demais) nem pelo diario. Foi assim que um usuario de Auth
  // sobreviveu a um SIGTERM que anunciou "nada ficou pela metade".
  let interrupted = false
  let inFlight = null
  const writing = async (promise) => {
    inFlight = promise
    let result
    try {
      result = await promise
    } finally {
      inFlight = null
    }
    // Sinal recebido: o fluxo normal PARA aqui, para sempre. Sem esta trava, o
    // desfazer e a criacao correm juntos — a criacao continua gravando enquanto
    // a limpeza apaga, e o que for gravado depois do apagamento sobrevive. Quem
    // termina o processo e o rollback, com process.exit.
    if (interrupted) await new Promise(() => {})
    return result
  }

  let rollingBack = false

  async function rollback(reason) {
    if (rollingBack) return
    rollingBack = true
    console.error(`\n  FALHOU: ${reason}`)
    console.error('  Desfazendo o que ja tinha sido criado...')

    const { removed, leftovers } = await destroyPartial(db, input.slug, input.directorEmail)
    for (const r of removed) console.error(`    desfeito: ${r}`)
    if (removed.length === 0 && leftovers.length === 0) {
      console.error('    (nada tinha chegado a ser criado)')
    }

    if (leftovers.length === 0) {
      clearJournal(input.slug)
      console.error('\n  Nada ficou pela metade. O banco esta como antes.\n')
      process.exit(1)
    }

    journal.leftovers = leftovers
    journal.failedAt = new Date().toISOString()
    saveJournal(journal)
    console.error('\n  NAO CONSEGUI DESFAZER TUDO. Ficou no banco:')
    for (const l of leftovers) console.error(`    - ${l}`)
    console.error(
      `\n  Isso esta registrado em ${rel(journalPath(input.slug))}, e a proxima execucao\n` +
        '  deste comando vai avisar e oferecer limpar. Para resolver agora, a mao:\n\n' +
        `    1. delete from public.tenants where slug = '${input.slug}';\n` +
        '       (cascateia collaborators, collaborator_permissions, tenant_users,\n' +
        '        tenant_email_domains e access_requests)\n' +
        `    2. o usuario do Auth NAO cascateia: apague ${input.directorEmail}\n` +
        '       no painel, em Authentication > Users.\n',
    )
    process.exit(1)
  }

  // Interrupcao passa pelo MESMO desfazer do erro tratado. Sem isto, Ctrl-C
  // entre o tenant e o Diretor deixaria escritorio orfao e silencioso — o pior
  // estado que este comando consegue produzir.
  const onSignal = (signal) => {
    if (interrupted) {
      console.error('\n  Segundo sinal: saindo sem terminar de desfazer.')
      console.error(
        `  O que sobrar esta em ${rel(journalPath(input.slug))} e a proxima execucao\n` +
          '  deste comando avisa e oferece limpar.\n',
      )
      process.exit(130)
    }
    interrupted = true
    console.error(`\n\n  Recebi ${signal}.`)
    void (async () => {
      // Deixa a escrita em voo terminar (com sucesso ou erro) para que a
      // limpeza enxergue o que ela criou.
      if (inFlight) {
        console.error('  Esperando a escrita em andamento terminar antes de limpar...')
        try {
          await inFlight
        } catch {
          /* o erro dela nao importa aqui: quem manda e o que estiver no banco */
        }
      }
      await rollback(`interrompido por ${signal}`)
    })()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  const releaseSignals = () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }

  // 1. O escritorio ----------------------------------------------------------
  saveJournal(journal)
  const { data: tenant, error: tenantError } = await writing(
    db.from('tenants').insert({ name: input.name, slug: input.slug }).select('id, name, slug').single(),
  )
  // Erro na resposta nao quer dizer que o insert nao chegou ao banco. Por isso o
  // desfazer procura pelo SLUG em vez de depender de um id que talvez nao exista.
  if (tenantError) await rollback(`criar tenant: ${tenantError.message}`)
  journal.tenant = { status: 'created', id: tenant.id }
  journal.done.push('tenant')
  saveJournal(journal)
  console.log(`  escritorio criado: ${tenant.name} (${tenant.slug})`)

  // 2. O usuario de login do Diretor ------------------------------------------
  // Senha definida aqui, e nao convite por e-mail: o projeto segue sem provedor
  // de e-mail transacional por decisao registrada em docs/ARCHITECTURE.md. E o
  // mesmo caminho usado nas 15 contas do escritorio real (scripts/
  // import-base44.mjs, passo 31). A senha vai para arquivo *.local e e trocada
  // no primeiro acesso.
  journal.authUser = { status: 'pending', id: null }
  saveJournal(journal)
  const password = newPassword()
  const { data: created, error: userError } = await writing(
    db.auth.admin.createUser({
      email: input.directorEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: input.directorName },
    }),
  )
  if (userError) await rollback(`criar usuario do Diretor: ${userError.message}`)
  journal.authUser = { status: 'created', id: created.user.id }
  journal.done.push('auth_user')
  saveJournal(journal)
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
  const { data: collaborator, error: collaboratorError } = await writing(
    db
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
      .single(),
  )
  if (collaboratorError) await rollback(`criar colaborador: ${collaboratorError.message}`)
  journal.done.push('collaborator')
  saveJournal(journal)
  console.log('  colaborador Diretor criado (status active — ver comentario no codigo)')

  // 4. O vinculo que vira claim no JWT ---------------------------------------
  // Sem esta linha o hook custom_access_token_hook (migration 0006) nao acha
  // tenant nenhum, o JWT sai sem tenant_id, e a RLS nao devolve linha alguma:
  // o Diretor entraria e veria um sistema vazio.
  const { error: linkError } = await writing(
    db.from('tenant_users').insert({ tenant_id: tenant.id, user_id: created.user.id, role: 'owner' }),
  )
  if (linkError) await rollback(`vincular Diretor ao escritorio: ${linkError.message}`)
  journal.done.push('tenant_users')
  saveJournal(journal)
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
  const { error: permError } = await writing(
    db.from('collaborator_permissions').insert(permissionRows),
  )
  if (permError) await rollback(`gravar permissoes: ${permError.message}`)
  journal.done.push('collaborator_permissions')
  saveJournal(journal)
  console.log(`  ${permissionRows.length} permissoes gravadas (todos os menus)`)

  // 6. O dominio de e-mail, se houver ----------------------------------------
  if (input.emailDomain) {
    const { error: domainError } = await writing(
      db.from('tenant_email_domains').insert({ tenant_id: tenant.id, domain: input.emailDomain }),
    )
    if (domainError) await rollback(`cadastrar dominio: ${domainError.message}`)
    journal.done.push('tenant_email_domains')
    saveJournal(journal)
    console.log(`  dominio de e-mail cadastrado: ${input.emailDomain}`)
  } else {
    console.log('  dominio de e-mail: nenhum (auto-cadastro por dominio nao sera usado)')
  }

  // Daqui para a frente nao ha mais nada a desfazer: o escritorio esta inteiro.
  // Os handlers saem para que um Ctrl-C durante a conferencia NAO apague um
  // escritorio que ja existe e ja esta correto.
  releaseSignals()
  clearJournal(input.slug)

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

// Contas de ESCRITORIO DE TESTE, com senha que e legitimamente nossa (gerada
// pelos seeds, guardada em supabase/seed/credenciais*.local). E daqui que sai o
// usuario "de outro escritorio" da quarta assercao.
//
// A alternativa descartada foi minerar sessao de um Diretor de verdade pela
// admin API (generateLink + verifyOtp). Funciona, e read-only, e mesmo assim
// nao entra: deixaria evento de login registrado no nome de uma pessoa real,
// para sempre, num projeto Auth com dado de cliente. Prova de isolamento nao
// justifica escrever no historico de ninguem.
function readTestCredentials(url) {
  let names = []
  try {
    names = readdirSync(SEED_DIR).filter((f) => /^credenciais.*\.local$/.test(f))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    let raw
    try {
      raw = readFileSync(resolve(SEED_DIR, name), 'utf8')
    } catch {
      continue
    }
    const plain = stripAccents(raw)
    const slug = plain.match(/escritorio\s+"([^"]+)"/i)?.[1] ?? null
    const projeto = plain.match(/^Projeto:\s*(\S+)/m)?.[1] ?? null
    if (!slug || projeto !== url) continue
    const accounts = []
    for (const m of plain.matchAll(
      /funcao:\s*(\S+)\s+status:\s*(\S+)\s*\n\s*email:\s*(\S+)\s*\n\s*senha:\s*(\S+)/g,
    )) {
      accounts.push({ role: m[1], status: m[2], email: m[3], password: m[4] })
    }
    out.push({ file: `supabase/seed/${name}`, slug, accounts })
  }
  return out
}

// Escolhe a conta de teste que vai provar a quarta assercao. Confere no banco,
// com a chave de servico, que a pessoa e mesmo colaboradora ATIVA COM LOGIN
// daquele escritorio: sondar com uma conta que a RLS ja rejeitaria por outro
// motivo faria a assercao passar sem afirmar nada.
async function pickTestOutsider(db, tenants, newTenantId, url) {
  const files = readTestCredentials(url)
  if (files.length === 0) {
    return {
      outsider: null,
      reason:
        'nao ha supabase/seed/credenciais*.local deste projeto Supabase — este banco ' +
        'nao tem escritorio de teste com senha conhecida',
    }
  }

  const bySlug = new Map(tenants.map((t) => [t.slug, t]))
  let sawFileWithoutTenant = false

  for (const file of files) {
    const tenant = bySlug.get(file.slug)
    if (!tenant || tenant.id === newTenantId) {
      sawFileWithoutTenant = true
      continue
    }
    // Diretor primeiro: e o papel que mais enxerga dentro do proprio
    // escritorio, entao "ele nao ve nada do novo" e a versao mais forte da
    // assercao.
    const ordered = [...file.accounts].sort(
      (a, b) => Number(b.role === 'director') - Number(a.role === 'director'),
    )
    for (const account of ordered) {
      const { data } = await db
        .from('collaborators')
        .select('email')
        .eq('tenant_id', tenant.id)
        .eq('email', account.email)
        .eq('status', 'active')
        .not('user_id', 'is', null)
        .maybeSingle()
      if (!data) continue
      return {
        outsider: { ...account, tenantSlug: tenant.slug, file: file.file },
        reason: null,
      }
    }
  }

  return {
    outsider: null,
    reason: sawFileWithoutTenant
      ? 'os arquivos de credencial de teste nao correspondem a nenhum escritorio ' +
        'existente neste banco (seed apagado ou desatualizado)'
      : 'nenhuma conta dos arquivos de credencial e colaborador active com login',
  }
}

async function verify(db, url, anonKey, input, ids) {
  console.log('\n' + '='.repeat(74))
  console.log('  CONFERENCIA (login real, chave publicavel — a de servico nao entra aqui)')
  console.log('='.repeat(74))

  const results = []
  const record = (n, description, status, detail) => {
    results.push({ n, description, status, detail })
    const tag = { ok: 'ok    ', fail: 'FALHA ', skip: 'PULADO' }[status]
    console.log(`  ${tag} ${n}. ${description}${detail ? ` — ${detail}` : ''}`)
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
    record(1, 'o Diretor novo entra', 'fail', loginError?.message ?? 'sem sessao')
    return results
  }
  const claims = decodeJwt(login.session.access_token)
  const claimTenant = claims.app_metadata?.tenant_id ?? null
  record(
    1,
    'o Diretor novo entra e o JWT traz o tenant do escritorio novo',
    claimTenant === ids.tenantId ? 'ok' : 'fail',
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
    onlyOwn ? 'ok' : 'fail',
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
  const probeTables = ['collaborators', 'clients', 'projects', 'accounts_receivable']
  let probed = 0
  const leaked = []
  for (const other of ids.otherTenants) {
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
      'skip',
      'nenhum outro escritorio tem linha nas tabelas sondadas — nao ha o que vazar',
    )
  } else {
    record(
      3,
      've zero linha dos outros escritorios',
      leaked.length === 0 ? 'ok' : 'fail',
      leaked.length === 0 ? `${probed} sondas, todas zero` : `VAZOU: ${leaked.join('; ')}`,
    )
  }

  // 4. Um usuario de outro escritorio ve zero do novo -------------------------
  const { outsider, reason } = ids.outsiderPick
  if (!outsider) {
    record(4, 'um usuario de outro escritorio ve zero do novo', 'skip', reason)
    return results
  }

  const strangerLogin = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: strangerSession, error: strangerError } =
    await strangerLogin.auth.signInWithPassword({
      email: outsider.email,
      password: outsider.password,
    })
  if (strangerError || !strangerSession?.session) {
    // Senha de seed desatualizada e incapacidade de conferir, nao vazamento.
    record(
      4,
      'um usuario de outro escritorio ve zero do novo',
      'skip',
      `nao consegui entrar com a conta de teste ${outsider.email} (${outsider.file} ` +
        `desatualizado?): ${strangerError?.message ?? 'sem sessao'}`,
    )
    return results
  }

  const stranger = clientFor(url, anonKey, strangerSession.session.access_token)
  const { data: strangerTenants } = await stranger.from('tenants').select('id, slug')
  const sawNewTenant = (strangerTenants ?? []).some((t) => t.id === ids.tenantId)
  const { count: sawCollaborators } = await stranger
    .from('collaborators')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', ids.tenantId)
  const ok = !sawNewTenant && (sawCollaborators ?? 0) === 0
  record(
    4,
    `um usuario de teste de outro escritorio (${outsider.tenantSlug}) ve zero do novo`,
    ok ? 'ok' : 'fail',
    ok
      ? 'tenants e collaborators do escritorio novo: 0 linhas'
      : `VAZOU: tenant=${sawNewTenant ? 'visivel' : 'oculto'}, collaborators=${sawCollaborators}`,
  )

  return results
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

  await recoverInterrupted(db, url, args)

  const { tenants, leafKeys, warnings } = await preflight(db, input)

  if (args['sim-criar-escritorio-de-verdade'] === true) {
    console.log('\n  --sim-criar-escritorio-de-verdade: seguindo sem confirmacao digitada.')
    console.log(`  projeto: ${url}   escritorio: ${input.name} (${input.slug})`)
    for (const w of warnings) console.log(`\n  AVISO: ${w}`)
    console.log('')
  } else {
    await confirm(url, input, warnings)
  }

  // Nao ha mais pergunta a fazer. Sem isto, a interface compartilhada segue
  // aberta e o processo nao termina depois da conferencia.
  closePrompts()

  console.log('')
  const ids = await create(db, url, input, leafKeys)

  const file = writeCredentials(url, input, ids.password)
  console.log(`\n  Senha do Diretor em ${rel(file)} (modo 0600).`)
  console.log('  Entregar por canal seguro. Ela nao aparece no terminal de proposito.')

  ids.otherTenants = tenants
  ids.outsiderPick = await pickTestOutsider(db, tenants, ids.tenantId, url)

  const results = await verify(db, url, anonKey, input, ids)
  const failed = results.filter((r) => r.status === 'fail')
  const skipped = results.filter((r) => r.status === 'skip')

  if (failed.length > 0) {
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

  console.log(`\n  Escritorio "${input.name}" (${input.slug}) criado.`)

  if (skipped.length > 0) {
    // Assercao pulada nao derruba o comando, mas tambem nao passa despercebida:
    // o escritorio esta de pe e o que NAO foi provado fica dito, com o motivo.
    console.log('\n' + '-'.repeat(74))
    console.log('  CONFERENCIA INCOMPLETA — o que nao foi provado, e por que')
    console.log('-'.repeat(74))
    for (const s of skipped) console.log(`  ${s.n}. ${s.description}\n     ${s.detail}`)
    console.log(
      '\n  Isto nao e falha: e ausencia de prova. As assercoes que rodaram passaram.',
    )
  } else {
    console.log('  Conferido: as quatro assercoes de isolamento passaram.')
  }

  // Este comando cria UM Diretor de proposito: e o minimo para destravar o ovo
  // e a galinha, e nao cabe a ele inventar o resto da equipe. Mas um escritorio
  // com um Diretor so fica sem quem administre no dia em que ele entrar de
  // ferias — auth_collaborator_id() devolve null para quem nao esta active, e
  // Diretor e o unico papel que gerencia equipe. E item obrigatorio em
  // docs/ARCHITECTURE.md, e o unico que este comando nao tem como cumprir.
  console.log(
    `\n  PROXIMO PASSO: o escritorio tem UM Diretor. Diretor e o unico papel que\n` +
      `  gerencia equipe, e Diretor em Ferias ou Afastado nao le nada — com um so,\n` +
      `  o escritorio fica sem quem administre no primeiro afastamento. Cadastre o\n` +
      `  segundo pela tela de Controle de Acesso, com este Diretor logado.\n`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
