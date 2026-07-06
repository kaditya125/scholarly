import { Loader2, AlertTriangle, Inbox, Info, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { apiErrorMessage } from '../../lib/api/client';

/** Full-panel loading spinner shown while a query is in flight. */
export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading live data...' }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-gray-500">
    <div className="relative">
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    </div>
    <span className="mt-4 text-sm">{label}</span>
  </div>
);

/** Error panel with a retry action. */
export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 text-center"
  >
    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
      <AlertTriangle className="w-7 h-7 text-rose-500" />
    </div>
    <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-gray-200">Failed to load data</p>
    <p className="mt-1 text-xs text-slate-500 max-w-md">{apiErrorMessage(error)}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 px-4 py-2 text-sm font-medium text-slate-700 dark:text-gray-200 transition-colors active:scale-[0.97]"
      >
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    )}
  </motion.div>
);

/** Empty-state placeholder when a real query returns no rows. */
export const EmptyState: React.FC<{ message?: string }> = ({ message = 'No data available yet.' }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-gray-500"
  >
    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
      <Inbox className="w-8 h-8 text-slate-400 dark:text-gray-500" />
    </div>
    <p className="mt-4 text-sm max-w-sm text-center">{message}</p>
  </motion.div>
);

/** Honest note banner (e.g. "derived from admin_alerts", "managed by GCP"). */
export const DataNotice: React.FC<{ note?: string | null }> = ({ note }) => {
  if (!note) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
      <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span className="leading-relaxed">{note}</span>
    </div>
  );
};
