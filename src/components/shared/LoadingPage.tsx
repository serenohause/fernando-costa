import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingPage() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Content skeleton */}
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <div className="pt-4">
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    </div>
  )
}
