import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import {
  BookOpen, Search, LayoutGrid, List, Star, Clock, Share2, Lock, RefreshCw, FolderOpen,
  Users as UsersIcon, Eye, Archive, ArchiveRestore, Trash2, X, AlertTriangle, FileText, Save
} from 'lucide-react';
import {
  useNotebooks, useNotebookDetail, useArchiveNotebook, useDeleteNotebook, useRenameNotebook
} from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, Button, Badge, statusTone, staggerContainer, SkeletonMetricGrid } from '../ui';

export function Notebooks() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useNotebooks();
  const archive = useArchiveNotebook();
  const del = useDeleteNotebook();

  const notebooks = useMemo(() => {
    const list = (data?.notebooks || []).map((n: any) => ({ ...n, visibility: n.sharedWith > 0 ? 'shared' : 'private' }));
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((n: any) => n.title?.toLowerCase().includes(q) || n.owner?.toLowerCase().includes(q) || n.id?.toLowerCase().includes(q));
  }, [data, search]);

  const stats = data?.stats || {};
  const favCount = (data?.notebooks || []).filter((n: any) => n.isFavorite).length;
  const getStatusIcon = (visibility: string) => (visibility === 'shared' ? <Share2 className="w-3.5 h-3.5 text-indigo-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />);

  const Actions = ({ nb }: { nb: any }) => (
    <div className="flex items-center gap-1">
      <button onClick={() => setDetailId(nb.id)} title="View details" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded-md transition-colors">
        <Eye className="w-4 h-4" />
      </button>
      <button
        onClick={() => archive.mutate({ id: nb.id, isArchived: !nb.isArchived })}
        disabled={archive.isPending}
        title={nb.isArchived ? 'Unarchive' : 'Archive'}
        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded-md transition-colors disabled:opacity-50"
      >
        {nb.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
      </button>
      <button onClick={() => setDeleteTarget({ id: nb.id, title: nb.title })} title="Delete" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded-md transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Notebook Management"
        subtitle="Monitor, moderate, and manage user notebooks."
        icon={FolderOpen}
        iconClassName="text-fuchsia-600"
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />} onClick={() => refetch()} disabled={isFetching}>Refresh</Button>}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Loading notebooks..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Notebooks" value={stats.totalNotebooks ?? 0} icon={BookOpen} accent="fuchsia" />
            <MetricCard label="Active This Week" value={stats.activeThisWeek ?? 0} icon={Clock} accent="indigo" />
            <MetricCard label="Shown (sample)" value={(data?.notebooks || []).length} icon={FolderOpen} accent="sky" />
            <MetricCard label="Favorited (sample)" value={favCount} icon={Star} accent="amber" />
          </motion.div>

          <Panel
            flush
            title="Notebooks"
            icon={<UsersIcon className="w-4 h-4 text-fuchsia-500" />}
            actions={
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, owner, ID..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 w-60" />
                </div>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                  <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-white dark:bg-[#222] shadow-sm text-slate-900 dark:text-white' : 'text-slate-500')}><LayoutGrid className="w-4 h-4" /></button>
                  <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-white dark:bg-[#222] shadow-sm text-slate-900 dark:text-white' : 'text-slate-500')}><List className="w-4 h-4" /></button>
                </div>
              </div>
            }
          >
            <div className="p-5">
              {notebooks.length === 0 ? (
                <EmptyState message="No notebooks found" />
              ) : viewMode === 'grid' ? (
                <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {notebooks.map((nb: any) => (
                    <div key={nb.id} className="group bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5 p-4 hover:shadow-md transition-all flex flex-col h-48">
                      <div className="flex justify-between items-start mb-3">
                        <div className={cn('p-2 rounded-lg', nb.visibility === 'shared' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 text-slate-500 dark:bg-white/5')}><BookOpen className="w-5 h-5" /></div>
                        <div className="flex items-center gap-1">
                          {nb.isArchived && <Badge tone="neutral">Archived</Badge>}
                          {nb.isFavorite && <Star className="w-4 h-4 fill-amber-500 text-amber-500" />}
                        </div>
                      </div>
                      <button onClick={() => setDetailId(nb.id)} className="text-left">
                        <h3 className="font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1 hover:text-fuchsia-600 dark:hover:text-fuchsia-400 transition-colors">{nb.title}</h3>
                      </button>
                      <div className="text-sm text-slate-500 dark:text-gray-400 mb-auto">by {nb.owner}</div>
                      <div className="pt-3 mt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">{getStatusIcon(nb.visibility)}<span className="capitalize">{nb.visibility}</span><span className="text-slate-300 dark:text-gray-600">·</span><span>{nb.documents} docs</span></div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity"><Actions nb={nb} /></div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <div className="overflow-x-auto -m-1">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Title</th>
                        <th className="px-4 py-3 font-medium">Owner</th>
                        <th className="px-4 py-3 font-medium">Visibility</th>
                        <th className="px-4 py-3 font-medium text-right">Docs</th>
                        <th className="px-4 py-3 font-medium">Last Modified</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {notebooks.map((nb: any) => (
                        <tr key={nb.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <BookOpen className="w-4 h-4 text-fuchsia-500" />
                              <button onClick={() => setDetailId(nb.id)} className="font-semibold text-slate-900 dark:text-white hover:text-fuchsia-600 dark:hover:text-fuchsia-400 transition-colors">{nb.title}</button>
                              {nb.isArchived && <Badge tone="neutral">Archived</Badge>}
                              {nb.isFavorite && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{nb.owner}</td>
                          <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-slate-500 dark:text-gray-400 capitalize">{getStatusIcon(nb.visibility)} {nb.visibility}</span></td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-gray-300">{nb.documents}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs"><span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {nb.updatedAt ? new Date(nb.updatedAt).toLocaleDateString() : '—'}</span></td>
                          <td className="px-4 py-3"><div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity"><Actions nb={nb} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Panel>
        </>
      )}

      {/* Detail / rename modal */}
      <AnimatePresence>
        {detailId && <NotebookDetailModal id={detailId} onClose={() => setDetailId(null)} onDelete={(id, title) => { setDetailId(null); setDeleteTarget({ id, title }); }} />}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDelete
            title={deleteTarget.title}
            pending={del.isPending}
            error={del.isError}
            onCancel={() => { if (!del.isPending) setDeleteTarget(null); }}
            onConfirm={() => del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161618] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function NotebookDetailModal({ id, onClose, onDelete }: { id: string; onClose: () => void; onDelete: (id: string, title: string) => void }) {
  const { data, isLoading, error, refetch } = useNotebookDetail(id);
  const rename = useRenameNotebook();
  const nb = data?.notebook;
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (nb?.title) setTitle(nb.title);
  }, [nb?.title]);

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/5">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><BookOpen className="w-4 h-4 text-fuchsia-500" /> Notebook Details</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"><X className="w-4 h-4" /></button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <LoadingState label="Loading notebook..." />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : nb ? (
          <div className="p-5 space-y-5">
            {/* Rename */}
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-gray-400">Title</label>
              <div className="mt-1 flex items-center gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500" />
                <Button size="sm" icon={<Save className="w-4 h-4" />} loading={rename.isPending} disabled={!title.trim() || title === nb.title} onClick={() => rename.mutate({ id, title: title.trim() })}>Save</Button>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3">
              <Meta label="Owner" value={nb.owner} />
              <Meta label="Visibility" value={nb.editors + nb.viewers > 0 ? 'Shared' : 'Private'} />
              <Meta label="Documents" value={nb.documents} />
              <Meta label="KG Nodes" value={nb.kgNodes} />
              <Meta label="Flashcards" value={nb.flashcards} />
              <Meta label="Quizzes" value={nb.quizzes} />
              <Meta label="Created" value={nb.createdAt ? new Date(nb.createdAt).toLocaleString() : '—'} />
              <Meta label="Updated" value={nb.updatedAt ? new Date(nb.updatedAt).toLocaleString() : '—'} />
            </div>

            {/* Sources */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-2">Sources ({data.sources?.length ?? 0})</div>
              {(data.sources || []).length === 0 ? (
                <div className="text-sm text-slate-400 py-3">No sources ingested.</div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar">
                  {data.sources.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-800 dark:text-gray-200 truncate">{s.title}</span>
                      </div>
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">Notebook not found.</div>
        )}
      </div>

      {nb && (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-white/5">
          <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => onDelete(id, nb.title)}>Delete</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      )}
    </ModalShell>
  );
}

function Meta({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2">
      <div className="text-[11px] text-slate-500 dark:text-gray-400">{label}</div>
      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{value}</div>
    </div>
  );
}

function ConfirmDelete({ title, pending, error, onCancel, onConfirm }: { title: string; pending: boolean; error: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <ModalShell onClose={onCancel}>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Delete notebook?</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
              This permanently deletes <span className="font-medium text-slate-700 dark:text-gray-200">"{title}"</span> and all of its sources, knowledge graph, and generated assets. This cannot be undone.
            </p>
            {error && <p className="text-xs text-rose-500 mt-2">Delete failed — this action requires a super-admin role.</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant="danger" size="sm" loading={pending} icon={<Trash2 className="w-4 h-4" />} onClick={onConfirm}>Delete permanently</Button>
        </div>
      </div>
    </ModalShell>
  );
}
