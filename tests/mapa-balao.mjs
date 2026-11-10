/*
  O BALÃO DO PINO NO NAVEGADOR DE VERDADE: o carrossel de fotos, e onde moram os
  botões de ação.

  COMO RODAR
    npm run dev          (em outro terminal, com .env apontando para dev)
    npm run test:mapa-balao

  POR QUE ESTE ARQUIVO EXISTE
    Três coisas desta feature só existem quando o navegador monta a página, e
    nenhuma delas aparece em teste de banco:

    1. O LIGHTBOX DENTRO DO BALÃO DO GOOGLE. O conteúdo do balão é montado por
       portal dentro de um nó que o Google Maps TRANSFORMA. Um elemento
       `position: fixed` dentro de um ancestral transformado passa a ser
       posicionado em relação a esse ancestral: o "ver em tela cheia" ficaria
       preso dentro de um balão de 300 pixels, e a tela pareceria quebrada sem
       nenhum erro no console. O conserto é um segundo portal, para
       `document.body`, e o que prova que ele está de pé é a MEDIDA: a camada
       preta tem de ter o tamanho da janela.

    2. OS BOTÕES QUE SÓ APARECEM NO HOVER. Opacidade zero continua clicável em
       teste de unidade. Aqui a conferência é a computada, depois do hover.

    3. ONDE CADA BOTÃO MORA. O escritório pediu o balão com um botão só ("Ver
       Detalhes Completos") e as três ações de escrita dentro do resumo. Isso é
       combinação entre dois componentes e um gerente de modal: dá para quebrar
       sem erro nenhum de tipo, deixando um botão órfão no balão ou um resumo
       sem ação nenhuma para quem edita.

    4. O CICLO INTEIRO CONTRA O SUPABASE DE DEV: subir a foto para o bucket
       privado, ler de volta com URL assinada, desenhar, e remover. A policy, o
       caminho com `tenant_id` na frente e o MIME do bucket só falam quando há
       uma requisição real.

  EXIGE
    - `npm run dev` no ar em http://localhost:5173, com `.env` de DEV
    - `supabase/seed/credenciais.dev.local` com a conta de Diretora
    - pelo menos um pino no mapa do escritório de teste

  RESÍDUO
    Nenhum. As duas fotos enviadas são removidas pela própria tela no fim, que é
    o mesmo caminho que a pessoa usa — e é isso que faz a remoção ser testada em
    vez de limpa por fora. Se o teste quebrar no meio, sobra foto na primeira
    propriedade da lista.

  CUIDADO
    Lê a senha do arquivo de credenciais e NUNCA a imprime.
*/

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

/* A senha só é digitada em máquina local. Mesma trava dos outros testes de
   navegador: `BASE_URL` existe para trocar a porta, não o host. */
{
  const host = new URL(BASE).hostname
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
    console.error(`BASE_URL precisa apontar para a maquina local; recebi "${host}"`)
    process.exit(2)
  }
}

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

/* Um PNG 1x1 de verdade, e não um arquivo com extensão trocada: o bucket confere
   o MIME declarado, e o navegador declara pelo conteúdo. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const foto1 = join(tmpdir(), `mapa-foto-1-${process.pid}.png`)
const foto2 = join(tmpdir(), `mapa-foto-2-${process.pid}.png`)
writeFileSync(foto1, PNG_1X1)
writeFileSync(foto2, PNG_1X1)

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })

try {
  const { email, senha } = contaDiretora()
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.fill('#email', email)
  await pagina.fill('#password', senha)
  await pagina.click('button[type="submit"]')
  await pagina.waitForTimeout(2500)

  await pagina.goto(`${BASE}/MapaProjetos`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(3500)

  /*
    ABRIR O BALÃO EM DOIS GESTOS, e o segundo é um clique por COORDENADA.

    A lista da esquerda centraliza o mapa na propriedade com zoom 18 e a
    destaca; quem ABRE o balão é o clique no marcador. E marcador do Google não
    é nó do DOM que se possa localizar por seletor: ele é desenhado, e o que
    existe para clicar é o pixel.

    Por isso o alvo é o centro do mapa (onde a propriedade acabou de ser
    centralizada) subindo 20 pixels: o ícone do pino ancora na PONTA
    (`anchor: (12, 41)` em google-maps-setup.ts), então o corpo clicável fica
    acima da coordenada.
  */
  const abrirBalao = async () => {
    /*
      O DESVIO PELA SEGUNDA PROPRIEDADE NÃO É SUPERSTIÇÃO.

      Quando o balão abre, o Google PANORAMA o mapa para caber a caixa: o
      marcador deixa de estar no centro. Fechado o balão, o mapa fica onde
      ficou. Clicar a mesma propriedade da lista de novo não traz nada de volta,
      porque centro e zoom pedidos são os mesmos de antes e a câmera não se
      move. Passar por outra propriedade muda o pedido, e aí o retorno à
      primeira recentraliza de verdade.
    */
    await pagina.locator('button.w-full.text-left.p-3').nth(1).click()
    await pagina.waitForTimeout(1500)
    await pagina.locator('button.w-full.text-left.p-3').first().click()
    await pagina.waitForTimeout(2000)

    const areaDoMapa = await pagina.locator('.gm-style').first().boundingBox()
    await pagina.mouse.click(
      areaDoMapa.x + areaDoMapa.width / 2,
      areaDoMapa.y + areaDoMapa.height / 2 - 20,
    )
    await pagina.waitForTimeout(2500)
  }

  await abrirBalao()

  /* ── CASO 1: sem foto, o bloco É o botão de adicionar ──────────────────── */
  const botaoVazio = pagina.getByRole('button', { name: /Adicionar fotos/ })
  caso('1.1  pino sem foto mostra o botao grande', 1, await botaoVazio.count())

  /* ── CASO 2: enviar duas fotos de uma vez ──────────────────────────────── */
  const entrada = pagina.locator('input[type="file"]').first()
  await entrada.setInputFiles([foto1, foto2])
  await pagina.waitForTimeout(6000)

  const contador = pagina.locator('span', { hasText: /^\d+ \/ \d+$/ }).first()
  caso('2.1  o carrossel aparece com as duas fotos', '1 / 2', (await contador.textContent())?.trim())
  caso(
    '2.2  o botao grande de vazio sumiu',
    0,
    await pagina.getByRole('button', { name: /Adicionar fotos/ }).count(),
  )

  /* ── CASO 3: as ações só aparecem no hover ─────────────────────────────── */
  const quadro = pagina.locator('img[alt$=".png"]').first()
  const barra = pagina.locator('button[title="Ver em tela cheia"]').first()
  const opacidade = async () =>
    await barra.evaluate((no) => getComputedStyle(no.parentElement).opacity)

  caso('3.1  a barra de acoes comeca invisivel', '0', await opacidade())
  await quadro.hover()
  await pagina.waitForTimeout(400)
  caso('3.2  o hover revela a barra de acoes', '1', await opacidade())
  caso(
    '3.3  Diretora ve adicionar e remover',
    2,
    await pagina.locator('button[title^="Adicionar mais fotos"], button[title="Remover esta foto"]').count(),
  )

  /* ── CASO 4: o lightbox sai do balão e cobre a janela ──────────────────── */
  await barra.click()
  await pagina.waitForTimeout(700)

  const camada = pagina.locator('div[role="dialog"][aria-modal="true"]').first()
  const medida = await camada.evaluate((no) => {
    const r = no.getBoundingClientRect()
    return {
      largura: Math.round(r.width),
      altura: Math.round(r.height),
      filhoDoBody: no.parentElement === document.body,
    }
  })
  caso('4.1  o lightbox e filho do body (portal)', true, medida.filhoDoBody)
  caso('4.2  o lightbox tem a largura da janela', 1440, medida.largura)
  caso('4.3  o lightbox tem a altura da janela', 900, medida.altura)

  const contadorCheio = camada.locator('p', { hasText: /^\d+ \/ \d+$/ }).first()
  caso('4.4  abre na foto atual', '1 / 2', (await contadorCheio.textContent())?.trim())
  await pagina.keyboard.press('ArrowRight')
  await pagina.waitForTimeout(400)
  caso('4.5  a seta do teclado anda', '2 / 2', (await contadorCheio.textContent())?.trim())
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(400)
  caso('4.6  Esc fecha', 0, await pagina.locator('div[role="dialog"][aria-modal="true"]').count())

  /* ── CASO 6: onde cada botão mora, e CASO 7: a foto na coluna do resumo ── */
  await abrirBalao()

  const balao = pagina.locator('.gm-style-iw').first()
  caso(
    '6.1  o balao tem so "Ver Detalhes Completos"',
    1,
    await balao.locator('button:has-text("Ver Detalhes Completos")').count(),
  )
  for (const [numero, rotulo] of [
    ['6.2', 'Editar Informações'],
    ['6.3', 'Ajustar Localização'],
    ['6.4', 'Remover do Mapa'],
  ]) {
    caso(
      `${numero}  "${rotulo}" saiu do balao`,
      0,
      await balao.locator(`button:has-text("${rotulo}")`).count(),
    )
  }

  /* A largura da foto no balão, guardada ANTES de abrir o resumo: é a régua do
     caso 7. Número absoluto aqui seria teste de pixel, que quebra no dia em que
     alguém mexer no padding do balão; o que importa é a RELAÇÃO. */
  const larguraNoBalao = (await balao.locator('img[alt$=".png"]').first().boundingBox()).width

  await balao.locator('button:has-text("Ver Detalhes Completos")').click()
  await pagina.waitForTimeout(1500)

  const resumo = pagina.locator('[role="dialog"]').last()
  for (const [numero, rotulo] of [
    ['6.5', 'Editar Informações'],
    ['6.6', 'Ajustar Localização'],
    ['6.7', 'Remover do Mapa'],
    ['6.8', 'Fechar'],
  ]) {
    caso(
      `${numero}  "${rotulo}" esta no resumo`,
      1,
      await resumo.locator(`button:has-text("${rotulo}")`).count(),
    )
  }

  const fotoNoResumo = resumo.locator('img[alt$=".png"]').first()
  caso('7.1  o resumo mostra a foto', 1, await fotoNoResumo.count())
  const caixaNoResumo = await fotoNoResumo.boundingBox()
  caso('7.2  a foto do resumo e bem maior que a do balao', true, caixaNoResumo.width > larguraNoBalao * 1.5)
  /* As duas colunas lado a lado: a foto termina antes de a informação começar. */
  const caixaDaInfo = await resumo.locator('text=Coordenadas').first().boundingBox()
  caso('7.3  a foto fica a esquerda das informacoes', true, caixaNoResumo.x + caixaNoResumo.width <= caixaDaInfo.x)
  caso(
    '7.4  o contador do carrossel acompanha no resumo',
    '1 / 2',
    (await resumo.locator('span', { hasText: /^\d+ \/ \d+$/ }).first().textContent())?.trim(),
  )

  await resumo.locator('button:has-text("Fechar")').click()
  await pagina.waitForTimeout(1000)

  /*
    ── CASO 5: remover as duas, pelo mesmo caminho da pessoa ────────────────

    O BALÃO PRECISA SER REABERTO, e isso não é defeito: Esc fecha o lightbox E
    o InfoWindow do Google, que escuta a mesma tecla. Quem aperta Esc com a foto
    aberta volta para o mapa, não para o balão. Fica registrado aqui porque é
    comportamento visível, e porque sem o reabrir este teste pararia na primeira
    remoção sem dizer por quê.
  */
  await abrirBalao()

  for (const volta of [1, 2]) {
    await quadro.hover()
    await pagina.waitForTimeout(300)
    await pagina.locator('button[title="Remover esta foto"]').first().click()
    await pagina.waitForTimeout(500)
    await pagina.getByRole('button', { name: 'Remover foto' }).click()
    await pagina.waitForTimeout(4000)
    if (volta === 1) {
      caso(
        '5.1  sobra uma foto depois da primeira remocao',
        '1 / 1',
        (await pagina.locator('span', { hasText: /^\d+ \/ \d+$/ }).first().textContent())?.trim(),
      )
    }
  }

  caso(
    '5.2  sem fotos, o botao grande volta',
    1,
    await pagina.getByRole('button', { name: /Adicionar fotos/ }).count(),
  )

} finally {
  await navegador.close()
  unlinkSync(foto1)
  unlinkSync(foto2)
}

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas === 0 ? 0 : 1)
