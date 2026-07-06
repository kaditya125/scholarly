import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity, BarChart2, BookOpen, BrainCircuit, Database, Flag, FolderOpen,
  HeartPulse, History, LayoutDashboard, Library, MessageSquare, Network,
  Search, Settings, ShieldAlert, Users, Bell, Save, CornerDownLeft
} from 'lucide-react';

type Cmd = { label: string; path: string; icon: React.ComponentType<{ className?: string }>; group: string };

const COMMANDS: Cmd[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, group: 'Overview' },
  { label: 'AI Monitoring', path: '/admin/ai-monitoring', icon: Activity, group: 'Overview' },
  { label: 'System Health', path: '/admin/system-health', icon: HeartPulse, group: 'Overview' },
  { label: 'Cost Analytics', path: '/admin/costs', icon: BarChart2, group: 'Overview' },
  { label: 'Curriculum Ingestion', path: '/admin/curriculum', icon: BookOpen, group: 'Knowledge & Data' },
  { label: 'Knowledge Graph', path: '/admin/knowledge-graph', icon: Network, group: 'Knowledge & Data' },
  { label: 'Vector Database', path: '/admin/vector-db', icon: Database, group: 'Knowledge & Data' },
  { label: 'Prompt Studio', path: '/admin/prompts', icon: MessageSquare, group: 'Content & AI' },
  { label: 'Learning Assets', path: '/admin/assets', icon: Library, group: 'Content & AI' },
  { label: 'Notebooks', path: '/admin/notebooks', icon: FolderOpen, group: 'Content & AI' },
  { label: 'Feature Flags', path: '/admin/feature-flags', icon: Flag, group: 'Content & AI' },
  { label: 'Continuous Eval', path: '/admin/evaluation', icon: BrainCircuit, group: 'Content & AI' },
  { label: 'User Management', path: '/admin/users', icon: Users, group: 'Operations' },
  { label: 'Security', path: '/admin/security', icon: ShieldAlert, group: 'Operations' },
  { label: 'Logs', path: '/admin/logs', icon: History, group: 'Operations' },
  { label: 'Notifications', path: '/admin/notifications', icon: Bell, group: 'Operations' },
  { label: 'Backups', path: '/admin/backups', icon: Save, group: 'Operations' },
  { label: 'Settings', path: '/admin/settings', icon: Settings, group: 'Operations' },
];

/** Command palette for fast module navigation (⌘K / Ctrl+K). Navigation only. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    const q = query.toLowerCase();
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active].path);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161618] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/5">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search modules..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-gray-100 placeholder:text-slate-400"
              />
              <kbd className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">ESC</kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto custom-scrollbar p-2">
              {results.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-slate-400">No modules found</div>
              ) : (
                results.map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.path}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(c.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        i === active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${i === active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-gray-400'}`} />
                      <span className={`flex-1 text-sm ${i === active ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-700 dark:text-gray-300'}`}>
                        {c.label}
                      </span>
                      <span className="text-[11px] text-slate-400">{c.group}</span>
                      {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
