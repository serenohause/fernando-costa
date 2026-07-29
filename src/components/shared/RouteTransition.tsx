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
    >
      {children}
    </motion.div>
  )
}
