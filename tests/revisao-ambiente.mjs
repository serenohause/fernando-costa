/*
  OS BOTÕES DE SINALIZAÇÃO DE REVISÃO, DA CONFIGURAÇÃO ATÉ O CARTÃO (0131).

  COMO RODAR
    npm run dev          (em outro terminal, com .env apontando para dev)
    npm run test:revisao-ambiente

  POR QUE ESTE ARQUIVO EXISTE
    O teste SQL (`npm run test:kanban:revisao`) prova o banco: quem grava, quem
    lê, e que apagar o botão não apaga a revisão. Nada disso diz se a tela faz o
    que foi pedido, e o pedido tem três partes que só existem no navegador:

    1. O EDITOR APARECE COM O TOGGLE DE AMBIENTES, e some com ele. É uma
       combinação de estado dentro de um diálogo: dá para quebrar sem erro
       nenhum de tipo, deixando a configuração inalcançável ou visível numa etapa
       onde os botões nunca vão aparecer.

    2. OS BOTÕES SÓ ENTRAM NO OBJETIVO DE AMBIENTE. O cartão tem duas espécies de
       objetivo na mesma lista: os do modelo da etapa e os dos ambientes do
       projeto. O recorte é `room_id`, e errá-lo põe botão de revisão em
       "Enviar planta baixa".

    3. MARCADO, APARECE SÓ O BOTÃO ESCOLHIDO. Foi o pedido em letra; é o que
       mantém a fita de ambientes legível, e é o que uma refatoração distraída
       transforma de volta em três botões.

  EXIGE
    - `npm run dev` no ar em http://localhost:5173, com `.env` de DEV
    - `supabase/seed/credenciais.dev.local` com a conta de Diretora
    - no escritório de teste: a etapa "Estudo preliminar" com ambientes ligados e
      pelo menos um cartão com ambientes (o seed do módulo 5 e a 0100 dão isso)

  RESÍDUO
    Nenhum, e ele é limpo pela própria tela: a revisão é desmarcada e os botões
    saem da etapa no fim, pelo mesmo caminho que a pessoa usaria. Falha no meio
    deixa configuração no escritório de teste, e o `finally` tenta desfazer.

  CUIDADO
    Lê a senha do arquivo de credenciais e NUNCA a imprime.
*/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const ETAPA = 'Estudo preliminar'

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

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 950 } })

const abrirEtapa = async () => {
  await pagina.goto(`${BASE}/Settings`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: /Quadros/ }).click()
  await pagina.waitForTimeout(2000)
  await pagina.getByRole('button', { name: `Editar ${ETAPA}` }).click()
  await pagina.waitForTimeout(1200)
}

try {
  const { email, senha } = contaDiretora()
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.fill('#email', email)
  await pagina.fill('#password', senha)
  await pagina.click('button[type="submit"]')
  await pagina.waitForTimeout(2500)

  /* ── CASO 1: o editor acompanha o toggle de ambientes ───────────────────── */
  await abrirEtapa()

  const editor = pagina.getByText('Botões de revisão do ambiente')
  caso('1.1  com ambientes ligados, o editor aparece', 1, await editor.count())

  const toggle = pagina.locator('#kanban-column-rooms')
  await toggle.click()
  await pagina.waitForTimeout(500)
  caso('1.2  desligar os ambientes esconde o editor', 0, await editor.count())
  await toggle.click()
  await pagina.waitForTimeout(500)
  caso('1.3  religar traz o editor de volta', 1, await editor.count())

  /* ── CASO 2: configurar dois botões ─────────────────────────────────────── */
  for (const rotulo of ['Aprovado', 'Reprovado']) {
    await pagina.getByRole('button', { name: 'Adicionar botão' }).click()
    await pagina.waitForTimeout(300)
    await pagina.locator('input[aria-label="Nome do botão"]').last().fill(rotulo)
  }
  caso(
    '2.1  a prévia mostra os dois botões',
    2,
    await pagina.locator('span:text-is("Aprovado"), span:text-is("Reprovado")').count(),
  )

  await pagina.getByRole('button', { name: 'Salvar' }).click()
  await pagina.waitForTimeout(3000)
  caso(
    '2.2  a etapa salva e a lista anuncia os botões',
    1,
    await pagina.getByText('2 botões de revisão').count(),
  )

  /* ── CASO 3: o cartão ───────────────────────────────────────────────────── */
  await pagina.goto(`${BASE}/Tasks`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(3500)

  /* O cartão certo é o primeiro que tem seção "Ambientes": os outros estão em
     etapas sem ambientes, e nenhum deles deveria mostrar botão. */
  let cartao = null
  const cartoes = await pagina.locator('[data-rfd-draggable-id]').count()
  for (let indice = 0; indice < Math.min(cartoes, 12); indice++) {
    await pagina.locator('[data-rfd-draggable-id]').nth(indice).click()
    await pagina.waitForTimeout(1500)
    const dialogo = pagina.locator('[role="dialog"]').last()
    if ((await dialogo.getByText('Ambientes', { exact: true }).count()) > 0) {
      cartao = dialogo
      break
    }
    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(500)
  }

  if (!cartao) {
    console.error('nenhum cartao com ambientes no quadro de teste')
    process.exit(2)
  }

  const linhaDeAmbiente = cartao.locator('div.group').filter({ hasText: 'Sala de estar' }).first()
  caso(
    '3.1  o objetivo de ambiente ganha os dois botões',
    2,
    await linhaDeAmbiente.locator('button:text-is("Aprovado"), button:text-is("Reprovado")').count(),
  )

  /*
    SÓ OS AMBIENTES GANHAM BOTÃO, e a conta é o que prova: o cabeçalho da seção
    "Ambientes" traz quantos ambientes o cartão tem, e o número de botões
    "Aprovado" na tela tem de ser exatamente esse. Um botão a mais é botão num
    objetivo do modelo da etapa, que é o recorte por `room_id` quebrado.

    Contar é melhor que procurar um título conhecido: o conteúdo do modelo é dado
    do escritório de teste e muda sem avisar.
  */
  const cabecalhoAmbientes = await cartao
    .locator('div')
    .filter({ hasText: /^Ambientes\d+\/\d+$/ })
    .first()
    .innerText()
  const quantosAmbientes = Number(cabecalhoAmbientes.match(/\/(\d+)/)?.[1] ?? 0)
  caso(
    '3.2  só os ambientes ganham botão',
    quantosAmbientes,
    await cartao.locator('button:text-is("Aprovado")').count(),
  )

  /* ── CASO 4: marcar, trocar e limpar ────────────────────────────────────── */
  await linhaDeAmbiente.getByRole('button', { name: 'Aprovado' }).click()
  await pagina.waitForTimeout(2500)

  caso(
    '4.1  marcado, sobra só o botão escolhido',
    0,
    await linhaDeAmbiente.locator('button:text-is("Reprovado")').count(),
  )
  caso('4.2  e ele continua visível', 1, await linhaDeAmbiente.getByText('Aprovado').count())
  /* A marca não conclui o objetivo: o check continua sendo a trava de etapa. */
  caso(
    '4.3  o objetivo NÃO foi concluído pela marca',
    false,
    await linhaDeAmbiente.locator('button[role="checkbox"]').first().isChecked(),
  )

  await linhaDeAmbiente.getByText('Aprovado').click()
  await pagina.waitForTimeout(900)
  await pagina.getByRole('button', { name: 'Reprovado' }).last().click()
  await pagina.waitForTimeout(2500)
  caso('4.4  dá para trocar a marca', 1, await linhaDeAmbiente.getByText('Reprovado').count())

  await linhaDeAmbiente.getByText('Reprovado').click()
  await pagina.waitForTimeout(900)
  await pagina.getByRole('button', { name: 'Limpar revisão' }).click()
  await pagina.waitForTimeout(2500)
  caso(
    '4.5  limpar devolve os dois botões',
    2,
    await linhaDeAmbiente.locator('button:text-is("Aprovado"), button:text-is("Reprovado")').count(),
  )
} finally {
  /*
    DESFAZ A CONFIGURAÇÃO, pela própria tela. Sem isto, o escritório de teste
    fica com dois botões de revisão para sempre e a próxima execução falha no
    caso 2.2 contando botões que ela não criou.
  */
  try {
    await abrirEtapa()
    while ((await pagina.locator('input[aria-label="Nome do botão"]').count()) > 0) {
      await pagina.locator('button[aria-label^="Remover "]').first().click()
      await pagina.waitForTimeout(300)
    }
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.waitForTimeout(2500)
  } catch {
    console.log('  (nao consegui desfazer a configuracao; confira a etapa de teste)')
  }

  await navegador.close()
}

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas === 0 ? 0 : 1)
