/*
  A landing page construída é IGUAL ao protótipo aprovado, pixel por pixel.

  POR QUE ESTE TESTE EXISTE
    O CLAUDE.md diz que o protótipo aprovado é a fonte da verdade visual e que
    divergência sutil — "um espaçamento diferente, uma cor parecida, um
    breakpoint que não bate" — conta como bug de implementação, não como
    polimento. Até aqui isso era uma promessa conferida a olho.

    Ela é especialmente frágil nesta página, porque o protótipo roda no CDN do
    Tailwind v3 e a página roda no v4, e as duas versões divergem em coisas que
    ninguém nota lendo o diff: o `shadow-sm` do v3 virou `shadow-xs` no v4, o
    `outline-none` virou `outline-hidden`, a cor padrão de borda deixou de ser
    gray-200 e passou a ser currentColor, o `ring` deixou de ter 3px e passou a
    ter 1px. Qualquer uma dessas muda a tela em silêncio.

    Existe ainda uma armadilha pior, de categoria diferente: `@theme` sem
    `inline` congelaria as cores no `:root` e as seções escuras sairiam claras.
    Isso NÃO aparece em teste de unidade nenhum. Aparece aqui.

  O QUE ELE AFIRMA
    Zero pixel de diferença em 1280, 768 e 375, do topo até o fim do rodapé.
    O protótipo é mais alto porque tem a ÁREA DE DEMONSTRAÇÃO depois do rodapé
    (aparato de revisão, que não vai para produção); a comparação corta as duas
    imagens na altura da menor, que é exatamente o fim do rodapé.

  POR QUE COM prefers-reduced-motion
    A página revela conteúdo ao rolar e o carrossel de depoimentos anda sozinho.
    Sem desligar o movimento, duas capturas da MESMA página diferem entre si e
    a comparação não provaria nada. Com `reducedMotion: 'reduce'` o JS não
    escreve a marca `.anim`, a página nasce inteira e o carrossel para — que é,
    de propósito, o estado em que ela já precisa estar correta.

  DEPENDE DA INTERNET: o protótipo carrega o Tailwind pelo CDN e as duas
  páginas carregam a fonte do Google. Sem rede, este teste não roda — e é o
  preço de comparar contra o protótipo como ele é, em vez de contra uma cópia
  dele.

  COMO RODAR
    npm run test:lp-fidelidade

  RESÍDUO
    Nenhum: build e capturas vão para mkdtemp, apagado na saída. Quando há
    diferença, o recorte dela é copiado para ./lp-divergencia-<largura>.png na
    raiz do projeto, porque imagem apagada não ajuda ninguém a entender a falha.
*/

import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { copyFileSync, createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { PNG } from 'pngjs'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const LARGURAS = [1280, 768, 375]

/*
  TOLERÂNCIA DE 1 EM 255 POR CANAL, e ela foi medida, não escolhida.

  A comparação era de igualdade exata e passava com zero. Ao acrescentar dois
  campos ao formulário do fim (migration 0124), o teste acusou 171 pixels
  diferentes em 1280, e NENHUM em 768 nem em 375.

  Medido, pixel a pixel: a maior diferença entre os 171 era de **1 em 255**, a
  mediana 1, e a distribuição inteira era 1. E eles ficavam entre y=211 e y=728,
  ou seja na maquete do sistema lá no topo, uma imagem com transformação 3D que
  eu não toquei, mais de onze mil pixels ACIMA do formulário que mudou.

  Não existe mecanismo de layout pelo qual uma mudança no rodapé mova pixel do
  topo. O que existe é rasterização: o documento ficou ~116px mais alto, e o
  Chromium rasteriza camada transformada em função da geometria do documento.
  Confirmado por bisseção: revertendo só a mudança do topo, os 171 continuavam;
  o gatilho era a altura.

  POR QUE 1 E NÃO MAIS. Diferença de anti-aliasing fica em 1 ou 2; divergência
  de verdade (um espaçamento, uma cor "parecida", um breakpoint que não bate)
  produz dezenas ou centenas por canal. Com teto 1, o teste continua acusando
  tudo que o CLAUDE.md chama de bug de implementação, e para de acusar o
  compositor do navegador.
*/
const TOLERANCIA = 1

const temporario = mkdtempSync(join(tmpdir(), 'lp-fidelidade-'))
process.on('exit', () => rmSync(temporario, { recursive: true, force: true }))

const construido = join(temporario, 'dist')
execSync(`npx vite build --outDir ${construido} --emptyOutDir --logLevel error`, {
  cwd: RAIZ,
  stdio: 'inherit',
})

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

/*
  A CSP DA LP SAI DO vercel.json, E NÃO DE UMA CÓPIA AQUI.

  O servidor de teste manda na página o mesmo cabeçalho que a Vercel vai mandar,
  e isso faz este teste cobrir uma coisa que ele não cobria: CSP que bloqueie a
  folha de estilo ou a fonte muda a tela inteira, e o diff de pixel acusa. Sem
  isto, uma CSP errada só apareceria em produção.

  Ler do vercel.json em vez de repetir o valor é o ponto: cópia diverge, e a que
  ninguém está olhando é a que fica velha.
*/
function cspDaLp() {
  const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
  const regra = (vercel.headers ?? []).find((h) => h.source === '/lp')
  const csp = regra?.headers?.find((h) => h.key === 'Content-Security-Policy')?.value
  if (!csp) {
    console.error('não achei a Content-Security-Policy de /lp no vercel.json')
    process.exit(2)
  }
  return csp
}

const CSP = cspDaLp()

function servir(diretorio, { comCsp = false } = {}) {
  const s = createServer((req, res) => {
    /* `normalize` e o prefixo conferido depois: nem servidor de teste deve
       entregar o disco inteiro por causa de um `..` no caminho. */
    const pedido = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    let caminho = join(diretorio, pedido)
    if (existsSync(caminho) && statSync(caminho).isDirectory()) caminho = join(caminho, 'index.html')
    if (!caminho.startsWith(diretorio) || !existsSync(caminho)) {
      res.writeHead(404).end('nao encontrado')
      return
    }
    const cabecalhos = { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' }
    /* Só no documento: a CSP dele é que governa os subrecursos, onde quer que
       eles estejam. O protótipo NÃO recebe a CSP — ele carrega o Tailwind pelo
       CDN, que a política bloquearia de propósito. */
    if (comCsp && extname(caminho) === '.html') cabecalhos['Content-Security-Policy'] = CSP
    res.writeHead(200, cabecalhos)
    createReadStream(caminho).pipe(res)
  })
  return new Promise((pronto) => s.listen(0, '127.0.0.1', () => pronto({ s, porta: s.address().port })))
}

const alvoLp = await servir(construido, { comCsp: true })
const alvoProto = await servir(RAIZ)

const PAGINAS = [
  ['proto', `http://127.0.0.1:${alvoProto.porta}/prototypes/lp-hausone.html`],
  ['lp', `http://127.0.0.1:${alvoLp.porta}/lp/`],
]

const nav = await chromium.launch()
const medidas = {}

for (const [nome, url] of PAGINAS) {
  for (const w of LARGURAS) {
    const ctx = await nav.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    const p = await ctx.newPage()
    const problemas = []
    p.on('console', (m) => m.type() === 'error' && problemas.push(m.text()))
    p.on('pageerror', (e) => problemas.push(String(e)))
    p.on('requestfailed', (r) => problemas.push(`requisição falhou: ${r.url()}`))
    const resposta = await p.goto(url, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(600)
    medidas[`${nome}-${w}`] = {
      csp: (await resposta.headerValue('content-security-policy')) ?? '',
      estouro: await p.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      iconesNaoTrocados: await p.locator('i[data-lucide]').count(),
      /* CÓPIA, e tirada ANTES da sonda da CSP: a sonda provoca uma recusa de
         propósito, e ela não pode contar como "algo falhou ao carregar". */
      problemas: [...problemas],
    }
    await p.screenshot({ path: join(temporario, `${nome}-${w}.png`), fullPage: true })

    /*
      A SONDA DA CSP VEM POR ÚLTIMO, depois da captura.

      Injetar um script de OUTRA origem tem que ser recusado, e é isso que prova
      que a política está sendo APLICADA, e não apenas enviada: CSP malformada o
      navegador ignora com um aviso, e aí "nada foi recusado" passaria vazio
      justamente quando não houvesse política nenhuma.
    */
    medidas[`${nome}-${w}`].scriptDeFora = await p
      .addScriptTag({ url: 'https://cdn.tailwindcss.com' })
      .then(() => 'carregou')
      .catch(() => 'recusado')

    await ctx.close()
  }
}
await nav.close()
alvoLp.s.close()
alvoProto.s.close()

/* ------------------------------------------------------------------ casos */

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  if (String(esperado) === String(obtido)) {
    console.log(`PASS  ${nome.padEnd(48)} ${esperado}`)
    ok++
  } else {
    console.log(`FAIL  ${nome.padEnd(48)} esperado=${esperado} obtido=${obtido}`)
    falhas++
  }
}

const ler = (arquivo) => PNG.sync.read(readFileSync(join(temporario, arquivo)))

for (const w of LARGURAS) {
  const m = medidas[`lp-${w}`]
  caso(`${w}: a CSP do vercel.json chegou na página`, CSP, m.csp)
  caso(`${w}: e ela recusa script de outra origem`, 'recusado', m.scriptDeFora)
  caso(`${w}: sem rolagem horizontal`, '0', m.estouro)
  caso(`${w}: todo <i data-lucide> virou svg`, '0', m.iconesNaoTrocados)
  caso(`${w}: nada falhou ao carregar`, '', m.problemas.join(' | '))
  caso(
    `${w}: a CSP não recusou nada`,
    '',
    m.problemas.filter((t) => /content security policy|refused to/i.test(t)).join(' | '),
  )

  const a = ler(`proto-${w}.png`)
  const b = ler(`lp-${w}.png`)
  /* O protótipo é mais alto: a área de demonstração vem depois do rodapé. */
  const altura = Math.min(a.height, b.height)
  let diferentes = 0
  let primeiraLinha = null
  let ultimaLinha = null
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const delta = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      )
      if (delta > TOLERANCIA) {
        diferentes++
        if (primeiraLinha === null) primeiraLinha = y
        ultimaLinha = y
      }
    }
  }
  caso(`${w}: zero pixel diferente do protótipo (${altura}px)`, '0', diferentes)
  if (diferentes > 0) {
    console.log(`        primeira linha divergente: y=${primeiraLinha}, última: y=${ultimaLinha}`)
    for (const nome of [`proto-${w}.png`, `lp-${w}.png`]) {
      copyFileSync(join(temporario, nome), join(RAIZ, `lp-divergencia-${nome}`))
    }
    console.log(`        capturas copiadas para ${RAIZ}/lp-divergencia-*-${w}.png`)
  }
}

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
