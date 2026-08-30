import React from 'react';
import { Sparkles, ShieldCheck, Zap, Target, ArrowRight, X, Clock, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface PreAssessmentScreenProps {
  isOpen: boolean;
  onClose?: () => void;
  onStart: () => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

export function PreAssessmentScreen({
  isOpen,
  onClose,
  onStart,
  onSkip,
  isLoading,
}: PreAssessmentScreenProps) {
  if (!isOpen) return null;

  const handleDismiss = onClose || onSkip;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-8 text-slate-900 dark:text-white shadow-2xl my-auto"
        >
          {/* Close / Skip button */}
          {handleDismiss && (
            <button
              onClick={handleDismiss}
              className="absolute right-5 top-5 rounded-lg p-1.5 text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Skip for now"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Header */}
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6ca855]/10 dark:bg-[#c8e558]/10 border border-[#6ca855]/20 dark:border-[#c8e558]/20 text-[#6ca855] dark:text-[#c8e558] text-[11.5px] font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Initial Diagnostic Calibration</span>
            </div>

            <h2 className="mt-3 text-[22px] sm:text-[25px] font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
              Let&apos;s Understand Your Current Learning Level
            </h2>

            <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-gray-400 font-normal">
              Before creating your personalized study schedule, Sadhya calibrates your baseline understanding across key exam concepts to focus your revision where it matters most.
            </p>
          </div>

          {/* 3 Clean Diagnostic Pillars */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
                <ShieldCheck className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558] shrink-0" />
                <span>No Pass or Fail</span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 leading-relaxed">
                Pure diagnostic test to detect strengths and learning gaps.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
                <Zap className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558] shrink-0" />
                <span>Adaptive Engine</span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 leading-relaxed">
                Difficulty calibrates dynamically based on your answers.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
                <Target className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558] shrink-0" />
                <span>Custom Plan</span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 leading-relaxed">
                Builds your syllabus mastery heatmap and daily revision queue.
              </p>
            </div>
          </div>

          {/* Test Parameters Bar */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center gap-y-2 gap-x-4 text-[12.5px] text-slate-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" /> 20&ndash;25 Questions
            </span>
            <span className="text-slate-300 dark:text-gray-700">&bull;</span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> ~20 Minutes
            </span>
            <span className="text-slate-300 dark:text-gray-700">&bull;</span>
            <span>Adaptive Cognitive Levels</span>
          </div>

          {/* Action Row */}
          <div className="mt-6 pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            {onSkip ? (
              <button
                type="button"
                onClick={onSkip}
                disabled={isLoading}
                className="w-full sm:w-auto text-[13.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white py-2 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Skip for now
              </button>
            ) : <div />}

            <button
              onClick={onStart}
              disabled={isLoading}
              className={cn(
                'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all cursor-pointer',
                isLoading
                  ? 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-xs'
              )}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Preparing Questions...</span>
                </>
              ) : (
                <>
                  <span>Begin Baseline Assessment</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
