import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* Porta de projeto-original/src/components/shared/PageHeader.jsx. */
export default function PageHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  icon: Icon,
}: {
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  icon?: LucideIcon
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actionLabel && (
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={onAction}
            className="bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 transition-all hover:shadow-xl hover:shadow-slate-900/30"
          >
            {Icon ? <Icon className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {actionLabel}
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}
