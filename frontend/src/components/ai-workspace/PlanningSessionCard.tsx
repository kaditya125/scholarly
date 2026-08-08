/**
 * Planning Session Card
 * 
 * Display card for saved planning sessions.
 * Shows session preview with resume/delete actions.
 */

import { motion } from 'motion/react';
import { MessageCircle, Clock, Trash2, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PlanningSession } from '../../types/workspace.types';

interface PlanningSessionCardProps {
  session: PlanningSession;
  onResume: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export default function PlanningSessionCard({
  session,
  onResume,
  onDelete,
  isDeleting = false,
}: PlanningSessionCardProps) {
  // Get the last user message as preview
  const lastUserMessage = [...session.messages]
    .reverse()
    .find((m) => m.role === 'user' && m.type === 'text');

  const preview = lastUserMessage?.content || 'Planning session in progress...';

  // Format timestamp
  const timeAgo = getTimeAgo(new Date(session.updatedAt));

  // Status badge
  const statusConfig = {
    active: {
      label: 'In Progress',
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    },
    clarifying: {
      label: 'Clarifying',
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    },
    planning: {
      label: 'Generating Plan',
      color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    },
    ready_to_generate: {
      label: 'Ready to Generate',
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    },
    completed: {
      label: 'Completed',
      color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
    },
  };

  const status = statusConfig[session.status] || statusConfig.active;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative',
        isDeleting && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="relative rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] hover:border-orange-300 dark:hover:border-orange-700 transition-all overflow-hidden">
        {/* Main Content */}
        <button
          onClick={onResume}
          disabled={isDeleting}
          className="w-full text-left p-5"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  Planning Session
                </h3>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', status.color)}>
                  {status.label}
                </span>
              </div>
            </div>

            {/* Resume Arrow */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-5 h-5 text-orange-500" />
            </div>
          </div>

          {/* Preview Text */}
          <p className="text-[13px] text-slate-600 dark:text-gray-400 line-clamp-2 mb-3">
            {preview}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between text-[12px] text-slate-500 dark:text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{timeAgo}</span>
            </div>
            <span>{session.messages.length} messages</span>
          </div>
        </button>

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
            className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
            aria-label="Delete session"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}
