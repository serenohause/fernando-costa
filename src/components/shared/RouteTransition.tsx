import type { ReactNode } from 'react'
import { motion } from 'motion/react'

// IMPORTANT: Only use opacity (no x/y/scale) to avoid creating stacking contexts
// that trap z-index and cause overlapping issues with modals/dropdowns.
export default function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={{ position: 'relative' }}
      /*
        `flex-1 min-h-0`, e os dois pedaços são necessários.

        `flex-1` faz a área da página ocupar a altura que sobra dentro do
        `PullToRefresh`. `min-h-0` é o que permite que ela ENCOLHA até essa
        altura: sem ele vale `min-height: auto`, a caixa para de encolher no
        tamanho do próprio conteúdo e a corrente não fecha. Medido: com `auto`,
        a tela do Fluxo pedia 898px dentro de um espaço de 736px e o quadro
        transbordava; com `min-h-0`, a conta fecha em 736 e o quadro fica com o
        que sobra. É isso que dá ao Fluxo um quadro de altura própria com o
        cabeçalho parado.

        E NÃO, ISSO NÃO CORTA PÁGINA LONGA, que é o medo óbvio de pôr
        `min-h-0` num elo que vale para todas as rotas. Quem rola é o
        `PullToRefresh`, que já era `overflow-y-auto` antes disto, e o conteúdo
        que transborda daqui entra na área rolável dele. Medido com a janela em
        760px: Painel Executivo tem 2102px de conteúdo, CRM 1517px, Contratos
        788px, e os três rolam até o fim.

        O que `min-h-0` muda de verdade é a altura da caixa deste elo, então um
        filho direto que use altura percentual (`h-full`) passa a resolver
        contra o espaço visível, e não contra o conteúdo. Nenhuma rota faz isso
        hoje.
      */
      className="flex-1 min-h-0 flex flex-col"
    >
      {children}
    </motion.div>
  )
}
