import { cn } from '../../lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md bg-slate-200/40 dark:bg-white/5', className)} />;
}

/** Skeleton shaped like a MetricCard. */
export function SkeletonMetric() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-11 h-11 rounded-xl" />
        <Skeleton className="w-12 h-5 rounded-full" />
      </div>
      <Skeleton className="w-24 h-3 mb-3" />
      <Skeleton className="w-20 h-7" />
    </div>
  );
}

/** A responsive grid of metric skeletons. */
export function SkeletonMetricGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMetric key={i} />
      ))}
    </div>
  );
}

/** Skeleton rows for a table body. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
