import { DatabaseBackup } from 'lucide-react';
import { useBackups } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, Panel } from '../ui';

export function Backups() {
  const { data, isLoading, error, refetch } = useBackups();

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Backup Manager" subtitle="Database snapshot and export status." icon={DatabaseBackup} iconClassName="text-emerald-500" />

      {isLoading ? (
        <LoadingState label="Checking backup status..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <DataNotice note={data.note} />
          <Panel>
            {(data.backups || []).length === 0 ? (
              <EmptyState message="No application-managed backups. Firestore backups are configured in Google Cloud (scheduled exports / PITR)." />
            ) : (
              <div className="space-y-2">
                {data.backups.map((b: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                    <span className="text-slate-700 dark:text-gray-200">{b.name || b.id}</span>
                    <span className="text-xs text-slate-500">{b.createdAt ? new Date(b.createdAt).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
