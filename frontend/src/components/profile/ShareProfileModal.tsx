import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Copy,
  Check,
  Share2,
  ExternalLink,
  Target,
  Sparkles,
  Award,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useProfile } from '../../hooks/api/useProfile';
import { cn } from '../../lib/utils';

interface ShareProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareProfileModal({ isOpen, onClose }: ShareProfileModalProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const targetExam = profile?.goal || profile?.targetExam || 'Competitive Exams';
  const profileUrl = `${window.location.origin}/profile?u=${user?.uid || 'scholar'}`;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(profileUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${user?.displayName || 'Scholar'}'s Scholarly Profile`,
          text: `Check out my academic study profile on Scholarly preparing for ${targetExam}!`,
          url: profileUrl,
        });
      } catch {
        // Ignored if user dismissed share sheet
      }
    } else {
      handleCopyLink();
    }
  };

  const shareText = encodeURIComponent(
    `Check out my learning profile on Scholarly preparing for ${targetExam}! 🎓🚀 ${profileUrl}`
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          onClick={onClose}
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] p-6 shadow-2xl font-sans z-10 space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  Share Your Profile
                </h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Share your study goals with study partners &amp; mentors
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mini Profile Preview Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#222227] border border-slate-200/80 dark:border-white/10 flex items-center gap-3.5 shadow-2xs">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 dark:bg-white/10 border-2 border-white dark:border-[#1a1a1e] flex items-center justify-center text-lg font-bold text-[#8ba32b] dark:text-[#c8e558] shrink-0">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'S'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                {user?.displayName || 'Scholar Student'}
              </div>
              <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558]">
                <Target className="w-3 h-3" /> {targetExam}
              </div>
            </div>
          </div>

          {/* Copy Link Well */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300">
              Profile Link
            </label>
            <div className="flex items-center gap-2 p-1.5 pl-3 rounded-2xl bg-slate-100 dark:bg-[#202025] border border-slate-200 dark:border-white/10">
              <span className="flex-1 text-[12px] text-slate-600 dark:text-slate-300 truncate font-mono">
                {profileUrl}
              </span>
              <button
                onClick={handleCopyLink}
                className={cn(
                  'px-4 py-2 rounded-xl text-[12px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0',
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 hover:opacity-90'
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div className="space-y-2 pt-1">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Share directly via
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://api.whatsapp.com/send?text=${shareText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white hover:bg-slate-50 dark:bg-[#222227] dark:hover:bg-[#2a2a30] text-[12px] font-bold text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
              >
                <span>WhatsApp</span>
              </a>

              <a
                href={`https://twitter.com/intent/tweet?text=${shareText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white hover:bg-slate-50 dark:bg-[#222227] dark:hover:bg-[#2a2a30] text-[12px] font-bold text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
              >
                <span>Twitter / X</span>
              </a>
            </div>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full py-2 rounded-xl text-[12px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" /> More sharing options...
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
