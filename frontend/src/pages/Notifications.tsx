import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  CheckCheck,
  Filter,
  Search,
  Settings,
  Sparkles,
  ArrowUpDown,
  Check,
  Trash2,
  ExternalLink,
  Shield,
  UserCheck,
  GraduationCap,
  Brain,
  UserPlus,
  Users,
  Briefcase,
  Bot,
  MessageCircle,
  AtSign,
  Award,
  Clock,
  ChevronRight,
  X,
  Calendar,
  Layers,
  Inbox
} from 'lucide-react';
import { useNotificationStore } from '../lib/store/useNotificationStore';
import { useNotificationsSync } from '../lib/hooks/useNotificationsSync';
import { NotificationPayload } from '../lib/api/notifications';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

const TABS = [
  { id: 'all', label: 'All Activity' },
  { id: 'unread', label: 'Unread' },
  { id: 'requests', label: 'Peer Requests' },
  { id: 'social', label: 'Study Circles & Mentions' },
  { id: 'achievement', label: 'Milestones & Badges' },
  { id: 'system', label: 'System & Security' },
] as const;

type TabId = typeof TABS[number]['id'];
type SortOrder = 'latest' | 'oldest' | 'priority';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
  welcome: { icon: Sparkles, bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10', text: 'text-[#8ba32b] dark:text-[#c8e558]', label: 'Onboarding' },
  account: { icon: UserCheck, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', label: 'Account' },
  profile: { icon: GraduationCap, bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', label: 'Academic Profile' },
  assessment: { icon: Brain, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', label: 'Assessment' },
  friend_request: { icon: UserPlus, bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10', text: 'text-[#8ba32b] dark:text-[#c8e558]', label: 'Peer Request' },
  study_group_invitation: { icon: Users, bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', label: 'Study Circle' },
  team_invitation: { icon: Briefcase, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', label: 'Team Invite' },
  ai_message: { icon: Bot, bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10', text: 'text-[#8ba32b] dark:text-[#c8e558]', label: 'AI Tutor' },
  chat: { icon: MessageCircle, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', label: 'Chat Message' },
  mention: { icon: AtSign, bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', label: 'Mention' },
  achievement: { icon: Award, bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', label: 'Milestone' },
  reminder: { icon: Clock, bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', label: 'Study Reminder' },
  system: { icon: Shield, bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-400', label: 'Security & System' },
};

function groupNotificationsByDate(items: NotificationPayload[]) {
  const groups: Record<string, NotificationPayload[]> = {
    'TODAY': [],
    'YESTERDAY': [],
    'THIS WEEK': [],
    'LAST WEEK': [],
    'OLDER': []
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  const lastWeekStart = todayStart - 13 * 86400000;

  items.forEach((item) => {
    const d = item.createdAt ? new Date(item.createdAt).getTime() : now.getTime();
    if (d >= todayStart) {
      groups['TODAY'].push(item);
    } else if (d >= yesterdayStart) {
      groups['YESTERDAY'].push(item);
    } else if (d >= weekStart) {
      groups['THIS WEEK'].push(item);
    } else if (d >= lastWeekStart) {
      groups['LAST WEEK'].push(item);
    } else {
      groups['OLDER'].push(item);
    }
  });

  return Object.entries(groups).filter(([_, list]) => list.length > 0);
}

// ─── Detailed Notification Modal / Drawer ──────────────────────────────
function NotificationDetailModal({
  notification,
  onClose,
  onRead,
  onAction,
}: {
  notification: NotificationPayload | null;
  onClose: () => void;
  onRead: (id: string) => void;
  onAction: (id: string, actionState: 'accepted' | 'declined' | 'joined' | 'ignored') => void;
}) {
  const navigate = useNavigate();
  if (!notification) return null;

  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG[notification.category] || TYPE_CONFIG.system;
  const Icon = config.icon;

  const handleActionClick = (action: string) => {
    const actionState = action.toLowerCase().includes('accept') ? 'accepted'
      : action.toLowerCase().includes('decline') ? 'declined'
      : action.toLowerCase().includes('join') ? 'joined'
      : 'ignored';
    onAction(notification.id, actionState);
  };

  const formattedDate = notification.createdAt
    ? new Date(notification.createdAt).toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : 'Recently';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-white dark:bg-[#141416] rounded-2xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-white/10 font-sans z-10"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-3.5 mb-5">
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center border border-slate-200/40 dark:border-white/5 shrink-0",
              config.bg, config.text
            )}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                  {config.label}
                </span>
                {notification.priority && (
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                    notification.priority === 'critical' || notification.priority === 'high'
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                  )}>
                    {notification.priority}
                  </span>
                )}
              </div>
              <h2 className="text-[16.5px] font-bold text-slate-900 dark:text-white leading-snug">
                {notification.title}
              </h2>
            </div>
          </div>

          {/* Body Content */}
          <div className="space-y-4 mb-6">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/5">
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                {notification.body}
              </p>
              {notification.quote && (
                <div className="mt-3 p-3 rounded-lg bg-white dark:bg-[#1c1c1f] border border-slate-200/60 dark:border-white/5 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300 italic">
                  "{notification.quote}"
                </div>
              )}
            </div>

            {/* Metadata breakdown */}
            <div className="grid grid-cols-2 gap-3 text-[11.5px] text-slate-500 dark:text-slate-400 p-3 rounded-xl bg-slate-50/50 dark:bg-white/[0.01] border border-slate-100 dark:border-white/5">
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-400">Timestamp</span>
                <p className="text-slate-700 dark:text-slate-300 font-medium">{formattedDate}</p>
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-400">Status</span>
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  {notification.isRead ? 'Read' : 'Unread'}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5">
            <div>
              {notification.actionUrl && (
                <button
                  onClick={() => {
                    onClose();
                    if (notification.actionUrl?.startsWith('/')) {
                      navigate(notification.actionUrl);
                    } else if (notification.actionUrl) {
                      window.open(notification.actionUrl, '_blank');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
                >
                  <span>Open destination</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {notification.actions && notification.actions.length > 0 && !notification.actionState ? (
                notification.actions.map((act) => {
                  const isPrimary = act.toLowerCase().includes('accept') || act.toLowerCase().includes('join') || act.toLowerCase().includes('start');
                  return (
                    <button
                      key={act}
                      onClick={() => handleActionClick(act)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all shadow-2xs cursor-pointer active:scale-98",
                        isPrimary
                          ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 hover:opacity-90"
                          : "bg-white dark:bg-[#1c1c1f] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                      )}
                    >
                      {act}
                    </button>
                  );
                })
              ) : (
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 hover:opacity-90 transition-all cursor-pointer active:scale-98"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Main Notifications Page ───────────────────────────────────────────
export default function Notifications() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOrder>('latest');
  const [selectedDetail, setSelectedDetail] = useState<NotificationPayload | null>(null);

  // Sync with Firestore
  useNotificationsSync();

  const {
    notifications,
    unreadCount,
    markAllAsRead,
    markAsRead,
    archive,
    handleAction,
  } = useNotificationStore();

  const filteredNotifications = useMemo(() => {
    let result = notifications.filter((n) => !n.isArchived);

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.body?.toLowerCase().includes(q) ||
          n.quote?.toLowerCase().includes(q) ||
          n.category?.toLowerCase().includes(q)
      );
    }

    // Tab Filtering
    if (tab === 'unread') {
      result = result.filter((n) => !n.isRead);
    } else if (tab === 'requests') {
      result = result.filter(
        (n) => n.type === 'friend_request' || n.type === 'study_group_invitation' || n.type === 'team_invitation'
      );
    } else if (tab === 'social') {
      result = result.filter(
        (n) => n.type === 'mention' || n.type === 'chat' || n.category === 'social'
      );
    } else if (tab === 'achievement') {
      result = result.filter(
        (n) => n.type === 'achievement' || n.category === 'achievement' || n.type === 'assessment'
      );
    } else if (tab === 'system') {
      result = result.filter(
        (n) => n.category === 'system' || n.type === 'welcome' || n.type === 'account'
      );
    }

    // Sorting
    if (sortBy === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'priority') {
      const pOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, silent: 0 };
      result = [...result].sort((a, b) => (pOrder[b.priority || 'medium'] || 0) - (pOrder[a.priority || 'medium'] || 0));
    } else {
      result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [notifications, tab, search, sortBy]);

  const grouped = useMemo(() => groupNotificationsByDate(filteredNotifications), [filteredNotifications]);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-[#fafbfc] dark:bg-[#131315] text-slate-900 dark:text-white font-sans transition-colors">
      <div className="max-w-[1080px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Page Header ──────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <Bell className="w-4.5 h-4.5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                Notifications &amp; Activity
              </h1>
              {unreadCount > 0 && (
                <span className="bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#8ba32b]/30 dark:border-[#c8e558]/30">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Stay updated on peer requests, study circle mentions, AI tutor solutions, and platform milestones.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => markAllAsRead()}
              className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-full font-semibold text-[12px] hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-2xs cursor-pointer active:scale-98"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              <span>Mark all read</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-full font-semibold text-[12px] hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-2xs cursor-pointer active:scale-98"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Preferences</span>
            </button>
          </div>
        </div>

        {/* ── Toolbar & Filters ────────────────────────────────────── */}
        <div className="bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 shadow-2xs mb-6 space-y-3">
          {/* Top Row: Search + Sort */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-full px-3.5 py-2 focus-within:border-slate-400">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notifications, mentions, titles..."
                className="w-full bg-transparent text-[12.5px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[11px] font-bold">
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOrder)}
                className="bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-full px-3.5 py-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="latest">Latest First</option>
                <option value="oldest">Oldest First</option>
                <option value="priority">By Priority</option>
              </select>
            </div>
          </div>

          {/* Bottom Row: Tab Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {TABS.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer',
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Notification Feed ────────────────────────────────────── */}
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-4 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mb-4 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="text-[16px] font-bold text-slate-900 dark:text-white mb-1">
              {tab === 'unread' ? "You're all caught up!" : 'No notifications found'}
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm">
              {search ? `No notifications matched "${search}".` : 'New activity and study group updates will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([groupName, groupList]) => (
              <div key={groupName} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {groupName}
                  </span>
                  <div className="flex-1 h-px bg-slate-200/80 dark:bg-white/10" />
                  <span className="text-[11px] font-medium text-slate-400">
                    {groupList.length} {groupList.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {groupList.map((n) => {
                    const config = TYPE_CONFIG[n.type] || TYPE_CONFIG[n.category] || TYPE_CONFIG.system;
                    const Icon = config.icon;
                    const isUnread = !n.isRead;
                    let timeAgo = 'Just now';
                    try {
                      if (n.createdAt) {
                        timeAgo = formatDistanceToNow(new Date(n.createdAt), { addSuffix: false });
                      }
                    } catch {}

                    return (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "group relative bg-white dark:bg-[#141416] border rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all flex items-start gap-4 cursor-pointer",
                          isUnread
                            ? "border-slate-300 dark:border-white/20"
                            : "border-slate-200/90 dark:border-white/10"
                        )}
                        onClick={() => {
                          if (isUnread) markAsRead(n.id);
                          setSelectedDetail(n);
                        }}
                      >
                        {/* Icon/Avatar */}
                        <div className="relative shrink-0">
                          {n.avatar ? (
                            <img
                              src={n.avatar}
                              alt="Avatar"
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 shadow-2xs"
                            />
                          ) : (
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200/40 dark:border-white/5",
                              config.bg, config.text
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                          )}
                          {isUnread && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] shadow-[0_0_8px_rgba(200,229,88,0.7)]" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className={cn("text-[14px] text-slate-900 dark:text-white", isUnread ? "font-bold" : "font-semibold")}>
                                {n.title}
                              </h4>
                              <span className="text-[10.5px] font-semibold px-2 py-0.2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                                {config.label}
                              </span>
                            </div>
                            <span className="text-[11px] font-medium text-slate-400 shrink-0">
                              {timeAgo}
                            </span>
                          </div>

                          <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 mb-2">
                            {n.body}
                          </p>

                          {n.quote && (
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 text-[12px] text-slate-600 dark:text-slate-300 mb-2.5 italic">
                              "{n.quote}"
                            </div>
                          )}

                          {/* Inline Action Buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            {n.actions && n.actions.length > 0 && !n.actionState && (
                              <div className="flex items-center gap-2">
                                {n.actions.map((act) => {
                                  const isPrimary = act.toLowerCase().includes('accept') || act.toLowerCase().includes('join') || act.toLowerCase().includes('start');
                                  return (
                                    <button
                                      key={act}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const actionState = act.toLowerCase().includes('accept') ? 'accepted'
                                          : act.toLowerCase().includes('decline') ? 'declined'
                                          : act.toLowerCase().includes('join') ? 'joined'
                                          : 'ignored';
                                        handleAction(n.id, actionState);
                                      }}
                                      className={cn(
                                        "px-4 py-1.5 rounded-full text-[11.5px] font-semibold transition-all shadow-2xs cursor-pointer active:scale-98",
                                        isPrimary
                                          ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 hover:opacity-90"
                                          : "bg-white dark:bg-[#1c1c1f] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                      )}
                                    >
                                      {act}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {n.actionState && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                <Check className="w-3 h-3" /> {n.actionState}
                              </span>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDetail(n);
                              }}
                              className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                            >
                              <span>View details</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Modal ──────────────────────────────────────── */}
      <NotificationDetailModal
        notification={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        onRead={markAsRead}
        onAction={handleAction}
      />
    </div>
  );
}
