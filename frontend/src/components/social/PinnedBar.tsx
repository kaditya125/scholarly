import { useState } from 'react';
import { Pin, ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface PinnedItem {
  id: string;
  senderName: string;
  text: string;
}

/** Collapsible bar of pinned messages shown under a thread/channel header. */
export function PinnedBar({
  items,
  onJump,
  onUnpin,
}: {
  items: PinnedItem[];
  onJump: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-white/10 bg-amber-50/60 dark:bg-amber-500/[0.06]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold text-slate-600 dark:text-gray-300 hover:bg-amber-100/50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <Pin className="w-3.5 h-3.5 text-amber-500" />
        {items.length} pinned message{items.length > 1 ? 's' : ''}
        <ChevronDown className={cn('w-3.5 h-3.5 ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-0.5">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-white/5 group/pin"
            >
              <Pin className="w-3 h-3 text-amber-500 shrink-0" />
              <button onClick={() => onJump(it.id)} className="min-w-0 flex-1 text-left">
                <p className="text-[12px] font-semibold text-slate-700 dark:text-gray-200 truncate">
                  {it.senderName}
                </p>
                <p className="text-[12px] text-slate-500 dark:text-gray-400 truncate">{it.text}</p>
              </button>
              <button
                onClick={() => onUnpin(it.id)}
                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-white/10 opacity-0 group-hover/pin:opacity-100 transition-opacity shrink-0"
                title="Unpin"
                aria-label="Unpin message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
