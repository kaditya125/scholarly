import { useState } from 'react';
import { MoreVertical, Reply, Pencil, Trash2, Pin, Bookmark } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Hover kebab menu for a message: Reply (always), Edit (own text messages), Delete (own, or a
 * moderator), Pin/Unpin, Save/Unsave. The trigger is revealed on message hover — the parent row must have `group`.
 */
export function MessageActionsMenu({
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  onPin,
  isPinned,
  onSave,
  isSaved,
  align = 'left',
}: {
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  onSave?: () => void;
  isSaved?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative self-center shrink-0">
      <button
        data-open={open}
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 rounded-full items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors hidden group-hover:flex data-[open=true]:flex"
        aria-label="Message actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute z-20 top-7 w-40 rounded-xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-xl py-1 text-[13px]',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            <button
              onClick={() => {
                onReply();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Reply className="w-3.5 h-3.5" /> Reply
            </button>
            {onSave && (
              <button
                onClick={() => {
                  onSave();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <Bookmark className={cn("w-3.5 h-3.5", isSaved && "text-amber-500 fill-amber-500")} />
                {isSaved ? 'Saved in Notes' : 'Save to Notes'}
              </button>
            )}
            {onPin && (
              <button
                onClick={() => {
                  onPin();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <Pin className="w-3.5 h-3.5" /> {isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => {
                  onEdit();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  onDelete();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
