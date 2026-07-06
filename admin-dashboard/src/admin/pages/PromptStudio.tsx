import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { FlaskConical, Sparkles, Activity, Clock, DollarSign, Server } from 'lucide-react';
import { usePrompts } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, Panel, Badge } from '../ui';

export function PromptStudio() {
  const { data, isLoading, error, refetch } = usePrompts();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const prompts = data?.prompts || [];
  const experiments = data?.experiments || [];
  const expensive = data?.mostExpensivePrompts || [];

  useEffect(() => {
    if (!selectedId && prompts.length > 0) setSelectedId(prompts[0].id);
  }, [prompts, selectedId]);

  const selected = prompts.find((p: any) => p.id === selectedId) || prompts[0];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Prompt Studio" subtitle="Prompt versions, usage, and A/B experiments (live telemetry)." icon={Sparkles} iconClassName="text-amber-500" />

      {isLoading ? (
        <LoadingState label="Loading prompt telemetry..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}

          <div className="flex flex-col lg:flex-row gap-6">
            <Panel title="Prompt Versions" flush className="w-full lg:w-80 shrink-0">
              <div className="p-2 space-y-1 max-h-[540px] overflow-y-auto custom-scrollbar">
                {prompts.length === 0 ? (
                  <EmptyState message="No prompt versions tracked yet" />
                ) : (
                  prompts.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={cn('w-full text-left p-3 rounded-xl transition-all', selected?.id === p.id ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent')}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className={cn('font-medium text-sm truncate', selected?.id === p.id ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-white')}>{p.name}</div>
                        <Badge tone="success">{p.status}</Badge>
                      </div>
                      <div className="text-xs text-slate-500 flex justify-between"><span className="capitalize">{p.provider}</span><span>{p.calls} calls</span></div>
                    </button>
                  ))
                )}
              </div>
            </Panel>

            <div className="flex-1 flex flex-col gap-6 min-w-0">
              <Panel title="Version Details" subtitle={selected?.id}>
                {selected ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DetailStat icon={Server} label="Provider" value={selected.provider} />
                    <DetailStat icon={Activity} label="Calls (30d)" value={Number(selected.calls).toLocaleString()} />
                    <DetailStat icon={Clock} label="Avg Latency" value={`${selected.avgLatencyMs}ms`} />
                    <DetailStat icon={DollarSign} label="Cost (30d)" value={`$${selected.costUSD}`} />
                  </div>
                ) : (
                  <EmptyState message="Select a prompt version" />
                )}
              </Panel>

              <Panel title="A/B Experiments" icon={<FlaskConical className="w-4 h-4 text-indigo-500" />} flush>
                {experiments.length === 0 ? (
                  <EmptyState message="No prompt experiments configured" />
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 font-medium">Experiment</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Variants</th>
                        <th className="px-6 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {experiments.map((e: any) => (
                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{e.name}</td>
                          <td className="px-6 py-4"><Badge tone="accent">{e.status}</Badge></td>
                          <td className="px-6 py-4 text-slate-600 dark:text-gray-300">{e.variants}</td>
                          <td className="px-6 py-4 text-slate-500 text-xs">{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              {expensive.length > 0 && (
                <Panel title="Most Expensive Prompts (30d)" icon={<DollarSign className="w-4 h-4 text-emerald-500" />} flush>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 font-medium">Prompt Version</th>
                        <th className="px-6 py-3 font-medium text-right">Calls</th>
                        <th className="px-6 py-3 font-medium text-right">Total Cost</th>
                        <th className="px-6 py-3 font-medium text-right">Avg Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {expensive.map((p: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-6 py-4 font-mono text-xs text-slate-900 dark:text-white">{p.prompt}</td>
                          <td className="px-6 py-4 text-right text-slate-600 dark:text-gray-300">{p.count}</td>
                          <td className="px-6 py-4 text-right text-slate-600 dark:text-gray-300">${p.totalCost?.toFixed?.(4) ?? p.totalCost}</td>
                          <td className="px-6 py-4 text-right text-slate-600 dark:text-gray-300">${p.avgCost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DetailStat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400 mb-1"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className="text-lg font-bold text-slate-900 dark:text-white capitalize truncate">{value}</div>
    </div>
  );
}
