import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Settings, Filter, ArrowUpDown, Check, X, Sparkles, CheckCheck, ArrowRight } from 'lucide-react';
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
  const navigate = useNavigate();
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
    <div className="relative hidden sm:block font-sans">
      {/* Bell Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={cn(
          "relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer",
          "border border-slate-200/90 dark:border-white/10 shadow-2xs",
          open 
            ? "bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] border-[#8ba32b]/30 dark:border-[#c8e558]/30 scale-102" 
            : "bg-white dark:bg-[#141416] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        )}
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8ba32b] dark:bg-[#c8e558] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#8ba32b] dark:bg-[#c8e558] border border-white dark:border-[#141416]" />
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
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "absolute right-0 top-[calc(100%+10px)] w-[420px] sm:w-[440px] max-w-[calc(100vw-2rem)]",
                "bg-white dark:bg-[#141416]",
                "rounded-2xl shadow-xl border border-slate-200/90 dark:border-white/10 z-50 overflow-hidden flex flex-col"
              )}
              style={{ maxHeight: 'min(640px, calc(100vh - 100px))' }}
            >
              {/* Sticky Top Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] text-[10.5px] font-bold px-2 py-0.2 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => markAllAsRead()} 
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline transition-colors cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate('/settings');
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="Notification Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tabs + Toolbar Row */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 dark:border-white/5 shrink-0 bg-slate-50/50 dark:bg-white/[0.01]">
                {/* Pill Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {TABS.map((t) => {
                    const isActive = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                          'px-3 py-1 rounded-full text-[12px] font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer',
                          isActive 
                            ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs' 
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
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
                        "w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer",
                        categoryFilter !== 'all'
                          ? "bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 border-[#8ba32b]/30 dark:border-[#c8e558]/30 text-[#8ba32b] dark:text-[#c8e558]"
                          : "border-slate-200/90 dark:border-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                      )}
                      title="Filter notifications"
                    >
                      <Filter className="w-3 h-3" />
                    </button>

                    {/* Filter Popup Menu */}
                    <AnimatePresence>
                      {showFilterMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.95 }}
                          className="absolute right-0 top-9 w-48 bg-white dark:bg-[#1a1a1c] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-xl z-50 p-2 text-left"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 mb-1">
                            Category
                          </div>
                          {[
                            { id: 'all', label: 'All Categories' },
                            { id: 'ai', label: 'AI Assistant' },
                            { id: 'social', label: 'Social & Requests' },
                            { id: 'achievement', label: 'Achievements' },
                            { id: 'system', label: 'System & Security' },
                          ].map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => { setCategoryFilter(cat.id); setShowFilterMenu(false); }}
                              className={cn(
                                "w-full text-left px-2.5 py-1.5 rounded-xl text-[12px] font-semibold flex items-center justify-between transition-colors cursor-pointer",
                                categoryFilter === cat.id
                                  ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white font-bold"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                              )}
                            >
                              {cat.label}
                              {categoryFilter === cat.id && <Check className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />}
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
                        "w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer",
                        sortBy !== 'latest'
                          ? "bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 border-[#8ba32b]/30 dark:border-[#c8e558]/30 text-[#8ba32b] dark:text-[#c8e558]"
                          : "border-slate-200/90 dark:border-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                      )}
                      title="Sort notifications"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </button>

                    {/* Sort Popup Menu */}
                    <AnimatePresence>
                      {showSortMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.95 }}
                          className="absolute right-0 top-9 w-44 bg-white dark:bg-[#1a1a1c] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-xl z-50 p-2 text-left"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 mb-1">
                            Sort By
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
                                "w-full text-left px-2.5 py-1.5 rounded-xl text-[12px] font-semibold flex items-center justify-between transition-colors cursor-pointer",
                                sortBy === s.id
                                  ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white font-bold"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                              )}
                            >
                              {s.label}
                              {sortBy === s.id && <Check className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Notification List Container */}
              <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {groupedItems.length > 0 ? (
                    groupedItems.map(([groupName, groupList]) => (
                      <div key={groupName} className="mb-3">
                        {/* Group Header Pill Divider */}
                        <div className="relative flex items-center justify-center my-3">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200/80 dark:border-white/5" />
                          </div>
                          <span className="relative z-10 px-2.5 py-0.2 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200/80 dark:border-white/5 text-[9.5px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
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
                            onSelectDetail={() => {
                              setOpen(false);
                              navigate('/notifications');
                            }}
                          />
                        ))}
                      </div>
                    ))
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-14 text-center px-6"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mb-3 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                        {tab === 'unread' ? "You're all caught up!" : 'No notifications'}
                      </p>
                      <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 max-w-[260px] leading-relaxed">
                        {tab === 'unread' 
                          ? 'Check back later for new study circle invites and quiz updates.' 
                          : 'New notifications will appear here as you continue learning.'}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Infinite Scroll Trigger */}
                {items.length > 0 && (
                  <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
                    {hasMore && (
                      <div className="w-4 h-4 border-2 border-[#8ba32b] dark:border-[#c8e558] border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                )}
              </div>

              {/* Pinned Bottom Footer Action */}
              <div className="p-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate('/notifications');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-[12px] font-semibold bg-white dark:bg-[#1c1c1f] border border-slate-200/90 dark:border-white/10 text-slate-800 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-all shadow-2xs cursor-pointer active:scale-98"
                >
                  <span>See all detailed notifications</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
