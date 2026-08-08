import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { REACTION_EMOJIS } from '../../lib/reactions';

/**
 * Reaction pills (emoji + count, highlighted when the current user reacted) plus a small emoji
 * picker. The "add" button is revealed on message hover (the parent row should have `group`).
 */
export function MessageReactions({
  reactions,
  myUid,
  onToggle,
  align = 'left',
}: {
  reactions?: Record<string, string[]>;
  myUid?: string;
  onToggle: (emoji: string) => void;
  align?: 'left' | 'right';
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const entries = Object.entries(reactions || {}).filter(([, uids]) => uids.length > 0);
  const hasAny = entries.length > 0;

  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-1 flex-wrap',
        align === 'right' ? 'justify-end' : 'justify-start'
      )}
    >
      {entries.map(([emoji, uids]) => {
        const mineReacted = myUid ? uids.includes(myUid) : false;
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            className={cn(
              'flex items-center gap-1 px-1.5 h-6 rounded-full text-[12px] border transition-colors',
              mineReacted
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300'
                : 'bg-slate-100 border-transparent text-slate-600 dark:bg-white/10 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/15'
            )}
          >
            <span>{emoji}</span>
            <span className="font-semibold">{uids.length}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            'w-6 h-6 rounded-full items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors',
            hasAny || pickerOpen ? 'flex' : 'hidden group-hover:flex'
          )}
          aria-label="Add reaction"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div
              className={cn(
                'absolute bottom-8 z-20 flex gap-0.5 p-1 rounded-full bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-xl',
                align === 'right' ? 'right-0' : 'left-0'
              )}
            >
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onToggle(e);
                    setPickerOpen(false);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[15px] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
