import { useNavigate } from 'react-router-dom';
import { Plus, UserPlus, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStudyPartnerSuggestions } from '../../hooks/api/useConnections';
import { PeerAvatar } from '../social/PeerAvatar';
import { PeerCard } from '../../lib/api/connections';

/** One-line context under a suggested partner's name: their goal, or the strongest match reason. */
function lineFor(peer: PeerCard): string {
  if (peer.matchReasons && peer.matchReasons.length > 0) return peer.matchReasons[0];
  if (peer.goal) return peer.goal;
  return peer.email || 'Scholarly learner';
}

/**
 * Dashboard "Find Study Partners" bento card — real study-partner suggestions ranked from the
 * learner's profile. Connect sends a request inline; "See all" opens the People page.
 */
export function StudyPartnersWidget() {
  const navigate = useNavigate();
  const { suggestions, isLoading, sendRequest, sendingId } = useStudyPartnerSuggestions(6);

  const stack = suggestions.slice(0, 3);
  const list = suggestions.slice(0, 4);

  const connect = async (uid: string) => {
    try {
      await sendRequest(uid);
    } catch {
      /* surfaced on the People page; keep the dashboard quiet */
    }
  };

  return (
    <div className="lg:col-span-4 lg:row-span-2 bg-white dark:bg-[#151516] rounded-[28px] p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 dark:border-white/5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Find Study Partners</h3>
        <button
          onClick={() => navigate('/people')}
          className="flex items-center gap-1 text-[12px] font-bold text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
        >
          See all <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center -space-x-2">
          {stack.length > 0 ? (
            stack.map((p) => (
              <PeerAvatar
                key={p.uid}
                name={p.displayName}
                photoURL={p.photoURL}
                seed={p.uid}
                className="w-8 h-8 border-2 border-white dark:border-[#151516] text-[10px]"
              />
            ))
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
              <UserPlus className="w-3.5 h-3.5 text-slate-400" />
            </div>
          )}
          {suggestions.length > 3 && (
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-[#151516] bg-slate-100 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-gray-400">
              +{suggestions.length - 3}
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/people')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-[#1e1e1f] text-[12px] font-bold text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          Add partners <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="border-t border-dashed border-slate-200 dark:border-white/10 my-1 mb-5" />

      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">Suggested for you</h4>
        {suggestions.length > 0 && (
          <span className="text-[12px] font-medium text-slate-400 dark:text-gray-500">
            {suggestions.length} match{suggestions.length > 1 ? 'es' : ''}
          </span>
        )}
      </div>

      <div className="space-y-1 flex-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="h-2.5 w-2/3 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
              </div>
            </div>
          ))
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-6 px-2">
            <p className="text-[13px] font-semibold text-slate-600 dark:text-gray-300 mb-1">
              No partners matched yet
            </p>
            <p className="text-[11.5px] text-slate-400 dark:text-gray-500 mb-3">
              Complete your profile so we can match you by goal and subjects.
            </p>
            <button
              onClick={() => navigate('/profile')}
              className="text-[12px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Complete your profile
            </button>
          </div>
        ) : (
          list.map((u) => (
            <div
              key={u.uid}
              onClick={() => navigate('/people')}
              className="flex items-center justify-between group p-2 hover:bg-slate-50 dark:hover:bg-[#1e1e1f] rounded-xl transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <PeerAvatar
                  name={u.displayName}
                  photoURL={u.photoURL}
                  seed={u.uid}
                  className="w-10 h-10 text-[12px]"
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-slate-900 dark:text-white truncate">
                    {u.displayName}
                  </p>
                  <p className="text-[11.5px] font-medium text-slate-400 dark:text-gray-500 truncate">
                    {lineFor(u)}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  connect(u.uid);
                }}
                disabled={sendingId === u.uid}
                title="Send connection request"
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors',
                  'bg-slate-100 dark:bg-white/10 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 dark:hover:bg-indigo-500/20',
                  'sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-100'
                )}
              >
                {sendingId === u.uid ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
