import { AlignLeft, Download, RefreshCw } from 'lucide-react';
import { useLogs } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, Button } from '../ui';

export function Logs() {
  const { data, isLoading, error, refetch, isFetching } = useLogs();
  const logs = data?.logs || [];

  const levelColor = (level: string) => (level === 'error' ? 'text-rose-400' : level === 'warn' ? 'text-amber-400' : 'text-emerald-400');

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="System Logs"
        subtitle="System alert event stream from Firestore."
        icon={AlignLeft}
        iconClassName="text-slate-500"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
            <Button variant="secondary" size="sm" icon={<Download className="w-4 h-4" />} onClick={exportLogs} disabled={logs.length === 0}>Export</Button>
          </div>
        }
      />

      {isLoading ? (
        <LoadingState label="Loading log events..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}
          <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-[#0b0b0d] p-4 font-mono text-[13px] leading-relaxed overflow-y-auto custom-scrollbar shadow-sm" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            {logs.length === 0 ? (
              <EmptyState message="No log events recorded" />
            ) : (
              logs.map((log: any) => (
                <div key={log.id} className={levelColor(log.level)}>
                  [{new Date(log.timestamp).toISOString()}] {String(log.level).toUpperCase()} ({log.type}): {log.message}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
