import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Settings, Filter, ArrowUpDown, Check, X, Sparkles, SlidersHorizontal, CheckCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNotificationStore } from '../lib/store/useNotificationStore';
import { useNotificationsSync } from '../lib/hooks/useNotificationsSync';
import { NotificationItem } from './notifications/NotificationItem';
import { NotificationPayload } from '../lib/api/notifications';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'requests', label: 'Requests' },
  { id: 'system', label: 'System' },
] as const;

type TabId = typeof TABS[number]['id'];
type SortOrder = 'latest' | 'oldest' | 'priority';

function groupNotificationsByDate(items: NotificationPayload[]) {
  const groups: Record<string, NotificationPayload[]> = {
    'TODAY': [],
    'YESTERDAY': [],
    'EARLIER THIS WEEK': [],
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
      groups['EARLIER THIS WEEK'].push(item);
    } else if (d >= lastWeekStart) {
      groups['LAST WEEK'].push(item);
    } else {
      groups['OLDER'].push(item);
    }
  });

  return Object.entries(groups).filter(([_, list]) => list.length > 0);
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('all');
  const [sortBy, setSortBy] = useState<SortOrder>('latest');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Attach Firestore Sync
  useNotificationsSync();

  const {
    notifications,
    unreadCount,
    markAllAsRead,
    markAsRead,
    archive,
    handleAction,
    loadMore,
    hasMore
  } = useNotificationStore();

  const getFilteredItems = () => {
    let result = notifications.filter(n => !n.isArchived);

    // Tab Filtering
    if (tab === 'unread') {
      result = result.filter(n => !n.isRead);
    } else if (tab === 'mentions') {
      result = result.filter(n => n.type === 'mention' || n.category === 'social');
    } else if (tab === 'requests') {
      result = result.filter(n => n.type === 'friend_request' || n.type === 'study_group_invitation' || n.type === 'team_invitation');
    } else if (tab === 'system') {
      result = result.filter(n => n.category === 'system' || n.type === 'welcome' || n.type === 'account');
    }

    // Category Filter
    if (categoryFilter !== 'all') {
      result = result.filter(n => n.category === categoryFilter || n.type === categoryFilter);
    }

    // Sorting
    if (sortBy === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'priority') {
      const pOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, silent: 0 };
      result = [...result].sort((a, b) => (pOrder[b.priority || 'medium'] || 0) - (pOrder[a.priority || 'medium'] || 0));
    } else {
      // Default: Latest first
      result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  };

  const items = getFilteredItems();
  const groupedItems = groupNotificationsByDate(items);

  // Infinite Scroll Trigger
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || !open) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore, open, items.length]);

  return (
    <div className="relative hidden sm:block">
      {/* Bell Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={cn(
          "relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
          "border border-slate-200 dark:border-white/10 shadow-[0_2px_10px_rgb(0,0,0,0.02)]",
          open 
            ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20 scale-105" 
            : "bg-white dark:bg-[#1f1f1f] text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-slate-300 dark:hover:border-white/20"
        )}
      >
        <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border-2 border-white dark:border-[#1f1f1f]" />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowFilterMenu(false); setShowSortMenu(false); }} />
            
            {/* Main Panel */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className={cn(
                "absolute right-0 top-[calc(100%+12px)] w-[440px] sm:w-[460px] max-w-[calc(100vw-2rem)]",
                "bg-white/95 dark:bg-[#121214]/95 backdrop-blur-2xl",
                "rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.25)] border border-slate-200/80 dark:border-white/10 z-50 overflow-hidden flex flex-col"
              )}
              style={{ maxHeight: 'min(720px, calc(100vh - 90px))' }}
            >
              {/* Sticky Top Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3 bg-white/50 dark:bg-[#121214]/50 border-b border-slate-100 dark:border-white/5 shrink-0">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[19px] font-bold text-slate-900 dark:text-white tracking-tight">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => markAllAsRead()} 
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" /> Mark all as read
                  </button>
                  <button className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" title="Notification Settings">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabs + Toolbar Row */}
              <div className="flex items-center justify-between px-6 pt-3 pb-2 border-b border-slate-100 dark:border-white/5 shrink-0 bg-slate-50/40 dark:bg-white/[0.01]">
                {/* Pill Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                  {TABS.map((t) => {
                    const isActive = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 whitespace-nowrap',
                          isActive 
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5'
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Right Toolbar Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 pl-2 relative">
                  {/* Filter Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowFilterMenu(v => !v); setShowSortMenu(false); }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border transition-all",
                        categoryFilter !== 'all'
                          ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-500"
                          : "border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5"
                      )}
                      title="Filter notifications"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>

                    {/* Filter Popup Menu */}
                    <AnimatePresence>
                      {showFilterMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          className="absolute right-0 top-10 w-48 bg-white dark:bg-[#1a1a1c] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl z-50 p-2 text-left"
                        >
                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 px-2 py-1 mb-1">
                            Filter Category
                          </div>
                          {[
                            { id: 'all', label: 'All Categories' },
                            { id: 'ai', label: 'AI Assistant & Digital Twin' },
                            { id: 'social', label: 'Social & Requests' },
                            { id: 'achievement', label: 'Achievements & Badges' },
                            { id: 'system', label: 'System & Security' },
                          ].map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => { setCategoryFilter(cat.id); setShowFilterMenu(false); }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 rounded-xl text-[12.5px] font-semibold flex items-center justify-between transition-colors",
                                categoryFilter === cat.id
                                  ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                                  : "text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5"
                              )}
                            >
                              {cat.label}
                              {categoryFilter === cat.id && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Sort Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowSortMenu(v => !v); setShowFilterMenu(false); }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border transition-all",
                        sortBy !== 'latest'
                          ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-500"
                          : "border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5"
                      )}
                      title="Sort notifications"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Sort Popup Menu */}
                    <AnimatePresence>
                      {showSortMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          className="absolute right-0 top-10 w-44 bg-white dark:bg-[#1a1a1c] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl z-50 p-2 text-left"
                        >
                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 px-2 py-1 mb-1">
                            Sort Order
                          </div>
                          {[
                            { id: 'latest', label: 'Latest First' },
                            { id: 'oldest', label: 'Oldest First' },
                            { id: 'priority', label: 'Priority' },
                          ].map((s) => (
                            <button
                              key={s.id}
                              onClick={() => { setSortBy(s.id as SortOrder); setShowSortMenu(false); }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 rounded-xl text-[12.5px] font-semibold flex items-center justify-between transition-colors",
                                sortBy === s.id
                                  ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                                  : "text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5"
                              )}
                            >
                              {s.label}
                              {sortBy === s.id && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Notification List Container */}
              <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {groupedItems.length > 0 ? (
                    groupedItems.map(([groupName, groupList]) => (
                      <div key={groupName} className="mb-4">
                        {/* Group Header Pill Divider */}
                        <div className="relative flex items-center justify-center my-4">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-dashed border-slate-200 dark:border-white/10" />
                          </div>
                          <span className="relative z-10 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[10px] font-bold tracking-wider text-slate-500 dark:text-gray-400 uppercase">
                            {groupName}
                          </span>
                        </div>

                        {/* Items in this date group */}
                        {groupList.map((n) => (
                          <NotificationItem
                            key={n.id}
                            notification={n}
                            onRead={markAsRead}
                            onArchive={archive}
                            onAction={handleAction}
                          />
                        ))}
                      </div>
                    ))
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-16 text-center px-6"
                    >
                      <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center mb-4 shadow-sm">
                        <Sparkles className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <p className="text-[16px] font-bold text-slate-900 dark:text-white">
                        {tab === 'unread' ? "You're all caught up!" : 'No notifications'}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-gray-400 mt-1 max-w-[260px] leading-relaxed">
                        {tab === 'unread' 
                          ? 'Check back later for new updates, study group invites, and AI tutor solutions.' 
                          : 'New notifications will appear here as you continue learning.'}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Infinite Scroll Trigger */}
                {items.length > 0 && (
                  <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                    {hasMore && (
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
