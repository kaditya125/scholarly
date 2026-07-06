import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { Bell, RefreshCw, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { useNotifications } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, Panel, Button, staggerContainer, cardItem } from '../ui';

export function Notifications() {
  const { data, isLoading, error, refetch, isFetching } = useNotifications();
  const notifications = data?.notifications || [];

  const icon = (severity: string) =>
    severity === 'critical' ? <AlertOctagon className="w-5 h-5 text-rose-500" /> :
    severity === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> :
    <Info className="w-5 h-5 text-sky-500" />;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Notification Center"
        subtitle="System notifications from unresolved alerts."
        icon={Bell}
        iconClassName="text-amber-500"
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <LoadingState label="Loading notifications..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}
          {notifications.length === 0 ? (
            <Panel><EmptyState message="No active notifications" /></Panel>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
              {notifications.map((n: any) => (
                <motion.div key={n.id} variants={cardItem} className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a] shadow-sm hover:shadow-md transition-shadow">
                  <div className="mt-0.5">{icon(n.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white capitalize">{String(n.title).replace('_', ' ')}</span>
                      <span className={cn('px-2 py-0.5 text-[10px] uppercase font-bold rounded', n.severity === 'critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' : n.severity === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400')}>{n.severity}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-gray-300 mt-1">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
