import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, RotateCcw, Loader2, MessageSquare, FileText, Inbox, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

interface TrashItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  deletedAt: number;
}

const typeIcon: Record<string, typeof MessageSquare> = {
  chat: MessageSquare,
};

function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Trash() {
  const { user } = useAuth();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const keyOf = (i: TrashItem) => `${i.type}:${i.id}`;

  const fetchItems = useCallback(async () => {
    if (!user?.uid) { setItems([]); setIsLoading(false); return; }
    try {
      const res = await api.get('/trash');
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(keyOf(item));
    setItems((prev) => prev.filter((i) => keyOf(i) !== keyOf(item)));
    try {
      await api.post('/trash/restore', { type: item.type, id: item.id });
      window.dispatchEvent(new CustomEvent('chat-sessions-changed'));
      window.dispatchEvent(new CustomEvent('trash-changed'));
    } catch {
      fetchItems(); // put it back if the call failed
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (item: TrashItem) => {
    setBusyId(keyOf(item));
    setItems((prev) => prev.filter((i) => keyOf(i) !== keyOf(item)));
    try {
      await api.delete(`/trash/${item.type}/${item.id}`);
      window.dispatchEvent(new CustomEvent('trash-changed'));
    } catch {
      fetchItems();
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    setEmptying(true);
    try {
      await api.delete('/trash');
      setItems([]);
      window.dispatchEvent(new CustomEvent('trash-changed'));
    } catch {
      fetchItems();
    } finally {
      setEmptying(false);
      setConfirmEmpty(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center pt-8 px-4 sm:px-8 bg-slate-50 dark:bg-[#131314] overflow-y-auto">
      <div className="max-w-3xl w-full pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[28px] md:text-[32px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <Trash2 className="w-7 h-7 text-slate-400 dark:text-slate-500" />
              Deleted
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Items you delete land here. Restore them to keep, or delete permanently to remove for good.
            </p>
          </div>

          {items.length > 0 && (
            <button
              onClick={() => setConfirmEmpty(true)}
              disabled={emptying}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-sm font-medium transition-colors disabled:opacity-60 shrink-0"
            >
              {emptying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Empty Trash
            </button>
          )}
        </div>

        {/* Empty-trash confirmation */}
        <AnimatePresence>
          {confirmEmpty && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">Permanently delete all items?</p>
                  <p className="text-[13px] text-red-600/80 dark:text-red-400/80 mt-0.5">This can't be undone. All {items.length} item(s) will be gone for good.</p>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={handleEmpty} disabled={emptying} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium transition-colors disabled:opacity-60">
                      {emptying ? 'Deleting…' : 'Yes, delete all'}
                    </button>
                    <button onClick={() => setConfirmEmpty(false)} className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 text-[13px] font-medium transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-slate-300 dark:text-gray-600" />
            </div>
            <p className="text-slate-600 dark:text-gray-300 font-medium">Trash is empty</p>
            <p className="text-slate-400 dark:text-gray-500 text-sm mt-1">Deleted chats and items will appear here.</p>
            <Link to="/chat" className="mt-5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Go to chat</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const Icon = typeIcon[item.type] || FileText;
                const busy = busyId === keyOf(item);
                return (
                  <motion.div
                    key={keyOf(item)}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className={cn(
                      "group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 transition-colors",
                      busy && "opacity-60 pointer-events-none"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                      <Icon className="w-[18px] h-[18px] text-slate-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-slate-800 dark:text-gray-200 truncate">{item.title}</p>
                      <p className="text-[12px] text-slate-400 dark:text-gray-500">
                        {item.subtitle ? `${item.subtitle} · ` : ''}Deleted {timeAgo(item.deletedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleRestore(item)}
                        title="Restore"
                        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[12.5px] font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-colors"
                      >
                        <RotateCcw className="w-[15px] h-[15px]" /> Restore
                      </button>
                      <button
                        onClick={() => handlePurge(item)}
                        title="Delete permanently"
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-[15px] h-[15px]" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
