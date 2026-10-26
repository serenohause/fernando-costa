/*
  O painel da fila de leads, logado de verdade, num navegador.

  O QUE ELE PROVA, E QUE NENHUM DOS OUTROS ALCANÇA
    supabase/tests/leads.sql prova as policies por dentro do banco, com papel e
    claim simulados. Este prova a corrente inteira: login real, Auth Hook,
    JWT assinado, PostgREST, GRANT, policy, React Query, tela. Um erro de GRANT,
    de hook desligado ou de `enabled` do React Query some no teste SQL e aparece
    aqui, pelo mesmo motivo que o módulo 1 tem `rls-isolation.sql` e
    `rls-isolation.mjs` lado a lado.

    E prova as duas pontas do acesso com o MESMO navegador e a MESMA tela:
      - quem está em platform_admins lê a fila, muda a situação e anota;
      - quem é Diretora do escritório, e só isso, abre a URL e não vê lead
        nenhum. Essa é a afirmação mais importante do arquivo, porque a fila
        guarda e-mail de gente que não é cliente de ninguém.

    Mais a regra de `contacted_at` acontecendo de ponta a ponta: mudar para
    Contatado grava a data, voltar para Novo apaga. É a que, se estiver errada,
    devolve 23514 do banco na cara de quem só mexeu num seletor.

  COMO RODAR
    supabase start
    npm run test:leads-painel

  RESÍDUO
    Nenhum. Tudo nasce com o slug `leads-painel` e o domínio
    @painel.test, e é apagado no fim, inclusive os dois usuários de auth.

  CUIDADO
    Ele grava no banco apontado por `supabase status`, que é o LOCAL. Não aponte
    para projeto hospedado: ele cria e apaga usuário de autenticação.
*/

import { chromium } from 'playwright'
import { execFileSync, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const PROJETO = execSync(`grep -E '^project_id' ${RAIZ}/supabase/config.toml | head -1 | cut -d'"' -f2`)
  .toString()
  .trim()
const CONTAINER = `supabase_db_${PROJETO}`
const SENHA = 'painel-de-teste-9271'

function sair(mensagem) {
  console.error(mensagem)
  process.exit(2)
}

try {
  execFileSync('docker', ['inspect', CONTAINER], { stdio: 'ignore' })
} catch {
  sair(`container ${CONTAINER} não está de pé. Rode: supabase start`)
}

const estado = JSON.parse(execSync('supabase status -o json', { cwd: RAIZ }).toString())
const API_URL = estado.API_URL
const SERVICE_KEY = estado.SERVICE_ROLE_KEY

const DB = (sql) =>
  execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql])
    .toString()
    .trim()

/* ------------------------------------------------------------- as fixtures */

const ATORES = [
  { chave: 'admin', email: 'admin@painel.test', plataforma: true },
  { chave: 'diretora', email: 'diretora@painel.test', plataforma: false },
]

/*
  Apagar o escritório de teste cascateia até `kanban_columns`, e lá existe um
  gatilho que RECUSA excluir as etapas "Nao iniciado" e "Finalizado" (migration
  0094). Ele está certo: sem aquelas duas linhas, projeto sem tarefa e projeto
  concluído ficariam sem etapa no quadro. Só que ele dispara em cascata também,
  e é por isso que apagar o escritório inteiro precisa desligá-lo.

  TUDO NUM `-c` SÓ, de propósito: o psql manda a sequência como uma única
  consulta simples, e o Postgres a envolve numa transação implícita. Se qualquer
  linha falhar, o `disable trigger` volta atrás junto — e não existe caminho em
  que a suíte morra no meio e deixe a proteção desligada.
*/
function limpar() {
  DB(`
    alter table public.kanban_columns disable trigger kanban_columns_protect_structural;
    delete from public.product_leads where email like '%@painel.test';
    delete from public.collaborators where email like '%@painel.test';
    delete from public.tenants where slug = 'leads-painel';
    delete from auth.users where email like '%@painel.test';
    alter table public.kanban_columns enable trigger kanban_columns_protect_structural;
  `)
}

async function criarUsuario(email) {
  const resposta = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: SENHA, email_confirm: true }),
  })
  if (!resposta.ok) sair(`não foi possível criar ${email}: ${resposta.status} ${await resposta.text()}`)
  return (await resposta.json()).id
}

limpar()

const ids = {}
for (const ator of ATORES) ids[ator.chave] = await criarUsuario(ator.email)

/*
  OS DOIS ATORES SÃO DE ESPÉCIES DIFERENTES, e é isso que o teste mede.

  A Diretora é colaboradora ATIVA de um escritório, com tudo que isso dá:
  tenant_users, linha em collaborators, função de Diretor. O que ela NÃO tem é
  linha em platform_admins.

  O admin da plataforma é o oposto: tem a linha em platform_admins e NADA mais.
  Não é colaborador, não tem tenant, não tem claim de escritório no JWT. É o
  único ator do sistema que existe fora de escritório, e o teste prova que a
  tela funciona para ele exatamente por isso. Antes de `/Leads` sair de dentro
  do AppLayout, este ator não conseguia nem abrir a página: o layout mostrava
  "Acesso Pendente" para quem não é colaborador ativo.

  O par cobre as duas afirmações que importam: acesso à fila NÃO depende de
  escritório, e pertencer a um escritório NÃO dá acesso à fila.
*/
DB(`
  insert into public.tenants (id, name, slug)
  values ('fcfcfcfc-0000-4000-8000-00000000000a', 'Painel de Teste', 'leads-painel');

  insert into public.tenant_users (tenant_id, user_id, role) values
    ('fcfcfcfc-0000-4000-8000-00000000000a', '${ids.diretora}', 'owner');

  insert into public.collaborators (tenant_id, user_id, name, email, role, area, status) values
    ('fcfcfcfc-0000-4000-8000-00000000000a', '${ids.diretora}', 'Diretora do Escritorio',
     'diretora@painel.test', 'director', 'administrative', 'active');

  insert into public.platform_admins (user_id, note) values ('${ids.admin}', 'suite do painel');
`)

/*
  Três leads, pela MESMA função que a edge function chama.

  O `created_at` é acertado depois, e isso não é capricho: `now()` é o instante
  da TRANSAÇÃO, então os três nasceriam com o mesmo carimbo e a ordem entre eles
  ficaria indefinida — um teste de ordenação que passa por sorte. Com três dias
  distintos, "o mais novo vem primeiro" passa a afirmar alguma coisa.
*/
DB(`
  select public.capture_product_lead('ana@painel.test', 'Ana Prado', 'Prado Arquitetura', null, 'lp-hausone', 'hero');
  select public.capture_product_lead('bruno@painel.test', null, null, null, 'lp-hausone', 'cta-final');
  select public.capture_product_lead('carla@painel.test', null, 'Conceicao e Associados', null, 'lp-hausone', 'hero');

  update public.product_leads set created_at = '2026-10-20 10:00:00+00' where email = 'ana@painel.test';
  update public.product_leads set created_at = '2026-10-21 10:00:00+00' where email = 'bruno@painel.test';
  update public.product_leads set created_at = '2026-10-22 10:00:00+00' where email = 'carla@painel.test';
`)

/* ---------------------------------------------------------------- o app */

const saida = mkdtempSync(join(tmpdir(), 'leads-painel-'))
process.on('exit', () => rmSync(saida, { recursive: true, force: true }))

execSync(`npx vite build --outDir ${saida} --emptyOutDir --logLevel error`, {
  cwd: RAIZ,
  env: { ...process.env, VITE_SUPABASE_URL: API_URL, VITE_SUPABASE_ANON_KEY: estado.ANON_KEY },
  stdio: 'inherit',
})

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const servidor = createServer((req, res) => {
  const pedido = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let caminho = join(saida, pedido)
  if (existsSync(caminho) && statSync(caminho).isDirectory()) caminho = join(caminho, 'index.html')
  /* Rota desconhecida cai no index.html, como o rewrite do vercel.json faz. */
  if (!caminho.startsWith(saida) || !existsSync(caminho)) caminho = join(saida, 'index.html')
  res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' })
  createReadStream(caminho).pipe(res)
})
await new Promise((pronto) => servidor.listen(0, '127.0.0.1', pronto))
const BASE = `http://127.0.0.1:${servidor.address().port}`

/* ---------------------------------------------------------------- os casos */

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  if (String(esperado) === String(obtido)) {
    console.log(`PASS  ${nome.padEnd(52)} ${esperado}`)
    ok++
  } else {
    console.log(`FAIL  ${nome.padEnd(52)} esperado=${esperado} obtido=${obtido}`)
    falhas++
  }
}

const nav = await chromium.launch()

async function entrar(email) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } })
  const p = await ctx.newPage()
  const erros = []
  p.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  p.on('pageerror', (e) => erros.push('pageerror: ' + String(e)))
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#password', SENHA)
  await p.click('button[type=submit]')
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
  return { ctx, p, erros }
}

/* 1. O admin da plataforma vê a fila e trabalha nela, SEM ser de escritório. */
{
  const { ctx, p, erros } = await entrar('admin@painel.test')
  await p.goto(`${BASE}/Leads`, { waitUntil: 'networkidle' })
  await p.waitForSelector('table tbody tr', { timeout: 20000 })

  /* A afirmação que o AppLayout impedia: nenhuma linha em collaborators, e a
     tela abre. Sem isto, bastaria alguém devolver a rota para dentro do
     AppLayout para a conta da equipe do produto voltar a precisar de um
     escritório, e o teste não acusaria. */
  caso(
    'admin: não é colaborador de escritório nenhum',
    '0',
    DB("select count(*) from public.collaborators where email = 'admin@painel.test';"),
  )
  caso('admin: e a casca não é a do backoffice', '0', await p.locator('aside').count())

  /*
    A busca recorta a fila nos três do teste, e é por ela que as contagens
    passam. Contagem absoluta sobre tabela de negócio passa hoje e falha no dia
    em que houver lead de verdade, longe da causa — a convenção já está escrita
    em supabase/tests/pattern-invariants.sql.
  */
  await p.fill('input[aria-label="Buscar lead"]', 'painel.test')
  await p.waitForTimeout(300)
  caso('admin: a fila mostra os três leads do teste', '3', await p.locator('table tbody tr').count())
  caso('admin: o mais novo vem primeiro', 'carla@painel.test',
    (await p.locator('table tbody tr').first().locator('td').nth(1).innerText()).split('\n')[0].trim())

  /* A busca varre e-mail, nome e escritório, sem acento. */
  await p.fill('input[aria-label="Buscar lead"]', 'conceição')
  await p.waitForTimeout(300)
  caso('admin: busca com acento acha o texto sem acento', '1',
    await p.locator('table tbody tr').count())

  /* O contador de "Novo" conta a fila INTEIRA, e não o recorte: ele é o que faz
     alguém perceber que há lead esperando resposta mesmo com um filtro ligado.
     Por isso ele é comparado com o banco, e não com um número fixo. */
  caso('admin: o contador de Novo bate com o banco',
    DB("select count(*) from public.product_leads where status = 'new';"),
    await p.locator('button[aria-pressed]').first().locator('p').first().innerText())

  await p.fill('input[aria-label="Buscar lead"]', 'painel.test')
  await p.waitForTimeout(300)

  /* Mudar a situação: a data de contato nasce AQUI, e não num campo. */
  const linhaAna = p.locator('table tbody tr', { hasText: 'ana@painel.test' })
  await linhaAna.locator('button[role=combobox]').click()
  await p.locator('[role=option]', { hasText: 'Contatado' }).click()
  await p.waitForSelector('text=Lead marcado como Contatado', { timeout: 15000 })
  caso('admin: gravou a situação e a data de contato juntas', 'contacted|true',
    DB("select status||'|'||(contacted_at is not null) from public.product_leads where email='ana@painel.test';"))

  /* E voltar para Novo precisa APAGAR a data, senão o check recusa com 23514. */
  await linhaAna.locator('button[role=combobox]').click()
  await p.locator('[role=option]', { hasText: 'Novo' }).click()
  await p.waitForSelector('text=Lead marcado como Novo', { timeout: 15000 })
  caso('admin: voltar para Novo apaga a data', 'new|false',
    DB("select status||'|'||(contacted_at is not null) from public.product_leads where email='ana@painel.test';"))

  /* A anotação. */
  await linhaAna.getByRole('button', { name: 'Anotar' }).click()
  await p.fill('textarea', 'ligou, quer ver o financeiro')
  await p.getByRole('button', { name: 'Salvar' }).click()
  await p.waitForSelector('text=Anotação salva', { timeout: 15000 })
  caso('admin: gravou a anotação', 'ligou, quer ver o financeiro',
    DB("select notes from public.product_leads where email='ana@painel.test';"))
  /* O rótulo só troca depois que a invalidação do React Query volta com a
     linha nova — esperar pelo botão, e não medir no instante do toast. */
  await linhaAna.getByRole('button', { name: 'Ver nota' }).waitFor({ timeout: 15000 })
  caso('admin: o botão passa a oferecer ver a nota', '1',
    await linhaAna.getByRole('button', { name: 'Ver nota' }).count())

  caso('admin: zero erro no console', '', erros.join(' | '))
  await ctx.close()
}

/*
  2. A Diretora do escritório. MESMA função, MESMO escritório, MESMA tela: a
     única diferença é não estar em platform_admins.
*/
{
  const { ctx, p, erros } = await entrar('diretora@painel.test')
  await p.goto(`${BASE}/Leads`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)

  /* Ela É colaboradora ativa, e isso continua não dando acesso à fila. */
  caso(
    'diretora: é colaboradora ativa de um escritório',
    '1',
    DB("select count(*) from public.collaborators where email = 'diretora@painel.test' and status = 'active';"),
  )
  caso('diretora: não vê tabela nenhuma', '0', await p.locator('table').count())
  caso('diretora: a tela diz que não é dela', '1',
    await p.getByText('Esta página não é do seu escritório').count())
  /* A prova de que nenhum e-mail chegou ao navegador dela: nem no DOM. */
  const conteudo = await p.content()
  caso('diretora: nenhum e-mail de lead chegou ao navegador', 'false',
    conteudo.includes('ana@painel.test') || conteudo.includes('carla@painel.test'))
  caso('diretora: zero erro no console', '', erros.join(' | '))
  await ctx.close()
}

await nav.close()
servidor.close()
limpar()

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
