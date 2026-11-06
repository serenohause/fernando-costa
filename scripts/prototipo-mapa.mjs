// SERVE O PROTOTIPO DO MAPA COM A CHAVE INJETADA NA HORA.
//
// COMO RODAR
//   node scripts/prototipo-mapa.mjs
//   Abre http://localhost:5173/
//
// POR QUE ELE EXISTE, e sao duas razoes que nao dava para contornar:
//
//   1. A CHAVE NAO PODE ENTRAR NO GIT. `prototypes/` e versionado, e chave de
//      Google commitada e chave queimada. Entao o HTML guarda so o marcador
//      `%VITE_GOOGLE_MAPS_API_KEY%`, e a substituicao acontece em memoria, no caminho
//      entre o disco e o navegador. Nada com a chave dentro toca o disco.
//
//   2. A PORTA TEM DE SER A 5173. A chave do navegador e restrita por site, e
//      `http://localhost:5173/*` e um dos enderecos autorizados. Servir em
//      outra porta daria RefererNotAllowedMapError, que e erro de configuracao
//      parecendo erro de codigo. Se a porta estiver ocupada pelo servidor do
//      Vite, este script para e diz para derrubar o outro primeiro, em vez de
//      cair numa porta qualquer.
//
// O QUE ELE NAO FAZ
//   Nao escreve nada, nao tem rota alem do proprio prototipo, e so escuta em
//   127.0.0.1. Nao e servidor de desenvolvimento do projeto: e so para olhar
//   este arquivo.

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 5173
const PAGINA = resolve(ROOT, 'prototypes/mapa-google.html')

/*
  O MESMO MARCADOR DOS DOIS LADOS. E a forma que o Vite substitui variavel em
  HTML (`%VITE_X%`), entao a pagina publicada em dev e a servida aqui usam um
  marcador so. Dois marcadores para o mesmo buraco seria um deles envelhecendo
  calado no dia em que alguem mexesse no outro.
*/
const MARCADOR = '%VITE_GOOGLE_MAPS_API_KEY%'

function fail(mensagem) {
  console.error(`\n  ABORTADO: ${mensagem}\n`)
  process.exit(1)
}

/*
  A CHAVE SAI DE `.env.dev`, E NAO DE `.env`. O `.env` e arquivo gerado por
  `npm run env:prod|dev`, e o cabecalho dele diz isso com todas as letras: o que
  for escrito la some na proxima troca. Ler a fonte evita que o prototipo passe
  a funcionar ou parar de funcionar conforme o ambiente ativo do momento.
*/
function chaveDoNavegador() {
  let texto
  try {
    texto = readFileSync(resolve(ROOT, '.env.dev'), 'utf8')
  } catch {
    fail('nao encontrei .env.dev')
  }
  for (const linha of texto.split('\n')) {
    const m = linha.match(/^\s*VITE_GOOGLE_MAPS_API_KEY\s*=\s*(.*)\s*$/)
    if (m) {
      const valor = m[1].replace(/^["']|["']$/g, '').trim()
      if (valor !== '') return valor
    }
  }
  fail(
    'VITE_GOOGLE_MAPS_API_KEY nao esta preenchida em .env.dev.\n' +
      '  Ela e a chave de NAVEGADOR: restrita por site, com so a Maps JavaScript API liberada.',
  )
}

const chave = chaveDoNavegador()

const servidor = createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end()
    return
  }

  /* Uma pagina so. Qualquer outro caminho e 404, inclusive favicon: este
     servidor nao serve arquivo do projeto, e nao vai virar um por acidente. */
  const caminho = (req.url ?? '/').split('?')[0]
  if (caminho !== '/' && caminho !== '/mapa-google.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Só existe / aqui.')
    return
  }

  let html
  try {
    html = readFileSync(PAGINA, 'utf8')
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('prototypes/mapa-google.html nao foi encontrado')
    return
  }

  if (!html.includes(MARCADOR)) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(
      `o prototipo nao tem o marcador ${MARCADOR}. ` +
        'Se alguem colou a chave direto no arquivo, TIRE: ele vai para o git.',
    )
    return
  }

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    /* Sem cache: editar o HTML e dar F5 tem de mostrar a edicao. */
    'cache-control': 'no-store',
  })
  res.end(html.replaceAll(MARCADOR, chave))
})

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    fail(
      `a porta ${PORTA} esta ocupada, provavelmente pelo servidor do Vite.\n` +
        '  Derrube o outro e rode de novo. Esta porta nao e escolha: e o endereco\n' +
        '  autorizado na restricao da chave do Google.',
    )
  }
  fail(erro.message)
})

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  Protótipo do mapa em http://localhost:${PORTA}/`)
  console.log('  A chave vem de .env.dev e não é gravada em lugar nenhum.')
  console.log('  Ctrl+C para parar.\n')
})
