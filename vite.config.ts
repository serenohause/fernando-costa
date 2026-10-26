import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

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
export default defineConfig({
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
        página de venda do produto: HTML e CSS, sem React e sem sessão, servida
        em /lp. São públicos diferentes — um escritório que já é cliente e um
        arquiteto que ainda não é — e por isso não compartilham bundle nenhum:
        quem abre a LP não baixa o React, e quem abre o app não baixa a LP.
      */
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lp: fileURLToPath(new URL('./lp/index.html', import.meta.url)),
      },
    },
  },
})
