import { motion } from 'motion/react';
import {
  Activity, Zap, ShieldCheck, AlertTriangle, MessageSquare, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useAIMetrics } from '../../lib/api/hooks';
import { LoadingState, ErrorState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, SkeletonMetricGrid, staggerContainer } from '../ui';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];

export function AIMonitoring() {
  const { data, isLoading, error, refetch, isFetching } = useAIMetrics();

  const providerPie = (data?.providers || []).map((p: any) => ({ name: p.name, value: p.requests }));
  const requestsSpark: number[] = (data?.timeline || []).map((t: any) => t.requests ?? 0);
  const hasTelemetry = (data?.requestsToday ?? 0) > 0 || providerPie.length > 0;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="AI Monitoring"
        subtitle="Live performance metrics and model utilization (last 24h)."
        icon={Activity}
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Loading AI telemetry..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {!hasTelemetry && (
            <DataNotice note="No AI telemetry has been recorded in the last 24 hours yet. Metrics populate as users interact with the AI. All values shown are real (currently zero)." />
          )}

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Requests Today" value={data.requestsToday ?? 0} icon={MessageSquare} accent="indigo" sparkline={requestsSpark} />
            <MetricCard label="Average Latency" value={data.avgLatencyMs ?? 0} suffix="ms" icon={Zap} accent="violet" />
            <MetricCard label="Verification Pass Rate" value={data.verificationSuccessRate ?? 0} suffix="%" icon={ShieldCheck} accent="emerald" />
            <MetricCard label="Active Alerts" value={data.activeAlerts ?? 0} icon={AlertTriangle} accent="amber" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Provider Utilization" subtitle="By request count">
              <div className="h-[300px]">
                {providerPie.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No provider activity yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={providerPie} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {providerPie.map((_e: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} itemStyle={{ color: '#fff' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel title="Avg Latency by Hour" subtitle="Milliseconds (real telemetry buckets)">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.timeline || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8883" />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} itemStyle={{ color: '#fff' }} />
                    <Area type="monotone" dataKey="avgLatencyMs" name="Avg latency" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorLat)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title="Provider Breakdown" flush>
            {(data.providers || []).length === 0 ? (
              <div className="text-sm text-slate-400 py-8 text-center">No provider requests recorded yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-gray-400 border-b border-slate-100 dark:border-white/5">
                      <th className="py-3 px-5 font-medium">Provider</th>
                      <th className="py-3 px-5 font-medium">Requests</th>
                      <th className="py-3 px-5 font-medium">Failures</th>
                      <th className="py-3 px-5 font-medium">Avg Latency</th>
                      <th className="py-3 px-5 font-medium">Tokens</th>
                      <th className="py-3 px-5 font-medium">Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providers.map((p: any) => (
                      <tr key={p.name} className="border-b border-slate-50 dark:border-white/5 text-slate-800 dark:text-gray-200 hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                        <td className="py-3 px-5 font-medium capitalize">{p.name}</td>
                        <td className="py-3 px-5">{p.requests}</td>
                        <td className={`py-3 px-5 ${p.failures > 0 ? 'text-rose-500' : ''}`}>{p.failures}</td>
                        <td className="py-3 px-5">{p.avgLatencyMs}ms</td>
                        <td className="py-3 px-5">{p.totalTokens?.toLocaleString?.() ?? p.totalTokens}</td>
                        <td className="py-3 px-5">${p.totalCostUSD}</td>
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
