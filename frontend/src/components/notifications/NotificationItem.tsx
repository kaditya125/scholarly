import React from 'react';
import { motion } from 'motion/react';
import { 
  Bell, 
  ShieldAlert, 
  GraduationCap, 
  CreditCard, 
  Sparkles, 
  Check, 
  ChevronRight,
  UserPlus,
  Users,
  Briefcase,
  Bot,
  AtSign,
  Award,
  Clock,
  Shield,
  UserCheck,
  Brain,
  MessageCircle,
  X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { NotificationPayload } from '../../lib/api/notifications';

interface NotificationItemProps {
  notification: NotificationPayload;
  onRead: (id: string) => void;
  onArchive?: (id: string) => void;
  onAction?: (id: string, actionState: 'accepted' | 'declined' | 'joined' | 'ignored') => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; label?: string }> = {
  welcome: { icon: Sparkles, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  account: { icon: UserCheck, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  profile: { icon: GraduationCap, bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
  assessment: { icon: Brain, bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
  friend_request: { icon: UserPlus, bg: 'bg-cyan-500/10 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
  study_group_invitation: { icon: Users, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  team_invitation: { icon: Briefcase, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  ai_message: { icon: Bot, bg: 'bg-violet-500/10 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
  chat: { icon: MessageCircle, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  mention: { icon: AtSign, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  achievement: { icon: Award, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  reminder: { icon: Clock, bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400' },
  system: { icon: Shield, bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
};

export function NotificationItem({ notification, onRead, onAction }: NotificationItemProps) {
  const isUnread = !notification.isRead;
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG[notification.category] || TYPE_CONFIG.system;
  const Icon = config.icon;

  let timeAgo = 'Just now';
  try {
    if (notification.createdAt) {
      const d = new Date(notification.createdAt);
      if (!isNaN(d.getTime())) {
        timeAgo = formatDistanceToNow(d, { addSuffix: false })
          .replace('about ', '')
          .replace('hours', 'h')
          .replace('hour', 'h')
          .replace('minutes', 'm')
          .replace('minute', 'm')
          .replace('days', 'd')
          .replace('day', 'd');
      }
    }
  } catch (e) {
    timeAgo = 'Just now';
  }

  const handleBtnClick = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    const actionState = action.toLowerCase().includes('accept') ? 'accepted' 
      : action.toLowerCase().includes('decline') ? 'declined'
      : action.toLowerCase().includes('join') ? 'joined'
      : 'ignored';
    if (onAction) {
      onAction(notification.id, actionState);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => { if (isUnread) onRead(notification.id); }}
      className={cn(
        "group relative rounded-[20px] p-4.5 mb-3 cursor-pointer transition-all duration-300",
        "border bg-white dark:bg-[#18181a]",
        isUnread 
          ? "border-indigo-500/30 dark:border-indigo-500/20 shadow-[0_4px_20px_rgba(99,102,241,0.06)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.3)]" 
          : "border-slate-200/70 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/15"
      )}
    >
      {/* Top Header Row */}
      <div className="flex items-start gap-3">
        {/* Avatar or Icon */}
        <div className="relative shrink-0">
          {notification.avatar ? (
            <div className="relative">
              <img 
                src={notification.avatar} 
                alt="Avatar" 
                className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200 dark:border-white/10" 
              />
              <span className={cn(
                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-[#18181a]",
                config.bg, config.text
              )}>
                <Icon className="w-2.5 h-2.5" strokeWidth={2.5} />
              </span>
            </div>
          ) : (
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shadow-sm",
              config.bg, config.text
            )}>
              <Icon className="w-5 h-5" strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className={cn(
              "text-[14px] font-semibold tracking-tight text-slate-900 dark:text-white leading-snug",
              isUnread && "font-bold"
            )}>
              {notification.title}
            </h4>

            {notification.targetBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[10.5px] font-semibold text-slate-700 dark:text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                {notification.targetBadge}
              </span>
            )}
          </div>

          <p className="text-[13px] leading-relaxed text-slate-600 dark:text-gray-400">
            {notification.body}
          </p>

          {/* Quote Block */}
          {notification.quote && (
            <div className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/5 text-[12.5px] leading-relaxed text-slate-700 dark:text-gray-300">
              {notification.quote.split(/(@\w+)/g).map((part, idx) => 
                part.startsWith('@') ? (
                  <span key={idx} className="font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 px-1.5 py-0.5 rounded-md mx-0.5">
                    {part}
                  </span>
                ) : part
              )}
            </div>
          )}

          {/* Action Buttons (Accept / Decline / Join) */}
          {notification.actions && notification.actions.length > 0 && !notification.actionState && (
            <div className="mt-3.5 flex items-center gap-2.5">
              {notification.actions.map((act) => {
                const isPrimary = act.toLowerCase().includes('accept') || act.toLowerCase().includes('join') || act.toLowerCase().includes('start');
                return (
                  <button
                    key={act}
                    onClick={(e) => handleBtnClick(e, act)}
                    className={cn(
                      "px-5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95 shadow-sm",
                      isPrimary
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-gray-100 hover:scale-[1.02]"
                        : "border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    )}
                  >
                    {act}
                  </button>
                );
              })}
            </div>
          )}

          {/* Action Feedback Badge */}
          {notification.actionState && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
              <span className="capitalize">{notification.actionState}</span>
            </div>
          )}

          {/* Action URL link if no buttons */}
          {notification.actionUrl && (!notification.actions || notification.actions.length === 0) && (
            <div className="mt-2.5">
              <a
                href={notification.actionUrl}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View details <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Right Timestamp & Unread Dot */}
        <div className="flex flex-col items-end shrink-0 gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-gray-500">
            {timeAgo}
          </span>
          {isUnread && (
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
