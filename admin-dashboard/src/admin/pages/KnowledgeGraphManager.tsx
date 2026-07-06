import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { Network, Search, RefreshCw, AlertTriangle, GitFork, Layers, Boxes, LayoutDashboard, Share2 } from 'lucide-react';
import { useKnowledgeGraph } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, staggerContainer, SkeletonMetricGrid } from '../ui';
import { KnowledgeGraphViewer } from 'shared-ui';

export function KnowledgeGraphManager() {
  const { data, isLoading, error, refetch, isFetching } = useKnowledgeGraph();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'VISUALIZER' | 'NODES'>('OVERVIEW');

  const nodes = useMemo(() => {
    const list = data?.nodes || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((n: any) => n.concept?.toLowerCase().includes(q) || n.type?.toLowerCase().includes(q));
  }, [data, search]);

  const edges = useMemo(() => {
    return data?.edges || [];
  }, [data]);

  const stats = data?.stats || {};

  const tabs = [
    { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
    { id: 'VISUALIZER', label: 'Visualizer', icon: Share2 },
    { id: 'NODES', label: 'Concept Nodes', icon: Layers },
  ] as const;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      <PageHeader
        title="Knowledge Graph Console"
        subtitle="Platform-wide concept nodes, relationships, and analytics."
        icon={Network}
        iconClassName="text-fuchsia-600"
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-fuchsia-500 text-fuchsia-600 dark:text-fuchsia-400"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:hover:text-gray-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar space-y-6 pb-20">
        {isLoading ? (
          <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Aggregating knowledge graph..." /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <>
            {data.note && <DataNotice note={data.note} />}

            {/* OVERVIEW TAB */}
            {activeTab === 'OVERVIEW' && (
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Total Nodes" value={stats.totalNodes ?? 0} icon={Network} accent="fuchsia" />
                <MetricCard label="Total Edges" value={stats.totalEdges ?? 0} icon={GitFork} accent="violet" />
                <MetricCard label="Weak Concepts (sample)" value={stats.weakConceptsInSample ?? 0} icon={AlertTriangle} accent="amber" />
                <MetricCard label="Sample Size" value={stats.sampleSize ?? 0} icon={Boxes} accent="slate" />
                <MetricCard label="Edges (sample)" value={stats.edgesSampleSize ?? 0} icon={GitFork} accent="emerald" />
              </motion.div>
            )}

            {/* VISUALIZER TAB */}
            {activeTab === 'VISUALIZER' && (
              <div className="h-[600px] rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden relative bg-white dark:bg-[#121212]">
                <KnowledgeGraphViewer nodes={nodes} edges={edges} />
                {/* Triggering hot reload */}
              </div>
            )}

            {/* NODES TAB */}
            {activeTab === 'NODES' && (
              <Panel
                title="Concept Nodes"
                icon={<Layers className="w-4 h-4 text-fuchsia-500" />}
                flush
                actions={
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{nodes.length} shown</span>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search concepts or types..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 w-64" />
                    </div>
                  </div>
                }
              >
                {nodes.length === 0 ? (
                  <EmptyState message="No knowledge graph nodes found." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                        <tr>
                          <th className="px-6 py-3 font-medium">Concept</th>
                          <th className="px-6 py-3 font-medium">Type</th>
                          <th className="px-6 py-3 font-medium">Prerequisites</th>
                          <th className="px-6 py-3 font-medium">Status</th>
                          <th className="px-6 py-3 font-medium">Mastery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {nodes.map((node: any) => {
                          const mastery = typeof node.masteryPercentage === 'number' ? node.masteryPercentage : null;
                          return (
                            <tr key={node.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-900 dark:text-white">{node.concept}</div>
                                <div className="text-xs text-slate-500 font-mono mt-0.5">{node.id}</div>
                              </td>
                              <td className="px-6 py-4 text-slate-600 dark:text-gray-300">
                                <span className="px-2 py-1 bg-slate-100 dark:bg-white/10 rounded text-xs">{node.type}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-gray-300">
                                  <Network className="w-4 h-4 text-slate-400" />{node.connections}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn('px-2.5 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1', node.status === 'strong' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : node.status === 'weak' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : node.status === 'developing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-300')}>
                                  {node.status === 'weak' && <AlertTriangle className="w-3 h-3" />}{node.status}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {mastery == null ? (
                                  <span className="text-xs text-slate-400">n/a</span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                                      <div className={cn('h-full', mastery < 40 ? 'bg-rose-500' : mastery < 75 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${mastery}%` }} />
                                    </div>
                                    <span className="text-xs font-medium text-slate-500">{Math.round(mastery)}%</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
