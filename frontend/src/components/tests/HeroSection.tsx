import { motion } from 'motion/react';
import { Play, Target, Sparkles, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';
import { useQuizAttempts } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

interface HeroSectionProps {
  examTarget: string;
}

/** Compact page header: greeting on the left, one primary action (resume or daily diagnostic) on the right. */
export function HeroSection({ examTarget }: HeroSectionProps) {
  const { user } = useAuth();
  const launch = useLaunchTest();
  const { attempts } = useQuizAttempts();

  const activeAttempt = attempts.find(a => a.status === 'in-progress');
  const displayName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Scholar';
  const targetLabel = examTarget || 'Competitive Exams';

  const answered = activeAttempt ? (activeAttempt.answeredCount ?? activeAttempt.correctCount ?? 0) : 0;
  const pct = activeAttempt ? Math.round((answered / (activeAttempt.totalQuestions || 1)) * 100) : 0;

  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="min-w-0"
      >
        <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#c8e558]/15 text-slate-700 dark:text-[#c8e558] border border-[#c8e558]/30">
          <Target className="w-3 h-3" />
          Preparing for {targetLabel} 2026
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] leading-tight text-slate-900 dark:text-white">
          Welcome back, {displayName}
        </h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
          AI-generated mock tests calibrated to your syllabus and weak areas.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="w-full lg:w-[380px] shrink-0 rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] p-3 flex flex-wrap sm:flex-nowrap items-center gap-3"
      >
        {activeAttempt ? (
          <>
            <div className="relative w-10 h-10 shrink-0">
              <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-slate-100 dark:stroke-white/10" />
                <circle
                  cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
                  className="stroke-[#8ba32b] dark:stroke-[#c8e558]"
                  strokeDasharray={`${(pct / 100) * 94.2} 94.2`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{pct}%</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">Resume where you left off</div>
              <div className="text-[13px] font-semibold text-slate-900 dark:text-white line-clamp-2 sm:line-clamp-1 leading-snug">{activeAttempt.title}</div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400">{answered}/{activeAttempt.totalQuestions} answered · <span className="capitalize">{activeAttempt.mode}</span></div>
            </div>
            <button
              onClick={() => launch({ resumeAttemptId: activeAttempt.id, mode: activeAttempt.mode })}
              className="w-full sm:w-auto shrink-0 h-9 sm:h-8 px-3 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 transition-colors cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" /> Resume
            </button>
          </>
        ) : (
          <>
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558]')}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8ba32b] dark:text-[#c8e558]">Daily AI diagnostic</div>
              <div className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">10-question smart test</div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">High-yield concepts and common traps</div>
            </div>
            <button
              onClick={() => launch({ count: 10, mode: 'exam', topic: examTarget || 'General Aptitude' })}
              className="w-full sm:w-auto shrink-0 h-9 sm:h-8 px-3 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 transition-colors cursor-pointer"
            >
              <Zap className="w-3 h-3 fill-current" /> Start
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
