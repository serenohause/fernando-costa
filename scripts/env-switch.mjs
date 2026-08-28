#!/usr/bin/env node
// Troca o ambiente ativo entre producao e desenvolvimento.
//
//   npm run env:prod     ativa producao
//   npm run env:dev      ativa desenvolvimento
//   npm run env:which    diz qual esta ativo, sem trocar nada
//
// POR QUE UM COMANDO, E NAO "editar o .env"
//   Os dois projetos Supabase vivem em CONTAS DIFERENTES, e isso torna os cinco
//   valores inseparaveis: um token pessoal so alcanca a conta dele. Trocar o ref
//   sem trocar o token da 401 no melhor caso; no pior, autentica numa conta e
//   aponta para a outra, e o erro so aparece como resultado estranho.
//
//   Trocar a mao e trocar um valor por vez — e e no meio dessa sequencia que o
//   ambiente fica meio prod, meio dev. Aqui os cinco entram juntos ou nenhum
//   entra: o arquivo de origem e validado ANTES de o `.env` ser escrito.
//
// O QUE ELE FAZ
//   1. Le `.env.<alvo>` e confere que os cinco valores estao preenchidos.
//   2. Escreve `.env` (o arquivo que TODO o resto le: Vite, os seeds, os testes).
//   3. Re-linka a CLI do Supabase no projeto certo, para `db push` nao ir para o
//      lugar errado — o link e estado do REPOSITORIO, nao da sessao.
//   4. Diz em voz alta qual projeto ficou ativo.
//
// O QUE ELE NAO FAZ
//   Nao imprime segredo. O que vai para o terminal e o ref e o host da URL, que
//   ja aparecem em qualquer requisicao. Terminal vira log, log vira anexo.

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ATIVO = resolve(ROOT, '.env')
const REF_GRAVADO = resolve(ROOT, 'supabase/.temp/project-ref')

const OBRIGATORIAS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
]

function abortar(mensagem) {
  console.error(`\n  ABORTADO: ${mensagem}\n`)
  process.exit(1)
}

function ler(caminho) {
  const valores = {}
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return valores
}

/* Host, e nao a URL inteira: basta para reconhecer o projeto e nao carrega
   caminho nem parametro. */
function host(url) {
  try {
    return new URL(url).host
  } catch {
    return '(url invalida)'
  }
}

const alvo = process.argv[2]

if (alvo === 'which') {
  if (!existsSync(ATIVO)) abortar('nao ha .env. Rode `npm run env:prod` ou `npm run env:dev`.')
  const atual = ler(ATIVO)
  const marca = atual.HAUSONE_ENV ?? '(desconhecido — .env escrito a mao?)'
  console.log(`\n  ambiente ativo: ${marca}`)
  console.log(`  projeto:        ${atual.SUPABASE_PROJECT_REF ?? '(sem ref)'}`)
  console.log(`  url:            ${host(atual.VITE_SUPABASE_URL ?? '')}\n`)
  process.exit(0)
}

if (alvo !== 'prod' && alvo !== 'dev') {
  abortar('uso: npm run env:prod | npm run env:dev | npm run env:which')
}

const origem = resolve(ROOT, `.env.${alvo}`)
if (!existsSync(origem)) {
  if (alvo === 'dev') {
    abortar(
      'nao existe .env.dev. Copie .env.dev.example para .env.dev e preencha com ' +
        'os valores do projeto de desenvolvimento — o proprio modelo diz onde achar cada um.',
    )
  }
  abortar(`nao existe .env.${alvo}.`)
}

const valores = ler(origem)

/* CONFERE ANTES DE ESCREVER. Escrever primeiro e validar depois deixaria o
   ambiente pela metade exatamente no caso que este script existe para evitar. */
const faltando = OBRIGATORIAS.filter((chave) => !valores[chave])
if (faltando.length > 0) {
  abortar(`.env.${alvo} esta incompleto. Sem valor: ${faltando.join(', ')}`)
}

/*
  O ref precisa bater com a URL. E a conferencia que pega a copia-e-cola de um
  projeto para o campo de outro — o erro mais provavel quando se mantem dois
  arquivos parecidos lado a lado, e o que faz um comando de migration apontar
  para um banco e autenticar contra outro.
*/
const hostUrl = host(valores.VITE_SUPABASE_URL)
if (!hostUrl.startsWith(`${valores.SUPABASE_PROJECT_REF}.`)) {
  abortar(
    `em .env.${alvo}, SUPABASE_PROJECT_REF (${valores.SUPABASE_PROJECT_REF}) nao ` +
      `corresponde a VITE_SUPABASE_URL (${hostUrl}). Um dos dois e de outro projeto.`,
  )
}

const cabecalho = [
  '# ARQUIVO GERADO — nao edite aqui.',
  `# Copia de .env.${alvo}, escrita por \`npm run env:${alvo}\`.`,
  '# Edite .env.prod ou .env.dev e rode o comando de novo; o que for escrito',
  '# direto neste arquivo some na proxima troca.',
  `HAUSONE_ENV=${alvo}`,
  '',
].join('\n')

writeFileSync(ATIVO, cabecalho + readFileSync(origem, 'utf8'))
chmodSync(ATIVO, 0o600)

/*
  O LINK DA CLI E ESTADO DO REPOSITORIO (supabase/.temp/project-ref), e nao da
  sessao: sem este passo, `supabase db push` continuaria mirando o projeto de
  antes mesmo com o .env trocado — e migration aplicada no banco errado nao tem
  desfazer.
*/
try {
  execFileSync('npx', ['supabase', 'link', '--project-ref', valores.SUPABASE_PROJECT_REF], {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: valores.SUPABASE_ACCESS_TOKEN,
      ...(valores.SUPABASE_DB_PASSWORD ? { SUPABASE_DB_PASSWORD: valores.SUPABASE_DB_PASSWORD } : {}),
    },
  })
} catch (erro) {
  /*
    CODIGO DE SAIDA NAO E A RESPOSTA AQUI — o RESULTADO e.

    A CLI do Supabase sai diferente de zero por motivo que nao tem nada a ver com
    o link: "Timeout while shutting down PostHog" e a telemetria dela nao
    conseguindo despachar evento, DEPOIS de gravar o vinculo. Abortar por isso
    faria um comando que funcionou parecer quebrado, e — pior — mandaria a pessoa
    "resolver" algo que ja esta certo.

    O que decide e o arquivo que o link escreve. Se ele traz o ref pedido, o
    vinculo esta feito; senao, o erro e real e sobe com a saida da CLI.
  */
  const saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`.trim()
  const gravado = existsSync(REF_GRAVADO) ? readFileSync(REF_GRAVADO, 'utf8').trim() : null

  if (gravado !== valores.SUPABASE_PROJECT_REF) {
    abortar(
      `o .env foi trocado, mas o link da CLI falhou — NAO rode migration antes de resolver.\n` +
        `  ${saida.split('\n').slice(-3).join('\n  ')}`,
    )
  }
}

console.log(`\n  ambiente ativo: ${alvo}`)
console.log(`  projeto:        ${valores.SUPABASE_PROJECT_REF}`)
console.log(`  url:            ${hostUrl}`)
if (alvo === 'prod') {
  console.log('\n  ATENCAO: producao. Este banco tem o dado real do escritorio.')
}
console.log('')
