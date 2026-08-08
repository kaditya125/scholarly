import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Database, FileText, Flag, Image as ImageIcon, Video, StickyNote, Mic,
  BookOpen, Film, Headphones, BarChart3, ChevronRight, FolderOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNotebooks } from '../../hooks/ai/useNotebook';
import { useUserStats } from '../../hooks/api/useUserStats';

type Tab = 'all' | 'documents' | 'reports' | 'images' | 'video' | 'notes' | 'audio';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'all', label: 'All', icon: Database },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'audio', label: 'Audio', icon: Mic },
];

/**
 * "Select sources" modal — search across the student's real notebooks and jump into
 * a source to chat with, plus quick tool tiles (image/video/audio/reports). Every
 * selection performs a real action (opens the notebook / launches the tool).
 */
export function SourcesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { notebooks } = useNotebooks();
  const { stats } = useUserStats();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const go = (to: string) => { onClose(); navigate(to); };

  const tools = useMemo(() => ([
    { cat: 'images' as Tab, title: 'AI Image Studio', desc: 'Generate diagrams & visual aids', icon: ImageIcon, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10', to: '/video-lesson' },
    { cat: 'video' as Tab, title: 'AI Video Lessons', desc: 'Turn any topic into a video', icon: Film, color: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10', to: '/video-lesson' },
    { cat: 'notes' as Tab, title: 'Notebooks & Notes', desc: 'Chat with your study material', icon: BookOpen, color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10', to: '/notebooks' },
    { cat: 'audio' as Tab, title: 'AI Podcasts', desc: 'Listen to your episodes', icon: Headphones, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10', to: '/podcasts' },
  ]), []);

  const reports = useMemo(() => ([
    { label: 'Tests taken', value: `${stats?.totalTestsAttempted ?? 0}` },
    { label: 'Avg accuracy', value: `${Math.round(stats?.averageAccuracy ?? 0)}%` },
    { label: 'Exam readiness', value: `${Math.round(stats?.examReadiness ?? 0)}%` },
    { label: 'Study streak', value: `${stats?.gamification?.studyStreakDays ?? 0}d` },
  ]), [stats]);

  const q = query.toLowerCase();
  const filteredNotebooks = notebooks.filter((n) => (n.title || '').toLowerCase().includes(q));
  const filteredTools = tools.filter((t) => t.title.toLowerCase().includes(q));

  const showDocs = tab === 'all' || tab === 'documents';
  const showReports = tab === 'all' || tab === 'reports';
  const toolsForTab = tab === 'all' ? filteredTools : filteredTools.filter((t) => t.cat === tab);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[8vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
          <motion.div initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 12 }} transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-white dark:bg-[#1a1a1b] rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden font-sans">

            {/* Search */}
            <div className="flex items-center gap-3 px-6 pt-6 pb-4">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for sources to chat with…"
                className="flex-1 bg-transparent outline-none text-[16px] text-slate-800 dark:text-gray-100 placeholder:text-slate-400" />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 px-6 pb-4 overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border whitespace-nowrap transition-colors',
                    tab === t.id ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent' : 'bg-white dark:bg-white/5 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20')}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="px-6 pb-6 max-h-[55vh] overflow-y-auto custom-scrollbar grid md:grid-cols-2 gap-x-8 gap-y-6">
              {/* Documents (notebooks) */}
              {showDocs && (
                <div>
                  <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Notebooks ({filteredNotebooks.length})</div>
                  {filteredNotebooks.length === 0 ? (
                    <p className="text-[13px] text-slate-400">No notebooks yet. Create one to chat with your sources.</p>
                  ) : (
                    <div className="space-y-1">
                      {filteredNotebooks.slice(0, 6).map((nb) => (
                        <button key={nb.id} onClick={() => go(`/notebooks?nb=${nb.id}`)} className="w-full flex items-center gap-3 py-2 text-left group">
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', 'bg-slate-100 dark:bg-white/5')}>
                            <FolderOpen className="w-4 h-4 text-slate-500 dark:text-gray-400" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] font-semibold text-slate-800 dark:text-gray-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{nb.title || 'Untitled'}</span>
                            <span className="block text-[11.5px] text-slate-400">{nb.stats?.documentCount ?? 0} sources</span>
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-gray-600 group-hover:text-indigo-500 transition-colors" />
                        </button>
                      ))}
                      {filteredNotebooks.length > 6 && (
                        <button onClick={() => go('/notebooks')} className="text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-1">Show all</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Reports */}
              {showReports && (
                <div>
                  <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Reports (4)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {reports.map((r) => (
                      <button key={r.label} onClick={() => go('/analytics')} className="rounded-xl border border-slate-200 dark:border-white/10 p-3 text-left hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors">
                        <div className="text-[17px] font-bold text-slate-900 dark:text-white">{r.value}</div>
                        <div className="text-[11px] text-slate-500 dark:text-gray-400 flex items-center justify-between">{r.label} <BarChart3 className="w-3 h-3 text-amber-500" /></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tools (images / video / notes / audio) */}
              {toolsForTab.length > 0 && (
                <div className={cn(tab === 'all' && 'md:col-span-2')}>
                  <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Create &amp; explore</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {toolsForTab.map((t) => (
                      <button key={t.title} onClick={() => go(t.to)} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 text-left hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors">
                        <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', t.color)}><t.icon className="w-4 h-4" /></span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-slate-800 dark:text-gray-200 truncate">{t.title}</span>
                          <span className="block text-[11.5px] text-slate-400 truncate">{t.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state for a filtered tab with nothing */}
              {!showDocs && !showReports && toolsForTab.length === 0 && (
                <div className="md:col-span-2 text-center py-10 text-[13px] text-slate-400">Nothing here yet for this filter.</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
