import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="w-[260px] border-r border-border p-3 space-y-4">
        <div className="flex items-center gap-2.5 px-2 h-14">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="space-y-1 px-1">
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-3/4 rounded-md" />
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1">
        <div className="h-12 border-b border-border" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
