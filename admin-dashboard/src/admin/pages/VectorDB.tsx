import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Database, Server, RefreshCw, Search, BarChart3, Layers, Boxes, Trash2, Cpu, FileText, CheckCircle2, XCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { useVectorDB, useDeleteNamespace, useVectorQuery, useIngestionJobs } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, Badge, staggerContainer, SkeletonMetricGrid } from '../ui';

// Beautiful color palette for the pie chart
const PIE_COLORS = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

export function VectorDB() {
  const { data, isLoading, error, refetch, isFetching } = useVectorDB();
  const { data: jobsData, isLoading: jobsLoading } = useIngestionJobs();
  
  const deleteMutation = useDeleteNamespace();
  const queryMutation = useVectorQuery();

  const [search, setSearch] = useState('');
  const [queryText, setQueryText] = useState('');
  const [queryNamespace, setQueryNamespace] = useState('production');
  const [queryResults, setQueryResults] = useState<any[] | null>(null);

  const namespaces = useMemo(() => {
    const list = data?.namespaces || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((ns: any) => ns.name?.toLowerCase().includes(q));
  }, [data, search]);

  const perNamespace = (data?.namespaces || []).map((ns: any) => ({ name: ns.name, count: ns.vectorCount }));
  const curriculumStats = data?.curriculumStats || [];
  const fullnessPct = Math.round(((data?.indexFullness ?? 0) as number) * 100);

  const handleDelete = async (nsName: string) => {
    if (confirm(`Are you sure you want to delete ALL vectors in namespace "${nsName}"? This cannot be undone.`)) {
      await deleteMutation.mutateAsync(nsName);
    }
  };

  const handleTestQuery = async () => {
    if (!queryText.trim()) return;
    setQueryResults(null);
    try {
      const results = await queryMutation.mutateAsync({ query: queryText, namespace: queryNamespace });
      setQueryResults(results);
    } catch (e) {
      console.error(e);
      alert('Failed to execute query.');
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Vector Database"
        subtitle="Live Pinecone namespaces, vector counts, and ingestion jobs."
        icon={Database}
        iconClassName="text-sky-500"
        actions={<Button size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Querying Pinecone..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data ? (
        <EmptyState message="No vector database stats available" />
      ) : (
        <>
          <DataNotice note={`Live statistics from Pinecone index "${data?.indexName || 'N/A'}" (dimension ${data?.dimension || 0}).`} />

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard label="Namespaces" value={(data?.namespaces || []).length} icon={Layers} accent="sky" />
            <MetricCard label="Total Vectors" value={data?.totalVectors ?? 0} icon={BarChart3} accent="indigo" />
            <MetricCard label="Index Fullness" value={fullnessPct} suffix="%" icon={Server} accent="emerald" />
            <MetricCard label="Dimension" value={data?.dimension ?? 0} icon={Boxes} accent="violet" />
            <MetricCard label="Embedding Model" value={data?.embeddingModel ?? 'text-embedding-004'} icon={Cpu} accent="fuchsia" />
          </motion.div>

          {/* Test Retrieval Playground */}
          <Panel title="Vector Search Playground" subtitle="Test the embedding model against live Pinecone data">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2 w-full">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Semantic Query</label>
                <input 
                  type="text" 
                  value={queryText}
                  onChange={e => setQueryText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTestQuery()}
                  placeholder="e.g., 'What is the powerhouse of the cell?'" 
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
              <div className="w-full md:w-48 space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Namespace</label>
                <select 
                  value={queryNamespace}
                  onChange={e => setQueryNamespace(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl outline-none"
                >
                  {namespaces.map((ns: any) => (
                    <option key={ns.name} value={ns.name}>{ns.name}</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleTestQuery} disabled={queryMutation.isPending || !queryText.trim()}>
                {queryMutation.isPending ? 'Searching...' : 'Test Retrieval'}
              </Button>
            </div>

            {queryResults && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Top Results</h4>
                {queryResults.length === 0 ? (
                  <p className="text-sm text-slate-400">No matches found.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {queryResults.map((res: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <Badge tone="info">Score: {(res.score * 100).toFixed(1)}%</Badge>
                          <span className="text-xs text-slate-400 font-mono">{res.id}</span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-gray-300 leading-relaxed">
                          {res.metadata?.text || '(No text metadata found)'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel
              title="Active Namespaces"
              className="lg:col-span-2"
              flush
              actions={
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search namespaces..." className="pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-56" />
                </div>
              }
            >
              {namespaces.length === 0 ? (
                <EmptyState message="No namespaces found in this index" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 font-medium">Namespace</th>
                        <th className="px-6 py-3 font-medium text-right">Vectors</th>
                        <th className="px-6 py-3 font-medium text-right">Dimensions</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {namespaces.map((ns: any) => (
                        <tr key={ns.name} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Database className="w-4 h-4 text-slate-400" />{ns.name}</div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-gray-300">{ns.vectorCount.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right text-slate-600 dark:text-gray-400">{ns.dimensions}</td>
                          <td className="px-6 py-4"><Badge tone="success">{ns.status}</Badge></td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleDelete(ns.name)}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Clear Namespace"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel title="Vectors per Namespace" subtitle="Distribution">
                <div className="h-[260px]">
                  {perNamespace.length === 0 ? (
                    <EmptyState message="No vectors indexed yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perNamespace} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#8883" />
                        <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" stroke="#888" fontSize={11} width={90} tickLine={false} axisLine={false} />
                        <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} />
                        <Bar dataKey="count" fill="#0ea5e9" radius={[0, 6, 6, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Panel>

              {curriculumStats.length > 0 && (
                <Panel title="Curriculum Breakdown" subtitle="Vectors by Subject">
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={curriculumStats}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {curriculumStats.map((_item: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              )}
            </div>
          </div>
          
          <Panel title="Recent Ingestion Jobs" subtitle="Latest PDFs processed into the vector database" flush>
            {jobsLoading ? (
              <div className="p-8 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-400 animate-spin" /></div>
            ) : !jobsData?.jobs?.length ? (
              <EmptyState message="No ingestion jobs found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Document Name</th>
                      <th className="px-6 py-3 font-medium">Subject</th>
                      <th className="px-6 py-3 font-medium text-right">Vectors Extracted</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {(jobsData?.jobs?.slice(0, 10) || []).map((job: any) => (
                      <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span className="truncate max-w-[300px]" title={job.filename || job.title}>{job.filename || job.title || 'Unknown Document'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-400">N/A</td>
                        <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-gray-300">
                          {job.chunksExtracted?.toLocaleString() || 0}
                        </td>
                        <td className="px-6 py-4">
                          {job.status?.toLowerCase() === 'ready' || job.status?.toLowerCase() === 'completed' || job.status?.toLowerCase() === 'success' ? (
                            <Badge tone="success"><span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Completed</span></Badge>
                          ) : job.status?.toLowerCase() === 'failed' ? (
                            <Badge tone="danger"><span className="flex items-center gap-1"><XCircle className="w-3 h-3" />Failed</span></Badge>
                          ) : (
                            <Badge tone="info"><span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />{job.status || 'Processing'}</span></Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-500 text-xs">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Unknown'}
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
