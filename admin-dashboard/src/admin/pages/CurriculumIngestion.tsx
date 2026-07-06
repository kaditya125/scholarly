import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { BookOpen, AlertCircle, RefreshCw, FileText, CheckCircle2, Clock, PlayCircle, XCircle, Boxes } from 'lucide-react';
import { useIngestionJobs } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, cardItem, staggerContainer, SkeletonMetricGrid } from '../ui';

export function CurriculumIngestion() {
  const { data, isLoading, error, refetch, isFetching } = useIngestionJobs();
  const jobs = data?.jobs || [];
  const stats = data?.stats || {};

  const statusColor = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'READY') return 'text-emerald-600 dark:text-emerald-400';
    if (s === 'FAILED') return 'text-rose-500';
    return 'text-indigo-500';
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Curriculum Ingestion"
        subtitle="Live status of document ingestion across all notebooks."
        icon={BookOpen}
        actions={<Button size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Loading ingestion jobs..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Active Jobs" value={stats.active ?? 0} icon={PlayCircle} accent="indigo" />
            <MetricCard label="Completed (24h)" value={stats.completedLast24h ?? 0} icon={CheckCircle2} accent="emerald" />
            <MetricCard label="Failed" value={stats.failed ?? 0} icon={XCircle} accent="rose" />
            <MetricCard label="Total Sources" value={stats.totalSources ?? 0} icon={Boxes} accent="slate" />
          </motion.div>

          <h3 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Recent Ingestion Jobs</h3>

          {jobs.length === 0 ? (
            <Panel><EmptyState message="No ingestion jobs found. Upload documents to a notebook to start." /></Panel>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
              {jobs.map((job: any) => (
                <motion.div key={job.id} variants={cardItem} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a] p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/10 rounded-lg"><FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /></div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white">{job.filename}</h4>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-mono">{job.id}</span><span>·</span><span className="capitalize">{job.type}</span><span>·</span>
                          <span className={cn('flex items-center gap-1 font-medium', statusColor(job.status))}>
                            {job.status === 'READY' ? <CheckCircle2 className="w-3 h-3" /> : job.status === 'FAILED' ? <AlertCircle className="w-3 h-3" /> : <RefreshCw className="w-3 h-3 animate-spin" />}
                            {job.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    {job.updatedAt && <div className="text-xs font-medium text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(job.updatedAt).toLocaleString()}</div>}
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-2">
                    <div className={cn('h-2 rounded-full transition-all duration-500', job.status === 'FAILED' ? 'bg-rose-500' : job.status === 'READY' ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${job.progress ?? 0}%` }} />
                  </div>
                  {job.error && (
                    <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-500/10 rounded-lg text-sm text-rose-700 dark:text-rose-400 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{job.error}</span></div>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
