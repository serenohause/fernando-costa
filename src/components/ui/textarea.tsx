import * as React from 'react'

import { cn } from '@/lib/utils'

/* v4: `shadow-xs` == `shadow-sm` do v3; `outline-hidden` == `outline-none` do v3. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-selectable',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
