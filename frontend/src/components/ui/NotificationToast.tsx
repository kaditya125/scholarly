import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Bell } from 'lucide-react';
import { useNotificationStore } from '../../lib/store/useNotificationStore';
import { NotificationPayload } from '../../lib/api/notifications';

export function NotificationToast() {
  const { notifications } = useNotificationStore();
  const [activeToast, setActiveToast] = useState<NotificationPayload | null>(null);

  // Simple heuristic: if a new notification arrives and its timestamp is very recent (e.g. last 5 seconds), show it.
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    const now = Date.now();
    const createdAt = new Date(latest.createdAt).getTime();
    
    // If created within the last 10 seconds and unread
    if (!latest.isRead && (now - createdAt < 10000)) {
      setActiveToast(latest);
      
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9, rotateX: 20 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(8px)' }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="pointer-events-auto w-[360px] bg-white/95 dark:bg-[#1f1f1f]/95 backdrop-blur-xl border border-slate-200/60 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-2xl p-4 flex gap-4 overflow-hidden relative"
          >
            {/* Ambient background glow based on category can be added here */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            
            <div className="shrink-0 pt-1">
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Bell className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                {activeToast.title}
              </h4>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                {activeToast.body}
              </p>
            </div>
            
            <button 
              onClick={() => setActiveToast(null)}
              className="shrink-0 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors self-start"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
