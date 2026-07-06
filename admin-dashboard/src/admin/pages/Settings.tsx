import { Settings as SettingsIcon, Check, X } from 'lucide-react';
import { useSettings } from '../../lib/api/hooks';
import { LoadingState, ErrorState, DataNotice } from '../components/DataStates';
import { PageHeader, Panel } from '../ui';

export function Settings() {
  const { data, isLoading, error, refetch } = useSettings();
  const s = data?.settings || {};
  const flags = data?.featureFlags || [];

  const rows: Array<{ label: string; value: any; bool?: boolean }> = [
    { label: 'Environment', value: s.environment },
    { label: 'Port', value: s.port },
    { label: 'AI Provider', value: s.aiProvider },
    { label: 'Chat Model', value: s.chatModel },
    { label: 'Embedding Model', value: s.embeddingModel },
    { label: 'Pinecone Index', value: s.pineconeIndex },
    { label: 'Pinecone Namespace', value: s.pineconeNamespace },
    { label: 'CORS Allowlist Configured', value: s.corsConfigured, bool: true },
    { label: 'Redis Configured', value: s.redisConfigured, bool: true },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Global Settings" subtitle="Read-only runtime configuration." icon={SettingsIcon} iconClassName="text-slate-500" />

      {isLoading ? (
        <LoadingState label="Loading configuration..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Runtime Configuration" flush>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between px-6 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-gray-400">{r.label}</span>
                    {r.bool ? (
                      r.value ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="w-4 h-4" /> Yes</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-400"><X className="w-4 h-4" /> No</span>
                      )
                    ) : (
                      <span className="text-sm font-mono font-medium text-slate-900 dark:text-white">{r.value ?? '—'}</span>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={`Feature Flags (${flags.length})`} flush>
              <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[420px] overflow-y-auto custom-scrollbar">
                {flags.length === 0 ? (
                  <div className="px-6 py-6 text-sm text-slate-400">No feature flags configured.</div>
                ) : (
                  flags.map((f: any) => (
                    <div key={f.name} className="flex items-center justify-between px-6 py-3">
                      <span className="text-sm font-mono text-slate-700 dark:text-gray-300">{f.name}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${f.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-400'}`}>
                        {f.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
