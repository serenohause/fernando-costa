import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { motion, useMotionValue, useTransform } from 'motion/react'

type PullToRefreshProps = {
  onRefresh: () => Promise<unknown>
  children: ReactNode
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const startY = useRef(0)
  const scrollY = useMotionValue(0)
  const pullProgress = useTransform(scrollY, [0, 100], [0, 1])

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    if (container.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      setIsPulling(true)
    }
  }

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isPulling) return

    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current

    if (diff > 0) {
      scrollY.set(Math.min(diff * 0.5, 100))
    }
  }

  const handleTouchEnd = async () => {
    if (!isPulling) return

    const currentScroll = scrollY.get()
    setIsPulling(false)

    if (currentScroll >= 80) {
      setIsRefreshing(true)
      await onRefresh()
      setTimeout(() => {
        setIsRefreshing(false)
        scrollY.set(0)
      }, 500)
    } else {
      scrollY.set(0)
    }
  }

  return (
    <div
      className="relative h-full overflow-y-auto overscroll-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* pointer-events-none: this element never traps clicks or creates stacking issues */}
      <motion.div
        className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none"
        style={{ height: scrollY, opacity: pullProgress, zIndex: 1 }}
      >
        <RefreshCw
          className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`}
        />
      </motion.div>
      {children}
    </div>
  )
}
