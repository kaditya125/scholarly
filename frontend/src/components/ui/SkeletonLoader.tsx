export function SkeletonLoader({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-md ${className || 'h-4 w-full'}`} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-32 flex flex-col justify-between">
            <SkeletonLoader className="w-1/2 h-4" />
            <SkeletonLoader className="w-1/3 h-8 mt-4" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-96">
          <SkeletonLoader className="w-1/4 h-6 mb-8" />
          <div className="space-y-4">
            <SkeletonLoader className="w-full h-8" />
            <SkeletonLoader className="w-full h-8" />
            <SkeletonLoader className="w-full h-8" />
            <SkeletonLoader className="w-full h-8" />
          </div>
        </div>
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-96">
          <SkeletonLoader className="w-1/2 h-6 mb-8" />
          <div className="space-y-6">
            <SkeletonLoader className="w-full h-16 rounded-xl" />
            <SkeletonLoader className="w-full h-16 rounded-xl" />
            <SkeletonLoader className="w-full h-16 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
