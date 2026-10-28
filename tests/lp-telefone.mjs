/*
  A MÁSCARA DE TELEFONE DA LANDING PAGE É A MESMA DO SISTEMA.

  COMO RODAR
    npm run test:lp-telefone

  POR QUE ESTE ARQUIVO EXISTE
    A LP é deliberadamente separada do app: CSS próprio, JS próprio, sem React e
    sem sessão. O telefone é o único ponto em que ela alcança `src/`, e importar
    em vez de reescrever foi decisão: uma segunda máscara faria a página
    formatar diferente do cadastro para onde o lead vai, e divergência de
    formato em dado que depois é comparado a mão vira duplicata na fila.

    Medido no banco: o app grava COM máscara, `(62) 99812-4477`. A LP grava
    igual.

  POR QUE ELE NÃO PRECISA DO SUPABASE
    Os outros dois testes da LP (`test:lp` e o de HTTP) exigem o stack local, e
    ele não sobe em toda máquina. Este aqui só exercita o navegador: a máscara é
    função pura e o campo não envia nada. Então ele roda em qualquer lugar, e é
    o que guarda esta decisão no dia a dia.

  DIGITAR E COLAR SÃO CAMINHOS DIFERENTES, DE PROPÓSITO
    Digitar: a tecla que passaria da capacidade não faz nada.
    Colar: valor que não cabe fica CRU. O motivo está no dado real do
    escritório, e o cabeçalho de src/lib/masks.ts conta: 48 de 126 clientes têm
    telefone com 12 ou 13 dígitos, na forma `+55 (62) 98765-4321`. Cortar um
    desses em 11 produziria um número plausível e errado, que é pior que um
    campo sem formatação.

  RESÍDUO
    Nenhum: build em mkdtemp, apagado na saída. Nada é enviado, nada é gravado.
*/

import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const saida = mkdtempSync(join(tmpdir(), 'lp-telefone-'))
process.on('exit', () => rmSync(saida, { recursive: true, force: true }))

execSync(`npx vite build --outDir ${saida} --emptyOutDir --logLevel error`, { cwd: RAIZ })

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const servidor = createServer((req, res) => {
  /* `normalize` e o prefixo conferido: nem servidor de teste entrega o disco
     inteiro por causa de um `..` no caminho. */
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

/* Porta 5199 e não uma qualquer: é a que está na lista de origens permitidas do
   ambiente de desenvolvimento. Este teste não faz requisição, mas usar a porta
   certa evita que alguém copie este arquivo e perca meia hora com CORS. */
await new Promise((pronto) => servidor.listen(5199, '127.0.0.1', pronto))

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  if (String(esperado) === String(obtido)) {
    console.log(`PASS  ${nome.padEnd(50)} ${esperado}`)
    ok++
  } else {
    console.log(`FAIL  ${nome.padEnd(50)} esperado=${esperado} obtido=${obtido}`)
    falhas++
  }
}

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
const problemas = []
p.on('pageerror', (e) => problemas.push(String(e)))
p.on('console', (m) => m.type() === 'error' && problemas.push(m.text()))
await p.goto('http://localhost:5199/lp/', { waitUntil: 'networkidle' })

const digitar = async (texto) => {
  await p.fill('#telefone-cta', '')
  await p.click('#telefone-cta')
  await p.type('#telefone-cta', texto, { delay: 15 })
  return p.inputValue('#telefone-cta')
}

/* Colar é um `input` com `inputType: 'insertFromPaste'`, e é por esse campo que
   `applyMaskEdit` separa os dois caminhos. Digitar com `p.type` jamais exercita
   o tolerante. */
const colar = async (texto) => {
  await p.evaluate((t) => {
    const campo = document.querySelector('#telefone-cta')
    campo.value = ''
    campo.focus()
    campo.value = t
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: t }))
  }, texto)
  return p.inputValue('#telefone-cta')
}

caso('digitar 11 dígitos vira celular', '(62) 99888-1111', await digitar('62998881111'))
caso('digitar 10 vira fixo', '(62) 3251-8890', await digitar('6232518890'))
caso('letra não entra', '(62) 9988', await digitar('abc62x9988'))
caso('o 12º dígito NÃO entra', '(62) 99888-1111', await digitar('629988811119'))

/* Backspace em cima de um separador tem que comer o dígito da esquerda. A
   máscara ingênua devolveria o mesmo texto e a tecla pareceria não funcionar. */
await digitar('62998881111')
await p.evaluate(() => document.querySelector('#telefone-cta').setSelectionRange(4, 4))
await p.press('#telefone-cta', 'Backspace')
caso('backspace sobre separador come o dígito', '(69) 9888-1111', await p.inputValue('#telefone-cta'))

caso('colar 11 dígitos é mascarado', '(62) 99888-1111', await colar('62998881111'))
caso('colar já mascarado fica igual', '(62) 3251-8890', await colar('(62) 3251-8890'))
caso('colar +55 com 13 dígitos fica CRU', '+55 (62) 98765-4321', await colar('+55 (62) 98765-4321'))

caso('nenhum erro de console na página', '', problemas.join(' | '))

await nav.close()
servidor.close()

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
