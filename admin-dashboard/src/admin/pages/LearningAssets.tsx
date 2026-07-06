import { useMemo, useState } from 'react';
import { FileVideo, FileText, Image as ImageIcon, Search, ShieldCheck, BookOpen, Code, Star, Download } from 'lucide-react';
import { useLearningAssets } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState } from '../components/DataStates';
import { PageHeader, Panel } from '../ui';

const getIcon = (type: string) => {
  switch ((type || '').toLowerCase()) {
    case 'video':
    case 'podcast':
      return <FileVideo className="w-5 h-5 text-rose-500" />;
    case 'pdf':
    case 'notes':
      return <FileText className="w-5 h-5 text-rose-600" />;
    case 'image':
    case 'mindmap':
      return <ImageIcon className="w-5 h-5 text-emerald-500" />;
    case 'interactive':
    case 'quiz':
    case 'flashcards':
      return <Code className="w-5 h-5 text-indigo-500" />;
    default:
      return <BookOpen className="w-5 h-5 text-sky-500" />;
  }
};

export function LearningAssets() {
  const { data, isLoading, error, refetch } = useLearningAssets();
  const [search, setSearch] = useState('');

  const assets = useMemo(() => {
    const list = data?.assets || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((a: any) => a.title?.toLowerCase().includes(q) || a.author?.toLowerCase().includes(q) || a.subject?.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Learning Assets" subtitle="Community-published assets across the platform." icon={BookOpen} />

      {isLoading ? (
        <LoadingState label="Loading published assets..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Panel
          flush
          title="Published Assets"
          actions={
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Showing <span className="font-medium text-slate-900 dark:text-white">{assets.length}</span></span>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-60" />
              </div>
            </div>
          }
        >
          {assets.length === 0 ? (
            <EmptyState message="No published assets yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Asset</th>
                    <th className="px-6 py-4 font-medium">Subject / Exam</th>
                    <th className="px-6 py-4 font-medium">Author</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Downloads</th>
                    <th className="px-6 py-4 font-medium">Rating</th>
                    <th className="px-6 py-4 font-medium">Published</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {assets.map((asset: any) => (
                    <tr key={asset.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">{getIcon(asset.type)}</div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{asset.title}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{String(asset.type).toUpperCase()} · {asset.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-gray-400">{asset.subject || '—'}{asset.exam ? ` · ${asset.exam}` : ''}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">{String(asset.author || '?').charAt(0).toUpperCase()}</div>
                          <span className="text-slate-700 dark:text-gray-300 font-medium">{asset.author}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 w-max"><ShieldCheck className="w-3 h-3" /> {asset.status}</span></td>
                      <td className="px-6 py-4 text-right text-slate-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" />{(asset.downloads ?? 0).toLocaleString()}</span></td>
                      <td className="px-6 py-4 text-slate-600 dark:text-gray-400">{asset.rating != null ? <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" />{asset.rating}</span> : '—'}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-gray-400 text-xs">{asset.publishedAt ? new Date(asset.publishedAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
