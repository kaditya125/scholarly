import { motion } from 'motion/react';
import { Sparkles, AlertTriangle, ArrowRight, ShieldCheck, Trophy, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

export function WeakSectionsPanel() {
  const { report, isLoading } = useProgressReport();
  const launch = useLaunchTest();

  if (isLoading) {
    return <div className="h-[260px] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/60 dark:bg-white/5 animate-pulse" />;
  }

  const weak = report?.weakSections ?? [];
  const strong = report?.strongSections ?? [];
  const narrative = report?.narrative;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border bg-white border-slate-200/90 dark:bg-white/[0.04] dark:border-white/[0.07] shadow-xs overflow-hidden font-sans"
    >
      {/* Narrative / progress report */}
      <div className="p-5 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200/80 dark:border-white/10 relative">
        <div className="flex items-center gap-2 mb-1.5 relative z-10">
          <div className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-[14.5px] font-semibold text-slate-900 dark:text-white">AI Progress Analysis</h3>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 relative z-10">
          {narrative || 'Complete practice tests to unlock Gemini-powered personalized mastery analysis.'}
        </p>
      </div>

      {/* Work on these sections */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h4 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Priority Weak Sections</h4>
        </div>

        {weak.length === 0 ? (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200/60 dark:border-emerald-800/40">
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-emerald-800 dark:text-emerald-300 font-medium">
              {report && report.totalTests > 0
                ? 'No critical weak sections detected — your accuracy is balanced across topics. Keep pushing!'
                : 'Your weak sections will dynamically calibrate here once you complete a diagnostic test.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {weak.slice(0, 4).map((s) => (
              <div key={s.topic} className="p-3.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{s.topic}</span>
                  <span className="text-[12px] font-bold text-rose-600 dark:text-rose-400 shrink-0">{Math.round(s.accuracy)}% accuracy</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden mb-2.5">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.round(s.accuracy)}%` }} />
                </div>
                <button
                  onClick={() => launch({ topic: s.topic, mode: 'exam', count: 10 })}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 text-[12px] font-semibold transition-all cursor-pointer shadow-xs"
                >
                  Targeted Drill ({s.topic.length > 20 ? s.topic.slice(0, 20) + '…' : s.topic}) <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {strong.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <h4 className="text-[12.5px] font-semibold text-slate-900 dark:text-white">Mastered Topics</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {strong.slice(0, 6).map((s) => (
                <span
                  key={s.topic}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  {s.topic} · {Math.round(s.accuracy)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
