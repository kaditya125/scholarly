import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { BrainCircuit, Target, AlertCircle, CheckCircle, Search } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { useEvaluation } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, staggerContainer, SkeletonMetricGrid } from '../ui';

const RATING_COLORS: Record<string, string> = {
  thumbs_up: '#10b981', very_helpful: '#059669', thumbs_down: '#f43f5e', incorrect: '#e11d48',
  hallucination: '#be123c', outdated: '#f59e0b', needs_citation: '#eab308', too_easy: '#38bdf8',
  too_hard: '#6366f1', report_issue: '#a855f7',
};

export function ContinuousEval() {
  const { data, isLoading, error, refetch } = useEvaluation();
  const [search, setSearch] = useState('');

  const distributionData = useMemo(
    () => Object.entries(data?.distribution || {}).filter(([, v]) => (v as number) > 0).map(([name, value]) => ({ name, value: value as number })),
    [data]
  );

  const failures = useMemo(() => {
    const list = data?.recentFailures || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((f: any) => f.topic?.toLowerCase().includes(q) || f.issue?.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Continuous Evaluation" subtitle="Quality signals derived from real user feedback." icon={BrainCircuit} />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid count={3} /><LoadingState label="Loading evaluation data..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Satisfaction Score" value={data.overallScore ?? 0} suffix="/10" decimals={1} icon={Target} accent="indigo" />
            <MetricCard label="Feedback This Week" value={data.evaluationsThisWeek ?? 0} icon={CheckCircle} accent="emerald" />
            <MetricCard label="Critical Failures (24h)" value={data.criticalFailures ?? 0} icon={AlertCircle} accent="rose" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel title="Feedback Distribution" subtitle="By rating type (7 days)" className="lg:col-span-1">
              <div className="h-[300px]">
                {distributionData.length === 0 ? (
                  <EmptyState message="No feedback recorded yet" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                      <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" stroke="#888" fontSize={10} width={90} tickLine={false} axisLine={false} />
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#8883" />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {distributionData.map((e) => <Cell key={e.name} fill={RATING_COLORS[e.name] || '#6366f1'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel title="Satisfaction Trend" subtitle="7 days" className="lg:col-span-2">
              <div className="h-[300px]">
                {(data.trendData || []).length === 0 ? (
                  <EmptyState message="No trend data yet" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8883" />
                      <XAxis dataKey="date" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} formatter={(value) => [`${value}%`, 'Satisfaction']} />
                      <Line type="monotone" dataKey="satisfactionRate" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: '#8b5cf6', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
          </div>

          <Panel
            title="Recent Negative Feedback"
            flush
            actions={
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by topic or issue..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
              </div>
            }
          >
            {failures.length === 0 ? (
              <EmptyState message="No negative feedback in range" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Topic / Mode</th>
                      <th className="px-6 py-3 font-medium">Issue</th>
                      <th className="px-6 py-3 font-medium">Provider</th>
                      <th className="px-6 py-3 font-medium">When</th>
                      <th className="px-6 py-3 font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {failures.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{item.topic}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300">{item.issue}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300 capitalize">{item.provider || '—'}</td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}</td>
                        <td className="px-6 py-4">
                          <span className={cn('px-2.5 py-1 text-xs font-medium rounded-full', item.severity === 'critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400')}>
                            {item.severity}
                          </span>
                        </td>
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
