import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { Flag, Search, Users, ToggleRight, ToggleLeft, CircleDot } from 'lucide-react';
import { useFeatureFlags, useToggleFeatureFlag } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, staggerContainer, SkeletonMetricGrid } from '../ui';

export function FeatureFlags() {
  const { data, isLoading, error, refetch } = useFeatureFlags();
  const toggle = useToggleFeatureFlag();
  const [search, setSearch] = useState('');

  const flags = useMemo(() => {
    const list = data?.flags || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((f: any) => f.name?.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q));
  }, [data, search]);

  const total = (data?.flags || []).length;
  const enabled = (data?.flags || []).filter((f: any) => f.enabled).length;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Feature Flags" subtitle="Toggle runtime feature flags and kill switches." icon={Flag} iconClassName="text-slate-500" />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid count={3} /><LoadingState label="Loading feature flags..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Total Flags" value={total} icon={Flag} accent="indigo" />
            <MetricCard label="Enabled" value={enabled} icon={ToggleRight} accent="emerald" />
            <MetricCard label="Disabled" value={total - enabled} icon={ToggleLeft} accent="slate" />
          </motion.div>

          <Panel
            flush
            title="Runtime Flags"
            icon={<CircleDot className="w-4 h-4 text-indigo-500" />}
            actions={
              <div className="flex items-center gap-3">
                {toggle.isError && <span className="text-xs text-rose-500">Update failed — reverted.</span>}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flags..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-60" />
                </div>
              </div>
            }
          >
            {flags.length === 0 ? (
              <EmptyState message="No feature flags configured" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">Flag</th>
                      <th className="px-6 py-4 font-medium">Scope</th>
                      <th className="px-6 py-4 font-medium">Enabled</th>
                      <th className="px-6 py-4 font-medium">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {flags.map((flag: any) => (
                      <tr key={flag.name} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900 dark:text-white font-mono text-[13px]">{flag.name}</div>
                          <div className="text-xs text-slate-500 mt-1 whitespace-normal max-w-md">{flag.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-gray-300 w-max">
                            <Users className="w-3 h-3" /> {flag.scope}{flag.targetCount > 0 && <span className="text-slate-400">({flag.targetCount})</span>}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggle.mutate({ name: flag.name, enabled: !flag.enabled })}
                            disabled={toggle.isPending}
                            className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-70', flag.enabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700')}
                            aria-label={`Toggle ${flag.name}`}
                          >
                            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', flag.enabled ? 'translate-x-6' : 'translate-x-1')} />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{flag.updatedAt ? new Date(flag.updatedAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
