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
        `flex-1` SEM `min-h-0`, e a diferenca importa. Com ele, a area da pagina
        ocupa a altura que sobra quando a pagina e curta (que e o que permite a
        tela do Fluxo ter quadro de altura fixa e cabecalho parado) e CRESCE
        quando a pagina e longa, porque `min-height: auto` continua valendo.
        Pondo `min-h-0` aqui, toda pagina longa passaria a ser cortada em vez de
        rolar.
      */
      className="flex-1 min-h-0 flex flex-col"
    >
      {children}
    </motion.div>
  )
}
