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

  Só na build, e só na LP: o index.html do app não é mexido aqui.
*/
function semComentariosNaLp(): Plugin {
  return {
    name: 'lp-sem-comentarios-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.path.endsWith('/lp/index.html')) return html
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

  return {
    plugins: [react(), tailwindcss(), semComentariosNaLp()],
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
        */
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          lp: fileURLToPath(new URL('./lp/index.html', import.meta.url)),
        },
      },
    },
  }
})
