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
  X,
  ExternalLink,
  Headphones,
  Calendar,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { NotificationPayload } from '../../lib/api/notifications';

interface NotificationItemProps {
  notification: NotificationPayload;
  onRead: (id: string) => void;
  onArchive?: (id: string) => void;
  onAction?: (id: string, actionState: 'accepted' | 'declined' | 'joined' | 'ignored') => void;
  onSelectDetail?: (notification: NotificationPayload) => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; label?: string }> = {
  welcome: { icon: Sparkles, bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10', text: 'text-[#8ba32b] dark:text-[#c8e558]' },
  account: { icon: UserCheck, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  profile: { icon: GraduationCap, bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
  assessment: { icon: Brain, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  friend_request: { icon: UserPlus, bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10', text: 'text-[#8ba32b] dark:text-[#c8e558]' },
  friend_accepted: { icon: UserCheck, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  podcast_ready: { icon: Headphones, bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
  test_scheduled: { icon: Calendar, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  quiz_completed: { icon: CheckCircle2, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  study_group_invitation: { icon: Users, bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
  team_invitation: { icon: Briefcase, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  ai_message: { icon: Bot, bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10', text: 'text-[#8ba32b] dark:text-[#c8e558]' },
  chat: { icon: MessageCircle, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  mention: { icon: AtSign, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  achievement: { icon: Award, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  reminder: { icon: Clock, bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400' },
  system: { icon: Shield, bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
};

export function NotificationItem({ notification, onRead, onArchive, onAction, onSelectDetail }: NotificationItemProps) {
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

  const handleCardClick = () => {
    if (isUnread) onRead(notification.id);
    if (onSelectDetail) {
      onSelectDetail(notification);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={handleCardClick}
      className={cn(
        "group relative rounded-2xl p-4 mb-2.5 cursor-pointer transition-all duration-200 font-sans",
        "border bg-white dark:bg-[#141416]",
        isUnread 
          ? "border-slate-300 dark:border-white/20 shadow-2xs" 
          : "border-slate-200/80 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/15"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar or Icon */}
        <div className="relative shrink-0">
          {notification.avatar ? (
            <div className="relative">
              <img 
                src={notification.avatar} 
                alt="Avatar" 
                className="w-10 h-10 rounded-full object-cover shadow-2xs border border-slate-200 dark:border-white/10" 
              />
              <span className={cn(
                "absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white dark:border-[#141416]",
                config.bg, config.text
              )}>
                <Icon className="w-2.5 h-2.5" strokeWidth={2.5} />
              </span>
            </div>
          ) : (
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105 border border-slate-200/40 dark:border-white/5",
              config.bg, config.text
            )}>
              <Icon className="w-5 h-5" strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h4 className={cn(
              "text-[13.5px] tracking-tight text-slate-900 dark:text-white leading-snug",
              isUnread ? "font-bold" : "font-semibold"
            )}>
              {notification.title}
            </h4>

            {notification.targetBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-slate-100 dark:bg-white/10 text-[10px] font-semibold text-slate-700 dark:text-gray-300">
                {notification.targetBadge}
              </span>
            )}
          </div>

          <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-2">
            {notification.body}
          </p>

          {/* Quote Block */}
          {notification.quote && (
            <div className="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 text-[12px] leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-2">
              {notification.quote}
            </div>
          )}

          {/* Action Buttons (Accept / Decline / Join) */}
          {notification.actions && notification.actions.length > 0 && !notification.actionState && (
            <div className="mt-3 flex items-center gap-2">
              {notification.actions.map((act) => {
                const isPrimary = act.toLowerCase().includes('accept') || act.toLowerCase().includes('join') || act.toLowerCase().includes('start');
                return (
                  <button
                    key={act}
                    onClick={(e) => handleBtnClick(e, act)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-[11.5px] font-semibold transition-all duration-150 active:scale-98 shadow-2xs cursor-pointer",
                      isPrimary
                        ? "bg-slate-900 dark:bg-[#c8e558] text-white dark:text-slate-900 hover:opacity-90"
                        : "bg-white dark:bg-[#1c1c1f] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
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
            <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" strokeWidth={3} />
              <span className="capitalize">{notification.actionState}</span>
            </div>
          )}

          {/* Action URL link */}
          {notification.actionUrl && (!notification.actions || notification.actions.length === 0) && (
            <div className="mt-2">
              <span
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline"
              >
                View details <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          )}
        </div>

        {/* Right Timestamp & Unread Dot */}
        <div className="flex flex-col items-end shrink-0 gap-2">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {timeAgo}
          </span>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] shadow-[0_0_8px_rgba(200,229,88,0.6)]" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
