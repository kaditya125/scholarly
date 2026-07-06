import { motion } from 'motion/react';
import {
  HeartPulse, Server, Cpu, HardDrive, MemoryStick, ShieldCheck, Clock, RefreshCw
} from 'lucide-react';
import { useSystemHealth } from '../../lib/api/hooks';
import { LoadingState, ErrorState } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, Badge, statusTone, staggerContainer, SkeletonMetricGrid } from '../ui';

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function SystemHealth() {
  const { data, isLoading, error, refetch, isFetching } = useSystemHealth();

  const mem = data?.memory;
  const heapPct = mem && mem.heapTotalMB > 0 ? Math.round((mem.heapUsedMB / mem.heapTotalMB) * 100) : 0;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="System Health"
        subtitle="Live process metrics and dependency status."
        icon={HeartPulse}
        iconClassName="text-rose-500"
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Probing services..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="System Status" value={String(data.status)} icon={HeartPulse} accent="rose" status={{ label: `${data.activeAlerts ?? 0} alerts`, tone: (data.activeAlerts ?? 0) > 0 ? 'warning' : 'success' }} />
            <MetricCard label="Uptime" value={formatUptime(data.uptimeSeconds)} icon={Clock} accent="indigo" />
            <MetricCard label="System Memory" value={mem?.systemUsedPct ?? 0} suffix="%" icon={HardDrive} accent="blue" />
            <MetricCard label="Process Heap" value={heapPct} suffix="%" icon={MemoryStick} accent="violet" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel title="Core Services" className="lg:col-span-1" flush>
              <div className="p-2">
                {(data.services || []).map((service: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center gap-3">
                      <Server className="w-5 h-5 text-slate-400" />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">{service.name}</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{service.detail}</div>
                      </div>
                    </div>
                    <Badge tone={statusTone(service.status)} dot>
                      {service.status === 'not_configured' ? 'Not Configured' : service.status === 'operational' ? 'Operational' : 'Degraded'}
                    </Badge>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Runtime Metrics" icon={<Cpu className="w-4 h-4 text-indigo-500" />} className="lg:col-span-2" footer={`CPU model: ${data.cpu?.model || 'unknown'} · Load average is 0 on Windows hosts.`}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <RuntimeStat label="CPU Cores" value={data.cpu?.cores ?? '—'} />
                <RuntimeStat label="Load Avg (1m)" value={data.cpu?.loadAvg1m ?? '—'} />
                <RuntimeStat label="RSS Memory" value={`${mem?.rssMB ?? 0} MB`} />
                <RuntimeStat label="Requests Today" value={data.requestsToday ?? 0} />
                <RuntimeStat label="Avg Latency" value={`${data.avgLatencyMs ?? 0}ms`} />
                <RuntimeStat label="Verification" value={`${data.verificationSuccessRate ?? 0}%`} icon={ShieldCheck} />
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function RuntimeStat({ label, value, icon: Icon }: any) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4 flex flex-col">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className="text-xl font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}
