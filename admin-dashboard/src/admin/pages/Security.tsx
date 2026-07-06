import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { ShieldAlert, ShieldCheck, Search, AlertOctagon, Lock, EyeOff, Activity, RefreshCw } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { useSecurity, useResolveAlert } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, staggerContainer, SkeletonMetricGrid } from '../ui';

export function Security() {
  const { data, isLoading, error, refetch, isFetching } = useSecurity();
  const resolveAlert = useResolveAlert();
  const [search, setSearch] = useState('');

  const threats = useMemo(() => {
    const list = data?.threats || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((t: any) => t.type?.toLowerCase().includes(q) || t.message?.toLowerCase().includes(q) || t.source?.toLowerCase().includes(q));
  }, [data, search]);

  const stats = data?.stats || {};

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Security & Compliance"
        subtitle="System alerts, verification failures, and guardrail status."
        icon={ShieldAlert}
        iconClassName="text-rose-500"
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Loading security signals..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Active Alerts" value={stats.activeAlerts ?? 0} icon={ShieldAlert} accent="rose" />
            <MetricCard label="Critical Alerts" value={stats.criticalAlerts ?? 0} icon={AlertOctagon} accent="amber" />
            <MetricCard label="Verification Failures" value={stats.verificationFailures ?? 0} icon={EyeOff} accent="violet" />
            <MetricCard label="Guardrail Pass Rate" value={stats.guardrailPassRate ?? 0} suffix="%" icon={Lock} accent="emerald" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel
              title="Recent Security Events"
              className="lg:col-span-2"
              flush
              actions={
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alerts..." className="pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 w-56" />
                </div>
              }
            >
              {threats.length === 0 ? (
                <EmptyState message="No active security alerts" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 font-medium">Alert</th>
                        <th className="px-6 py-3 font-medium">Severity</th>
                        <th className="px-6 py-3 font-medium">Source</th>
                        <th className="px-6 py-3 font-medium">Time</th>
                        <th className="px-6 py-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {threats.map((t: any) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white">{t.message}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">{t.type}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn('px-2.5 py-1 text-[10px] uppercase font-bold rounded inline-block', t.severity === 'critical' ? 'bg-rose-500 text-white' : t.severity === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-300')}>
                              {t.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-gray-400 font-mono text-xs">{t.source}</td>
                          <td className="px-6 py-4 text-slate-500 text-xs">{t.timestamp ? new Date(t.timestamp).toLocaleString() : '—'}</td>
                          <td className="px-6 py-4 text-right">
                            {t.status === 'resolved' ? (
                              <span className="px-2.5 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1 bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-400"><ShieldCheck className="w-3 h-3" /> Resolved</span>
                            ) : (
                              <Button variant="danger" size="sm" onClick={() => resolveAlert.mutate(t.id)} disabled={resolveAlert.isPending} icon={<AlertOctagon className="w-3 h-3" />}>Resolve</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Alert Volume" subtitle="Over 24h" icon={<Activity className="w-4 h-4 text-rose-500" />}>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.alertTimeline || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAttacks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8883" />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="events" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorAttacks)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
