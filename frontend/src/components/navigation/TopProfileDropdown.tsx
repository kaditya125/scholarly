import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Share2,
  Settings,
  KeyRound,
  GraduationCap,
  LogOut,
  ChevronRight,
  Target,
  Sparkles,
  Flame,
  Award,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useProfile } from '../../hooks/api/useProfile';
import { usePlan } from '../../hooks/usePlan';
import { ShareProfileModal } from '../profile/ShareProfileModal';
import { cn } from '../../lib/utils';

export function TopProfileDropdown() {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const { isPro } = usePlan();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const targetExam = profile?.goal || profile?.targetExam || 'Competitive Exams';

  const handleNavigate = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate('/signin');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Top Right Avatar Button Trigger ─────────────────────── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        className="group relative flex items-center p-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#c8e558] cursor-pointer"
      >
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-slate-900 dark:bg-white/10 text-white flex items-center justify-center text-[13px] font-bold uppercase overflow-hidden ring-2 ring-slate-200/90 dark:ring-white/10 group-hover:ring-[#8ba32b] dark:group-hover:ring-[#c8e558] transition-all shadow-xs">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'
            )}
          </div>
          {isPro && (
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-[#c8e558] text-slate-950 rounded-full text-[8px] font-black tracking-wider border-2 border-white dark:border-[#131314] shadow-xs" title="Pro Member">
              PRO
            </span>
          )}
        </div>
      </button>

      {/* ── Dropdown Popover ───────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-3xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xl p-4 z-50 font-sans text-left"
          >
            {/* 1. Header Profile Summary */}
            <div className="flex items-center gap-3 pb-3.5 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="relative">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 dark:bg-[#222227] border-2 border-slate-200 dark:border-white/10 flex items-center justify-center text-lg font-bold text-[#8ba32b] dark:text-[#c8e558] shrink-0">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'
                  )}
                </div>
                {isPro && (
                  <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-[#c8e558] text-slate-950 rounded-full text-[8px] font-black tracking-wider border-2 border-white dark:border-[#1a1a1e] shadow-xs">
                    PRO
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="text-[14.5px] font-bold text-slate-900 dark:text-white truncate">
                    {user?.displayName || 'Scholar Student'}
                  </div>
                  {isPro && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-[#c8e558] text-slate-900 shrink-0 shadow-2xs">
                      <Sparkles className="w-2.5 h-2.5 fill-current" /> PRO
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {user?.email}
                </div>
                <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558]">
                  <Target className="w-2.5 h-2.5" />
                  <span>{targetExam}</span>
                </div>
              </div>
            </div>

            {/* 2. Primary Action: View Profile */}
            <div className="pt-3 space-y-2">
              <button
                onClick={() => handleNavigate('/profile')}
                className="w-full py-2.5 px-3.5 rounded-2xl bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 font-bold text-[13px] flex items-center justify-between shadow-xs hover:opacity-90 active:scale-98 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>View Full Profile</span>
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* 3. Secondary Action: Share Profile */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsShareModalOpen(true);
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-semibold text-[12.5px] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
                <span>Share Profile</span>
              </button>
            </div>

            {/* 4. Quick Nav Menu Items */}
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] space-y-0.5 text-[12.5px]">
              <button
                onClick={() => handleNavigate('/profile')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <GraduationCap className="w-4 h-4 text-slate-400" />
                <span>Academic &amp; AI Profile</span>
              </button>

              <button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Account Settings</span>
              </button>

              {/* Sign Out */}
              <div className="pt-1 mt-1 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reusable Share Profile Modal ───────────────────────── */}
      <ShareProfileModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
}
