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

/*
  O ZERO DA DISCAGEM, que veio de lead de verdade: a pessoa escreveu o DDD como
  `085`. Sem o conserto, isso dava 12 dígitos, a capacidade da máscara recusava
  a ÚLTIMA tecla em silêncio e ficava gravado `(08) 59999-9888`, um algarismo a
  menos do que ela deu. Numa landing page ninguém volta para conferir, e o
  dígito perdido não se recupera depois.
*/
caso('digitar o DDD com o zero da discagem', '(85) 99999-8888', await digitar('085999998888'))
caso('o zero não atrapalha o fixo', '(85) 3222-1100', await digitar('08532221100'))
caso('colar com o zero da discagem também limpa', '(85) 99999-8888', await colar('085 99999-8888'))
// Sem `+` na entrada, não há `+` na saída: os dois zeros caem e sobram 13
// dígitos, que a máscara deixa crus pelo caminho tolerante de sempre.
caso('zero antes do código do país cai junto', '55 (62) 98765-4321', await colar('0055 (62) 98765-4321'))
// E o número sem zero nenhum continua exatamente como era.
caso('sem zero na frente, nada muda', '(62) 99888-1111', await digitar('62998881111'))

/*
  TETO NO CAMPO, de achado de auditoria. A limpeza do zero roda dentro do
  handler de `input`, de forma síncrona: texto colado por engano travava a aba
  de quem colou. A versão atual é linear, então o custo já caiu de 18,6s para
  3,9ms com 100 mil caracteres, mas o `maxlength` fecha a porta antes: 40 é o
  mesmo teto que a edge function já cobra (`z.string().trim().max(40)`), e sem
  ele um colar de 200KB viajava a rede só para o servidor recusar.
*/
/*
  TEXTO ENORME COLADO, de achado de auditoria. A limpeza do zero roda dentro do
  handler de `input`, de forma SÍNCRONA: enquanto ela não termina, a aba de quem
  colou fica parada. A primeira versão refazia a varredura a cada zero removido,
  o que é quadrático quando vem não-dígito antes dos zeros, que é justamente a
  forma de um texto colado por engano. Medido no navegador: 2728ms com 100 mil
  caracteres. A versão de uma passada faz o mesmo trabalho em milissegundos.

  O teto de 1000ms é folga enorme para os dois lados, então o caso não oscila
  com máquina mais lenta: ou está linear e termina em milissegundos, ou voltou a
  ser quadrático e estoura.
*/
{
  const inicio = Date.now()
  await colar('x'.repeat(100000) + '0'.repeat(100000) + '62998887766')
  caso('colar 200 mil caracteres não trava a aba', true, Date.now() - inicio < 1000)
}

/*
  E o teto do campo, que `colar` NÃO consegue exercitar: o helper escreve
  `campo.value` por JavaScript, e `maxlength` só vale para o que a pessoa digita
  ou cola pela interface. Então o caso confere a declaração, que é o que impede
  alguém de remover o atributo sem perceber. O valor é o mesmo que a edge
  function já cobra (`z.string().trim().max(40)`): sem ele, um colar de 200KB
  viaja a rede só para o servidor recusar.
*/
caso('o campo declara o mesmo teto do servidor', '40', await p.getAttribute('#telefone-cta', 'maxlength'))

caso('nenhum erro de console na página', '', problemas.join(' | '))

await nav.close()
servidor.close()

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
