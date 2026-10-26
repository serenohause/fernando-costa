/*
  O formulário da landing page, num navegador de verdade.

  O QUE ELE PROVA, E QUE OS OUTROS DOIS NÃO ALCANÇAM
    supabase/tests/leads.sql prova o banco; supabase/tests/capture-lead-http.sh
    prova a porta pública pela HTTP. Falta a metade que só existe na tela:

      - o caminho feliz dos DOIS formulários, incluindo que o painel de sucesso
        recebe o foco (quem usa leitor de tela precisa saber que enviou);
      - cada formulário manda o próprio `placement`, e só o do CTA manda o nome
        do escritório;
      - as TRÊS recusas têm texto diferente e certo: e-mail inválido (decidido
        no navegador, sem ida à rede), limite de requisição (texto do servidor,
        não "erro interno") e rede caída (fala de conexão, não de campo);
      - a armadilha de robô está fora da tela, fora da ordem de tabulação e
        escondida do leitor de tela — e, preenchida, a pessoa vê sucesso
        enquanto nada é gravado;
      - zero erro no console.

  COMO RODAR
    supabase start
    supabase functions serve capture-lead     # em outro terminal
    npm run test:lp

    O script cuida do resto: lê a URL do stack local, constrói a LP apontada
    para ela num diretório temporário e serve esse diretório numa porta livre.

  POR QUE ELE CONSTRÓI A PÁGINA EM VEZ DE USAR `npm run dev`
    O `import.meta.env.VITE_SUPABASE_URL` é CONGELADO em tempo de build. Testar
    pelo dev server provaria o comportamento de um artefato que não é o que vai
    para produção; testar o build prova o artefato.

  RESÍDUO
    Nenhum: tudo usa o domínio @navegador.test e é apagado no fim. O diretório
    construído fica em mkdtemp e é removido na saída.
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

function sair(mensagem) {
  console.error(mensagem)
  process.exit(2)
}

try {
  execFileSync('docker', ['inspect', CONTAINER], { stdio: 'ignore' })
} catch {
  sair(`container ${CONTAINER} não está de pé. Rode: supabase start`)
}

const API_URL = JSON.parse(
  execSync('supabase status -o json', { cwd: RAIZ }).toString(),
).API_URL

const URL_FUNCAO = `${API_URL}/functions/v1/capture-lead`

const ping = await fetch(URL_FUNCAO, { method: 'OPTIONS' }).catch(() => null)
if (!ping) sair(`capture-lead não responde em ${URL_FUNCAO}. Rode: supabase functions serve capture-lead`)

const DB = (sql) =>
  execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql])
    .toString()
    .trim()

/* --------------------------------------------------------------- a página */

const saida = mkdtempSync(join(tmpdir(), 'lp-teste-'))
process.on('exit', () => rmSync(saida, { recursive: true, force: true }))

execSync(`npx vite build --outDir ${saida} --emptyOutDir --logLevel error`, {
  cwd: RAIZ,
  env: { ...process.env, VITE_SUPABASE_URL: API_URL },
  stdio: 'inherit',
})

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

const servidor = createServer((req, res) => {
  /* `normalize` antes de juntar: sem isso um `..` no caminho sairia do
     diretório servido. É servidor de teste, e nem servidor de teste deve
     entregar o disco inteiro. */
  const pedido = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let caminho = join(saida, pedido)
  if (existsSync(caminho) && statSync(caminho).isDirectory()) caminho = join(caminho, 'index.html')
  if (!caminho.startsWith(saida) || !existsSync(caminho)) {
    res.writeHead(404).end('nao encontrado')
    return
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' })
  createReadStream(caminho).pipe(res)
})

await new Promise((pronto) => servidor.listen(0, '127.0.0.1', pronto))
const BASE = `http://127.0.0.1:${servidor.address().port}/lp/`

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

const limpar = () => {
  DB("delete from public.product_leads where email like '%@navegador.test';")
  DB("delete from public.public_endpoint_hits where scope = 'capture-lead';")
}

limpar()

const nav = await chromium.launch()
const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  const erros = []
  p.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  p.on('pageerror', (e) => erros.push(String(e)))
  await p.goto(BASE, { waitUntil: 'networkidle' })
  return { ctx, p, erros }
}

/* 1. Caminho feliz pelo formulário do hero. */
{
  const { ctx, p, erros } = await abrir()
  await p.fill('#email-hero', 'hero@navegador.test')
  await p.click('#hero-form button[type=submit]')
  await p.waitForSelector('#hero-form [data-form-sucesso]:not([hidden])', { timeout: 15000 })
  caso('hero: painel de sucesso aparece', 'true', await p.isVisible('#hero-form [data-form-sucesso]'))
  caso('hero: entrada desaparece', 'false', await p.isVisible('#hero-form [data-form-entrada]'))
  /* O foco é o que avisa quem usa leitor de tela que o envio deu certo. */
  caso(
    'hero: o foco vai para o painel de sucesso',
    'true',
    await p.evaluate(() => document.activeElement?.hasAttribute('data-form-sucesso')),
  )
  caso(
    'hero: gravou com o bloco e a origem certos',
    'hero|lp-hausone|new',
    DB("select placement||'|'||source||'|'||status from public.product_leads where email='hero@navegador.test';"),
  )
  caso('hero: zero erro no console', '', erros.join(' | '))
  await ctx.close()
}

/* 2. O CTA é o único com campo de escritório, e manda o próprio bloco. */
{
  const { ctx, p } = await abrir()
  await p.fill('#email-cta', 'cta@navegador.test')
  await p.fill('#escritorio-cta', 'Escritorio do Teste')
  await p.click('#cta-form button[type=submit]')
  await p.waitForSelector('#cta-form [data-form-sucesso]:not([hidden])', { timeout: 15000 })
  caso(
    'cta: gravou o bloco e o nome do escritório',
    'cta-final|Escritorio do Teste',
    DB("select placement||'|'||office_name from public.product_leads where email='cta@navegador.test';"),
  )
  await ctx.close()
}

/* 3. E-mail inválido é decidido no navegador e não chega a sair. */
{
  const { ctx, p } = await abrir()
  await p.fill('#email-hero', 'nao-e-email')
  await p.click('#hero-form button[type=submit]')
  await p.waitForSelector('#hero-form [data-erro]:not(.hidden)', { timeout: 10000 })
  caso(
    'inválido: o texto é o de e-mail',
    'Digite um e-mail válido.',
    (await p.textContent('#hero-form [data-erro-texto]')).trim(),
  )
  caso('inválido: o campo é marcado', 'true', await p.getAttribute('#email-hero', 'aria-invalid'))
  caso(
    'inválido: nada foi gravado',
    '0',
    DB("select count(*) from public.product_leads where email like 'nao-e-email%';"),
  )
  await p.fill('#email-hero', 'corrigido@navegador.test')
  caso(
    'corrigir o campo apaga o erro sozinho',
    'true',
    await p.evaluate(() => document.querySelector('#hero-form [data-erro]').classList.contains('hidden')),
  )
  await ctx.close()
}

/* 4. A armadilha de robô.

   NÃO use `isVisible` aqui: para o Playwright, "visível" é ter caixa não-vazia
   e `visibility` diferente de hidden — e o campo tem caixa. O que importa é
   ONDE essa caixa está, e ela está 9999px à esquerda, dentro de um pai de 1x1
   com overflow hidden, numa página sem rolagem horizontal. */
{
  const { ctx, p } = await abrir()
  const box = await p.locator('#observacao-hero').boundingBox()
  caso('armadilha: a caixa está inteira fora da tela', 'true', box.x + box.width <= 0)
  caso(
    'armadilha: a página não rola para alcançá-la',
    '0',
    await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  )
  caso('armadilha: fora da ordem de tabulação', '-1', await p.getAttribute('#observacao-hero', 'tabindex'))
  caso(
    'armadilha: escondida do leitor de tela',
    'true',
    await p.evaluate(() => !!document.querySelector('#observacao-hero').closest('[aria-hidden="true"]')),
  )

  await p.evaluate(() => {
    document.querySelector('#observacao-hero').value = 'http://spam.example'
  })
  await p.fill('#email-hero', 'robo@navegador.test')
  await p.click('#hero-form button[type=submit]')
  await p.waitForSelector('#hero-form [data-form-sucesso]:not([hidden])', { timeout: 15000 })
  caso('armadilha: a pessoa vê sucesso', 'true', await p.isVisible('#hero-form [data-form-sucesso]'))
  caso(
    'armadilha: e nada é gravado',
    '0',
    DB("select count(*) from public.product_leads where email='robo@navegador.test';"),
  )
  await ctx.close()
}

/* 5. Limite de requisição: a tela diz o que o servidor disse. */
{
  DB("delete from public.public_endpoint_hits where scope = 'capture-lead';")
  const { ctx, p } = await abrir()
  for (let i = 1; i <= 10; i++) {
    await p.evaluate(
      async ([url, n]) => {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `teto${n}@navegador.test` }),
        })
      },
      [URL_FUNCAO, i],
    )
  }
  await p.fill('#email-hero', 'passou-do-teto@navegador.test')
  await p.click('#hero-form button[type=submit]')
  await p.waitForSelector('#hero-form [data-erro]:not(.hidden)', { timeout: 15000 })
  caso(
    'limite: a tela mostra o texto do servidor',
    'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
    (await p.textContent('#hero-form [data-erro-texto]')).trim(),
  )
  /* Recusa não queima o formulário: a pessoa precisa poder tentar de novo. */
  caso('limite: o formulário continua utilizável', 'true', await p.isVisible('#hero-form [data-form-entrada]'))
  await ctx.close()
}

/* 6. Rede caída não é culpa de quem digitou. */
{
  const { ctx, p } = await abrir()
  await p.route('**/functions/v1/capture-lead', (rota) => rota.abort('failed'))
  await p.fill('#email-hero', 'offline@navegador.test')
  await p.click('#hero-form button[type=submit]')
  await p.waitForSelector('#hero-form [data-erro]:not(.hidden)', { timeout: 15000 })
  caso(
    'rede caída: o texto fala de conexão',
    'Não foi possível enviar agora. Confira sua conexão e tente de novo.',
    (await p.textContent('#hero-form [data-erro-texto]')).trim(),
  )
  caso('rede caída: não mostra sucesso', 'false', await p.isVisible('#hero-form [data-form-sucesso]'))
  await ctx.close()
}

await nav.close()
servidor.close()
limpar()

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
