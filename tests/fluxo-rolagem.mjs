/*
  A ROLAGEM DO FLUXO DO PROJETO ACONTECE DENTRO DO QUADRO, NÃO NA TELA INTEIRA.

  COMO RODAR
    npm run dev          (em outro terminal, com .env apontando para dev)
    npm run test:fluxo-rolagem

  POR QUE ESTE ARQUIVO EXISTE
    Dois defeitos relatados pelo usuário, os dois de rolagem, os dois invisíveis
    para teste de unidade porque só existem quando o navegador faz a conta de
    layout.

    1. A ALTURA DO QUADRO. O quadro vinha do original com `calc(100vh - 280px)`,
       e a coluna com `calc(100vh - 300px)`. Aquele 280 é a soma do que fica
       acima do quadro NAQUELA tela; aqui o quadro mora dentro de `main`, que já
       tem altura própria, padding próprio e rolagem própria, e com filtros que
       empilham no celular. Medido antes do conserto: o quadro terminava 4px
       abaixo da borda da janela no desktop e 92px abaixo no celular, e o
       excedente desaparecia dentro do padding de baixo de `main` — o fim das
       colunas não tinha como ser alcançado. Com a faixa de sessão assumida
       `main` encolhe 3,5rem e o quadro não encolhia nada, e aí a página inteira
       passava a rolar.

    2. O MENU "ALTERAR RESPONSÁVEL". Os conteúdos de menu vinham com
       `overflow-hidden` e nenhum limite de altura. Medido antes do conserto, com
       20 colaboradores no escritório e janela de 600px: o submenu media 648px,
       terminava 50px abaixo da borda, dois nomes não tinham como ser escolhidos,
       e forçar `scrollTop` não movia nada.

  O QUE ELE PROVA
    Que o quadro CABE no espaço que `main` lhe dá, em quatro tamanhos de janela
    — incluindo o celular, onde os filtros empilham e o erro era de 92px. E que
    o menu de responsável rola de verdade quando não cabe, com todos os nomes
    alcançáveis.

  O QUE ELE NÃO ALCANÇA
    A faixa de sessão assumida, que depende de `VITE_IMPERSONATION` e de uma
    impersonação viva. O erro dela é aritmético e está escrito em
    `useAlturaDoQuadro`: `main` encolhe 3,5rem e um `calc(100vh - 280px)` não
    acompanha. A medida que substituiu o chute não tem como errar esse caso,
    porque ela parte de `main`, não da janela.

  EXIGE
    - `npm run dev` no ar em http://localhost:5173
    - `supabase/seed/credenciais.dev.local` com a conta de Diretora
    - tarefas no escritório de teste (o seed do módulo 5 já as cria)

  RESÍDUO
    Nenhum. Só leitura e um hover de menu.

  CUIDADO
    Lê a senha do arquivo de credenciais e NUNCA a imprime.
*/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  if (String(esperado) === String(obtido)) {
    console.log(`PASS  ${nome.padEnd(56)} ${esperado}`)
    ok++
  } else {
    console.log(`FAIL  ${nome.padEnd(56)} esperado=${esperado} obtido=${obtido}`)
    falhas++
  }
}

/* A conta de Diretora sai do arquivo de credenciais do seed. Nada daqui é
   impresso: o que entra no console são medidas de layout. */
function contaDiretora() {
  const caminho = `${RAIZ}/supabase/seed/credenciais.dev.local`
  let texto
  try {
    texto = readFileSync(caminho, 'utf8')
  } catch {
    console.error(`nao achei ${caminho}. Rode: npm run seed`)
    process.exit(2)
  }
  const linhas = texto.split('\n')
  const i = linhas.findIndex((linha) => /funcao:\s*director/.test(linha))
  if (i < 0) {
    console.error('o arquivo de credenciais nao tem conta de director')
    process.exit(2)
  }
  const bloco = linhas.slice(i, i + 4).join('\n')
  const email = bloco.match(/email:\s*(\S+)/)?.[1]
  const senha = bloco.match(/senha:\s*(\S+)/)?.[1]
  if (!email || !senha) {
    console.error('bloco de director sem email ou senha')
    process.exit(2)
  }
  return { email, senha }
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })

try {
  const { email, senha } = contaDiretora()
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.fill('#email', email)
  await pagina.fill('#password', senha)
  await pagina.click('button[type="submit"]')
  await pagina.waitForTimeout(3000)

  /*
    CASO 1 — O QUADRO CABE EM `main`.

    A medida é o fundo do quadro contra o fim da área de conteúdo de `main`
    (altura visível menos o padding de baixo). Zero ou negativo significa que
    cabe; positivo é o quanto ele passa, que é o defeito. Antes do conserto esta
    conta dava +4 no desktop e +92 no celular.
  */
  const JANELAS = [
    { nome: 'desktop 1440x900', width: 1440, height: 900 },
    { nome: 'notebook 1280x720', width: 1280, height: 720 },
    { nome: 'tablet 820x1180', width: 820, height: 1180 },
    { nome: 'celular 390x844', width: 390, height: 844 },
  ]

  for (const janela of JANELAS) {
    await pagina.setViewportSize({ width: janela.width, height: janela.height })
    await pagina.goto(`${BASE}/Tasks`, { waitUntil: 'networkidle' })
    await pagina.waitForSelector('.kanban-board-wrapper', { timeout: 20000 })
    await pagina.waitForTimeout(900)

    const medida = await pagina.evaluate(() => {
      const principal = document.querySelector('main')
      const quadro = document.querySelector('.kanban-board-wrapper')
      const recuo = parseFloat(getComputedStyle(principal).paddingBottom) || 0
      const fimDoConteudo = principal.getBoundingClientRect().top + principal.clientHeight - recuo
      const caixa = quadro.getBoundingClientRect()
      return {
        excesso: Math.round(caixa.bottom - fimDoConteudo),
        paginaRola: principal.scrollHeight > principal.clientHeight + 1,
        /* Só faz sentido quando há o que rolar na horizontal. */
        barraVisivel:
          quadro.scrollWidth <= quadro.clientWidth + 1 ||
          (caixa.bottom <= innerHeight && caixa.bottom > 0),
      }
    })

    caso(`${janela.nome}: quadro passa de main (px)`, 0, medida.excesso)
    caso(`${janela.nome}: a pagina NAO rola`, 'false', medida.paginaRola)
    /*
      A BARRA HORIZONTAL MORA NA BORDA DE BAIXO DO QUADRO. Era ela que sumia:
      com o quadro passando da área visível, a barra ficava fora da tela e não
      havia o que arrastar. Estando o quadro dentro, ela está à mão.
    */
    caso(`${janela.nome}: a barra horizontal esta na area visivel`, 'true', medida.barraVisivel)
  }

  /*
    CASO 2 — O MENU DE RESPONSÁVEL ROLA QUANDO NÃO CABE.

    Janela curta de propósito: é o que força o submenu a passar da borda. Com
    `overflow-hidden` e sem limite de altura, `scrollTop` não saía de zero e os
    últimos nomes ficavam fora da tela.
  */
  await pagina.setViewportSize({ width: 1440, height: 600 })
  await pagina.goto(`${BASE}/Tasks`, { waitUntil: 'networkidle' })
  await pagina.waitForSelector('.kanban-column-body button[aria-haspopup="menu"]', {
    timeout: 20000,
  })
  await pagina.waitForTimeout(900)
  await pagina.locator('.kanban-column-body button[aria-haspopup="menu"]').first().click()
  await pagina.waitForTimeout(400)
  await pagina.getByText('Alterar Responsável', { exact: false }).first().hover()
  await pagina.waitForTimeout(700)

  const menu = await pagina.evaluate(() => {
    const submenu = [...document.querySelectorAll('[data-radix-menu-content]')].pop()
    if (!submenu) return null
    const estilo = getComputedStyle(submenu)
    const itens = [...submenu.querySelectorAll('[role="menuitem"]')]
    submenu.scrollTop = 1000
    const rolou = submenu.scrollTop > 0
    submenu.scrollTop = 0
    return {
      itens: itens.length,
      cabeNaJanela: Math.round(submenu.getBoundingClientRect().bottom) <= innerHeight,
      precisaRolar: submenu.scrollHeight > submenu.clientHeight + 1,
      rolou,
      overflowY: estilo.overflowY,
      temLimite: estilo.maxHeight !== 'none',
    }
  })

  if (!menu) {
    caso('submenu de responsavel abriu', 'sim', 'nao')
  } else {
    caso('o submenu de responsavel tem limite de altura', 'true', menu.temLimite)
    caso('o submenu rola (overflow-y)', 'auto', menu.overflowY)
    caso('o submenu nao passa da borda da janela', 'true', menu.cabeNaJanela)
    /*
      Com poucos colaboradores o submenu CABE, e aí não há o que rolar — a
      afirmação só faz sentido quando ele não cabe. O caso acima (limite de
      altura) é o que vale nos dois mundos.
    */
    if (menu.precisaRolar) {
      caso('nao cabendo, o submenu rola de verdade', 'true', menu.rolou)
    } else {
      console.log(
        `SKIP  submenu cabe inteiro com ${menu.itens} nomes: nada a rolar nesta base`,
      )
    }
  }
  /*
    CASO 3 — A LISTA DENTRO DO POPOVER DO CARTÃO ROLA COM A RODA DO MOUSE.

    Defeito diferente do caso 2, e por isso tem caso próprio: aqui a lista
    SEMPRE pôde rolar (`max-h-64 overflow-y-auto`), o que estava bloqueado era o
    GESTO. O popover é portalado para fora do diálogo modal, e a trava de
    rolagem do diálogo engolia a roda. Por isso o teste usa `mouse.wheel` e não
    `scrollTop = N`: o `scrollTop` forçado funcionava mesmo com o defeito de pé,
    e um teste escrito assim passaria sem provar nada.
  */
  await pagina.setViewportSize({ width: 1440, height: 900 })
  await pagina.goto(`${BASE}/Tasks`, { waitUntil: 'networkidle' })
  await pagina.waitForSelector('.kanban-column-body', { timeout: 20000 })
  await pagina.waitForTimeout(1200)
  await pagina.locator('.kanban-column-body [data-rfd-draggable-id]').first().click()
  await pagina.waitForSelector('[role="dialog"]', { timeout: 10000 })
  await pagina.waitForTimeout(1200)
  await pagina.locator('[role="dialog"] button[aria-label="Alterar responsável"]').first().click()
  await pagina.waitForTimeout(900)

  const acharLista = () =>
    pagina.evaluate(() => {
      const lista = [...document.querySelectorAll('div')].find(
        (el) =>
          /overflow-y-auto/.test(el.className || '') && /max-h-64/.test(el.className || ''),
      )
      if (!lista) return null
      const r = lista.getBoundingClientRect()
      return {
        precisaRolar: lista.scrollHeight > lista.clientHeight + 1,
        scrollTop: lista.scrollTop,
        centro: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
      }
    })

  const antes = await acharLista()
  if (!antes) {
    caso('a lista de responsaveis do cartao abriu', 'sim', 'nao')
  } else if (!antes.precisaRolar) {
    console.log('SKIP  a lista de responsaveis cabe inteira: nada a rolar nesta base')
  } else {
    await pagina.mouse.move(antes.centro.x, antes.centro.y)
    await pagina.mouse.wheel(0, 300)
    await pagina.waitForTimeout(600)
    const depois = await acharLista()
    caso('a lista do cartao rola com a roda do mouse', 'true', depois.scrollTop > 0)
  }
} finally {
  await navegador.close()
}

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
