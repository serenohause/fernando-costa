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

    3. UM ELEMENTO SÓ NA LINHA, nos dois estados. Sem marca é o botão "Revisar",
       que abre o menu; marcado é o crachá do que foi escolhido, que abre o mesmo
       menu. Foi o segundo pedido do escritório ("um menuzinho, em vez de ficar
       aparecendo um do lado do outro"), e é o que uma refatoração distraída
       transforma de volta em três crachás por ambiente.

  EXIGE
    - `npm run dev` no ar em http://localhost:5173, com `.env` de DEV
    - `supabase/seed/credenciais.dev.local` com a conta de Diretora
    - no escritório de teste: a etapa "Estudo preliminar" com ambientes ligados e
      pelo menos um cartão com ambientes (o seed do módulo 5 e a 0100 dão isso)

  ⚠ ESTE TESTE APAGA COISA, e isso precisa estar escrito em voz alta: ele
  DESMARCA até doze ambientes já revisados do primeiro cartão que encontrar, e no
  fim REMOVE todos os botões de revisão da etapa "Estudo preliminar". Ele não
  restaura o que achou, ele zera. Em dev isso é desejável; em produção seria
  apagar revisão de gente e configuração de escritório, sem histórico para
  devolver.

  POR ISSO ELE CONFERE O BANCO, E NÃO SÓ O ENDEREÇO. A trava de `BASE_URL` só
  diz que o servidor é local; qual BANCO aquele `npm run dev` está usando é outra
  pergunta, e o `.env` já apontou para produção numa troca de ambiente pela
  metade. Antes de digitar a senha, o arquivo compara o projeto Supabase do
  `.env` com o de desenvolvimento e aborta se não bater.

  RESÍDUO
    Nenhum do que ELE cria: a revisão é desmarcada e os botões saem da etapa no
    fim, pelo mesmo caminho que a pessoa usaria. Falha no meio deixa configuração
    no escritório de teste, e o `finally` tenta desfazer.

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

/*
  A SEGUNDA TRAVA, e é ela que importa aqui: o ambiente ATIVO.

  Este arquivo apaga revisão e configuração (ver o aviso do cabeçalho), e o
  servidor local serve o banco que o `.env` mandar. Ambiente trocado pela metade
  é estado real neste projeto - `npm run env:dev` pode trocar o `.env` e falhar o
  resto -, então confiar em "está local, logo é dev" é confiar na metade errada.

  A conferência é pelo REF do projeto dentro da URL do Supabase, que é o que
  distingue os dois bancos. Sem `.env`, aborta: rodar sem saber onde se está é o
  caso que esta trava existe para impedir.
*/
const PROJETO_DE_DEV = 'muqaoymjsoyvwqfdanod'
{
  let env
  try {
    env = readFileSync(`${RAIZ}/.env`, 'utf8')
  } catch {
    console.error('nao achei .env; rode `npm run env:dev` antes')
    process.exit(2)
  }
  const url = env.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.*)$/m)?.[1]?.trim() ?? ''
  if (!url.includes(PROJETO_DE_DEV)) {
    console.error(
      'ABORTADO: o .env NAO aponta para o Supabase de desenvolvimento.\n' +
        '  Este teste apaga revisao e configuracao de etapa. Rode `npm run env:dev` antes.',
    )
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


/*
  A GUARDA QUE VALE É A DO SERVIDOR QUE ESTÁ NO AR, e não a do arquivo.

  A conferência do `.env` acima acontece em disco, e o Vite lê o `.env` UMA VEZ,
  no boot. Um `npm run dev` que subiu apontando para produção e um `.env` trocado
  depois passam pela primeira trava e falam com o banco errado. Por isso, logo
  depois do login, este teste pergunta à PÁGINA com qual projeto Supabase ela
  acabou de autenticar: a chave da sessão no localStorage é `sb-<ref>-auth-token`.
*/
const conferirBancoDaPagina = async () => {
  const refs = await pagina.evaluate(() =>
    Object.keys(window.localStorage).flatMap((chave) => {
      const achado = chave.match(/^sb-([a-z0-9]+)-auth-token$/)
      return achado ? [achado[1]] : []
    }),
  )
  if (refs.length === 0 || !refs.every((ref) => ref === PROJETO_DE_DEV)) {
    console.error(
      `ABORTADO: a pagina autenticou em ${refs.join(', ') || '(nenhum projeto)'}, e nao no de dev.\n` +
        '  O servidor em pe foi iniciado com outro .env. Derrube o `npm run dev` e suba de novo.',
    )
    process.exit(2)
  }
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
  await conferirBancoDaPagina()

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

  /*
    COMEÇA LIMPANDO AS MARCAS DO CARTÃO, e isso não é zelo: o escritório de teste
    é compartilhado com qualquer execução anterior que tenha parado no meio, e
    ambiente já marcado mostra o crachá em vez do botão "Revisar". Sem esta
    varredura, o caso 3.3 contaria menos botões do que ambientes por um motivo
    que não tem nada a ver com o que ele afirma.
  */
  for (let volta = 0; volta < 12; volta++) {
    const marcado = cartao
      .locator('div.group')
      .filter({ hasNotText: 'Revisar' })
      .locator('button[aria-label="Revisão do ambiente"]')
      .first()
    if ((await marcado.count()) === 0) break
    await marcado.click()
    await pagina.waitForTimeout(700)
    await pagina.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: 'Limpar revisão' }).click()
    await pagina.waitForTimeout(2000)
  }

  /*
    A LINHA É PRESA POR POSIÇÃO, e não por um filtro de texto. `filter` é
    avaliado a cada uso: uma linha escolhida por "tem o botão Revisar" deixa de
    casar assim que o teste a marca, e o locator silenciosamente passa a apontar
    para a PRÓXIMA linha ainda não revisada. Os casos seguintes mediriam outra
    coisa e passariam ou falhariam por acidente.
  */
  const textos = await cartao.locator('div.group').allInnerTexts()
  const indiceDaLinha = textos.findIndex((texto) => texto.includes('Revisar'))
  const linhaDeAmbiente = cartao.locator('div.group').nth(indiceDaLinha)
  caso(
    '3.1  o objetivo de ambiente ganha o botão "Revisar"',
    1,
    await linhaDeAmbiente.getByText('Revisar').count(),
  )
  caso(
    '3.2  e NENHUMA opção aparece solta na linha',
    0,
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
    '3.3  só os ambientes ganham o botão',
    quantosAmbientes,
    await cartao.getByText('Revisar').count(),
  )

  /* ── CASO 4: marcar, trocar e limpar ────────────────────────────────────── */

  /*
    O GATILHO É PROCURADO PELO PAPEL, e não pelo texto: ele é o mesmo botão nos
    dois estados ("Revisar" e, depois de marcado, o crachá), e o que não muda é o
    nome acessível que o popover lhe dá. Clicar pelo texto quebraria no estado
    seguinte do próprio teste.
  */
  const gatilho = linhaDeAmbiente.getByRole('button', { name: 'Revisão do ambiente' })
  const menu = pagina.locator('[data-radix-popper-content-wrapper]')
  const check = linhaDeAmbiente.locator('button[role="checkbox"]').first()
  /* ANTES e DEPOIS, e não um valor absoluto: o objetivo pode já estar concluído
     por trabalho anterior no escritório de teste, e o que este teste afirma é
     que MARCAR não mexe nisso. */
  const concluidoAntes = await check.isChecked()

  await gatilho.click()
  await pagina.waitForTimeout(900)
  caso('4.0  o menu traz as duas opções', 2, await menu.getByRole('button').count())

  await menu.getByRole('button', { name: 'Aprovado' }).click()
  await pagina.waitForTimeout(2500)

  caso(
    '4.1  marcado, o botão "Revisar" dá lugar ao crachá',
    0,
    await linhaDeAmbiente.getByText('Revisar').count(),
  )
  caso('4.2  e o crachá mostra a marca', 1, await linhaDeAmbiente.getByText('Aprovado').count())
  /* A marca não conclui o objetivo: o check continua sendo a trava de etapa. */
  caso('4.3  marcar não mexe no check do objetivo', concluidoAntes, await check.isChecked())

  await gatilho.click()
  await pagina.waitForTimeout(900)
  caso('4.4  o menu ganha "Limpar revisão" depois de marcado', 1, await menu.getByRole('button', { name: 'Limpar revisão' }).count())
  await menu.getByRole('button', { name: 'Reprovado' }).click()
  await pagina.waitForTimeout(2500)
  caso('4.5  dá para trocar a marca', 1, await linhaDeAmbiente.getByText('Reprovado').count())

  await gatilho.click()
  await pagina.waitForTimeout(900)
  await menu.getByRole('button', { name: 'Limpar revisão' }).click()
  await pagina.waitForTimeout(2500)
  caso('4.6  limpar devolve o botão "Revisar"', 1, await linhaDeAmbiente.getByText('Revisar').count())
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
