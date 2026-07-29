import { Fragment } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Home } from 'lucide-react'
import { createPageUrl } from '@/lib/page-url'
import type { BreadcrumbItem } from './useBreadcrumb'

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (!items || items.length === 0) return null

  return (
    <nav className="flex items-center gap-2 text-sm text-soft mb-4">
      <Link
        to={createPageUrl('Dashboard')}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <Fragment key={index}>
            <ChevronRight className="w-3.5 h-3.5 text-faint" />
            {isLast || !item.page ? (
              <span className="text-foreground font-medium">{item.label}</span>
            ) : (
              <Link to={createPageUrl(item.page)} className="hover:text-foreground transition-colors">
                {item.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
