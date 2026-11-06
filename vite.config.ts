import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/*
  A BUILD FALHA SE A LP NÃO TIVER PARA ONDE MANDAR O E-MAIL.

  `lp/lp.js` monta a URL da captura com `import.meta.env.VITE_SUPABASE_URL`, que
  o Vite CONGELA em tempo de build. Variável ausente ou vazia não quebra nada
  visível: a página sobe bonita, o visitante digita o e-mail, e o formulário
  responde "não foi possível enviar agora" para sempre. Ninguém descobre, porque
  do lado de fora isso parece instabilidade, e do lado de dentro a fila
  simplesmente não enche.

  Esse estado não é hipotético nesta base. O cabeçalho de `src/lib/env.ts`
  registra o dia em que a MESMA variável existiu VAZIA no painel da Vercel do
  ambiente de dev — alguém salvou o nome sem o valor — e derrubou o app com uma
  tela branca. Lá o remédio foi tratar vazio como ausente para o app SUBIR; aqui
  é o contrário, porque LP publicada sem captura é pior do que deploy que falha:
  deploy que falha avisa.

  Por que `loadEnv` e não `process.env`: o valor pode vir de um arquivo `.env`
  (desenvolvimento) ou do ambiente do processo (Vercel), e `loadEnv` enxerga os
  dois. `process.env` sozinho não vê o arquivo, e a conferência passaria a falhar
  justamente em quem fez tudo certo.
*/
function exigirDestinoDaCaptura(url: string | undefined): void {
  if (url !== undefined && url.trim() !== '') return

  throw new Error(
    'VITE_SUPABASE_URL ausente ou vazia. A landing page em /lp precisa dela para ' +
      'enviar o e-mail capturado; sem ela o formulário publicado recusaria todo ' +
      'envio em silêncio. Defina a variável e refaça a build.',
  )
}

/*
  Os comentários de lp/index.html não vão para a página publicada.

  Não é economia de bytes: é que o arquivo comenta coisa que não é para o
  visitante ler. O cabeçalho registra a lista de pendências, e dentro do corpo
  está escrito quais indicadores e depoimentos são SIMULADOS e quais links do
  rodapé não têm destino. Isso é documentação para quem mantém a página, e
  precisa continuar morando junto do markup que descreve — mas quem abre o
  código-fonte da página no navegador não tem nada a ver com isso.

  O que a página DIZ ao visitante sobre dado simulado continua dito em voz alta,
  no texto visível da própria seção. Esconder o comentário não esconde a
  ressalva; a ressalva é conteúdo, e está lá.

  VALE TAMBÉM PARA O PROTÓTIPO DO MAPA, pelo mesmo motivo e com mais força: o
  cabeçalho dele registra decisão de arquitetura, número de propriedade por
  cidade do escritório e o que ali é encenado. Isso é para quem mantém, não
  para quem abre o código-fonte da página.

  Só na build, e só nessas duas: o index.html do app não é mexido aqui.
*/
function semComentariosNoHtmlEstatico(): Plugin {
  return {
    name: 'sem-comentarios-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const comentarioNaoEPagina =
          ctx.path.endsWith('/lp/index.html') ||
          ctx.path.endsWith('/prototypes/mapa-google.html')
        if (!comentarioNaoEPagina) return html
        /* O único <script> em linha da LP é o de pré-pintura, e nele não existe
           a sequência `<!--`; o resto do JS mora em lp/lp.js. Sem isso, um
           regex de comentário poderia comer trecho de script. */
        return html.replace(/<!--[\s\S]*?-->\n?/g, '')
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  /* Só na build. Em desenvolvimento a variável pode faltar enquanto alguém
     mexe no `.env`, e derrubar o dev server por isso atrapalharia em vez de
     proteger — o que a conferência evita é PUBLICAR errado. */
  if (command === 'build') {
    exigirDestinoDaCaptura(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL)
  }

  /*
    O PROTÓTIPO DO MAPA SÓ ENTRA NA BUILD FORA DA BRANCH `main`, e precisa da
    chave do Google para ser qualquer coisa. As duas condições juntas.

    A CONDIÇÃO ERA SÓ A CHAVE, e isso parou de funcionar no dia em que a tela do
    mapa virou Google: produção passou a precisar da mesma variável para
    desenhar o mapa de verdade, e com ela o protótipo seria publicado em
    www.hausone.com.br. Página de trabalho, com 253 pinos inventados, aberta sem
    login num domínio de cliente, gastando carga de mapa cobrada.

    `VERCEL_GIT_COMMIT_REF` é a branch que originou a build, e é a única coisa
    que distingue os dois ambientes aqui: `mode` é 'production' nos dois, e
    `VERCEL_ENV` também, porque o projeto de dev publica a branch `dev` como
    produção dele. Fora da Vercel a variável não existe, e aí o protótipo é
    gerado normalmente, que é o que se quer rodando `npm run build` na máquina.
  */
  const branchDaBuild = process.env.VERCEL_GIT_COMMIT_REF
  const chaveDoMapa = loadEnv(mode, process.cwd(), 'VITE_').VITE_GOOGLE_MAPS_API_KEY
  const publicarPrototipo =
    branchDaBuild !== 'main' && chaveDoMapa !== undefined && chaveDoMapa.trim() !== ''

  return {
    plugins: [react(), tailwindcss(), semComentariosNoHtmlEstatico()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        /*
          DUAS PÁGINAS, UM DEPLOY.

          `index.html` é o app (React, Supabase, sessão). `lp/index.html` é a
          página de venda do produto: HTML e CSS, sem React e sem sessão,
          servida em /lp. São públicos diferentes — um escritório que já é
          cliente e um arquiteto que ainda não é — e por isso não compartilham
          bundle nenhum: quem abre a LP não baixa o React, e quem abre o app
          não baixa a LP.

          A terceira, quando existe, é o protótipo do mapa, em
          /prototypes/mapa-google.html. Ela é página de TRABALHO: existe para o
          escritório olhar o mapa novo antes de ele virar tela, e não é gerada
          em build de `main`. Ver o comentário de `publicarPrototipo` acima.
        */
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          lp: fileURLToPath(new URL('./lp/index.html', import.meta.url)),
          ...(publicarPrototipo
            ? {
                prototipoMapa: fileURLToPath(
                  new URL('./prototypes/mapa-google.html', import.meta.url),
                ),
              }
            : {}),
        },
      },
    },
  }
})
