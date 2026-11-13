/*
  AS MÁSCARAS DOS FORMULÁRIOS, NO NAVEGADOR (dinheiro, documento, telefone,
  competência e sigla de estado).

  COMO RODAR
    npm run dev          (em outro terminal, com .env apontando para dev)
    npm run test:mascaras-formularios

  POR QUE ESTE ARQUIVO EXISTE
    `npm run test:masks` prova as funções puras de src/lib/masks.ts. Isso não
    diz se o campo CERTO recebeu a máscara certa, e foi exatamente aí que o
    sistema estava furado: o valor de uma conta a pagar era `type="number"`, a
    competência aceitava "agosto", e o CPF do segundo titular entrava sem
    pontuação nenhuma. Nenhum teste de função pura pega isso.

    Cada caso aqui abre uma tela de verdade, digita tecla por tecla e lê o que
    ficou no campo.

  O QUE ELE NÃO FAZ
    NÃO SALVA NADA. Abre o formulário, digita e fecha. Não existe linha criada,
    alterada nem apagada por este arquivo — por isso ele pode rodar quantas
    vezes quiser, em qualquer ordem.

  EXIGE
    - `npm run dev` no ar em http://localhost:5173, com `.env` de DEV
    - `supabase/seed/credenciais.dev.local` com a conta de Diretora
    - pelo menos um cliente cadastrado no escritório de teste (para o diálogo de
      titulares)

  CUIDADO
    Lê a senha do arquivo de credenciais e NUNCA a imprime.
*/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

/* A senha só é digitada em máquina local. */
{
  const host = new URL(BASE).hostname
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
    console.error(`BASE_URL precisa apontar para a maquina local; recebi "${host}"`)
    process.exit(2)
  }
}

/* E só no banco de desenvolvimento. Este teste não grava, mas digita a senha de
   uma conta, e ambiente trocado pela metade é estado real neste projeto. */
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
    console.error('ABORTADO: o .env NAO aponta para o Supabase de desenvolvimento.')
    process.exit(2)
  }
}

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  if (String(esperado) === String(obtido)) {
    console.log(`PASS  ${nome.padEnd(52)} ${obtido}`)
    ok++
  } else {
    console.log(`FAIL  ${nome.padEnd(52)} esperado=${esperado} obtido=${obtido}`)
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

/* Digitar tecla por tecla, e não `fill`: a máscara mora no `onChange` de cada
   tecla, e preencher de uma vez testaria o caminho de COLAR, que é outro. */
const digitar = async (seletor, texto) => {
  await pagina.locator(seletor).pressSequentially(texto)
  return pagina.locator(seletor).inputValue()
}

try {
  const { email, senha } = contaDiretora()
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.fill('#email', email)
  await pagina.fill('#password', senha)
  await pagina.click('button[type="submit"]')
  await pagina.waitForTimeout(2500)
  await conferirBancoDaPagina()

  /* ── 1. Conta a pagar: dinheiro e competência ───────────────────────────── */
  await pagina.goto(`${BASE}/AccountsPayable`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(2500)
  await pagina.getByRole('button', { name: /Nova Despesa|Nova Conta|Adicionar/ }).first().click()
  await pagina.waitForTimeout(1500)

  caso('1.1  valor da despesa vira dinheiro', '1.234,56', await digitar('#value', '123456'))
  caso('1.2  competência vira MM/AAAA', '08/2026', await digitar('#competence_month', '082026'))
  caso(
    '1.3  sétima tecla na competência não entra',
    '08/2026',
    await digitar('#competence_month', '9'),
  )
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(1000)

  /* ── 2. Recebível: dinheiro no total e em cada parcela ──────────────────── */
  await pagina.goto(`${BASE}/AccountsReceivable`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(2500)
  await pagina.getByRole('button', { name: 'Novo Recebível' }).first().click()
  await pagina.waitForTimeout(1500)

  caso('2.1  valor total vira dinheiro', '3.000,00', await digitar('#value', '300000'))

  await pagina.locator('#enable_installments').click()
  await pagina.waitForTimeout(800)
  await pagina.locator('#installments_quantity').fill('3')
  await pagina.waitForTimeout(1200)

  /* A divisão em parcelas é cálculo antigo; o que mudou é a forma de cada campo.
     Quatro campos de dinheiro: o total e as três parcelas. */
  const dinheiro = pagina.locator('input[inputmode="decimal"]')
  const valores = []
  for (let i = 0; i < (await dinheiro.count()); i++) valores.push(await dinheiro.nth(i).inputValue())
  caso('2.2  as três parcelas saem formatadas', '3.000,00|1.000,00|1.000,00|1.000,00', valores.join('|'))
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(1000)

  /* ── 3. Contrato: dinheiro e sigla de estado ────────────────────────────── */
  await pagina.goto(`${BASE}/Contracts`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(2500)
  await pagina.getByRole('button', { name: 'Nova Proposta' }).first().click()
  await pagina.waitForTimeout(2000)

  caso('3.1  valor do contrato vira dinheiro', '95.000,00', await digitar('#total_value', '9500000'))
  caso('3.2  estado para em duas letras maiúsculas', 'GO', await digitar('#client_address_state', 'goi'))

  /* COLAR É OUTRO CAMINHO, e é onde o corte em duas letras fazia estrago: "Mato
     Grosso" virava MA, que é Maranhão. A tabela dos 27 resolve pelo nome. */
  await pagina.locator('#site_state').fill('Mato Grosso')
  await pagina.waitForTimeout(400)
  caso('3.3  "Mato Grosso" colado vira MT, e não MA', 'MT', await pagina.locator('#site_state').inputValue())

  await pagina.locator('#site_state').fill('Califórnia')
  await pagina.waitForTimeout(400)
  caso(
    '3.4  estado que a tabela não conhece entra cru, sem corte',
    'Califórnia',
    await pagina.locator('#site_state').inputValue(),
  )
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(1000)

  /* ── 4. Cliente: sigla de estado ────────────────────────────────────────── */
  await pagina.goto(`${BASE}/Clients`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(2500)
  await pagina.getByRole('button', { name: 'Novo Lead' }).first().click()
  await pagina.waitForTimeout(2000)
  caso('4.1  número não entra na sigla do estado', 'SP', await digitar('#address_state', 'sp1'))
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(1000)

  /* ── 5. Titular do cliente: documento e telefone ────────────────────────── */
  await pagina.goto(`${BASE}/Clients`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(3000)
  await pagina.locator('table tbody tr, [role="row"]').nth(1).click()
  await pagina.waitForTimeout(2500)
  await pagina.getByRole('button', { name: 'Adicionar', exact: true }).first().click()
  await pagina.waitForTimeout(1500)

  caso('5.1  CPF do titular vira documento', '123.456.789-01', await digitar('#person-tax', '12345678901'))
  caso(
    '5.2  telefone do titular vira celular',
    '(62) 98765-4321',
    await digitar('#person-phone', '62987654321'),
  )
} finally {
  await navegador.close()
}

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas === 0 ? 0 : 1)
