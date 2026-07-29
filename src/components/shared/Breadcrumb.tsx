import { Fragment } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Home } from 'lucide-react'
import { createPageUrl } from '@/lib/page-url'
import type { BreadcrumbItem } from './useBreadcrumb'

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (!items || items.length === 0) return null

  return (
    <nav className="flex items-center gap-2 text-sm text-slate-600 mb-4">
      <Link
        to={createPageUrl('Dashboard')}
        className="flex items-center gap-1 hover:text-slate-900 transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <Fragment key={index}>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            {isLast || !item.page ? (
              <span className="text-slate-900 font-medium">{item.label}</span>
            ) : (
              <Link to={createPageUrl(item.page)} className="hover:text-slate-900 transition-colors">
                {item.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
