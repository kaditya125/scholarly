import { motion } from 'motion/react';
import { Sparkles, AlertTriangle, ArrowRight, ShieldCheck, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

export function WeakSectionsPanel() {
  const { report, isLoading } = useProgressReport();
  const launch = useLaunchTest();

  if (isLoading) {
    return <div className="h-[260px] rounded-[24px] border border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-white/5 animate-pulse" />;
  }

  const weak = report?.weakSections ?? [];
  const strong = report?.strongSections ?? [];
  const narrative = report?.narrative;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-[24px] border bg-white border-slate-200 dark:bg-[#1e1e1f] dark:border-white/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden"
    >
      {/* Narrative / progress report */}
      <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/10 border-b border-slate-200 dark:border-white/10 relative">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <Sparkles className="w-20 h-20 text-indigo-500" />
        </div>
        <div className="flex items-center gap-2 mb-2 relative z-10">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Your progress report</h3>
        </div>
        <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300 relative z-10">
          {narrative || 'Generate your first test to unlock personalized feedback.'}
        </p>
      </div>

      {/* Work on these sections */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">Work on these sections</h4>
        </div>

        {weak.length === 0 ? (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/15 border border-green-100 dark:border-green-800/40">
            <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-green-800 dark:text-green-300 font-medium">
              {report && report.totalTests > 0
                ? 'No weak sections right now — your accuracy is solid across the board. Keep it up!'
                : 'Your weak sections will appear here once you complete a test.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {weak.slice(0, 5).map((s) => (
              <div key={s.topic} className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">{s.topic}</span>
                  <span className="text-[12px] font-bold text-rose-600 dark:text-rose-400 shrink-0">{s.accuracy}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden mb-3">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${s.accuracy}%` }} />
                </div>
                <button
                  onClick={() => launch({ topic: s.topic, mode: 'exam' })}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12.5px] font-semibold transition-colors"
                >
                  Practice {s.topic.length > 22 ? 'this section' : s.topic} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {strong.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2 mb-2.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">Your strengths</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {strong.slice(0, 6).map((s) => (
                <span
                  key={s.topic}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold',
                    'bg-green-100 text-green-700 dark:bg-green-900/25 dark:text-green-400'
                  )}
                >
                  {s.topic} · {s.accuracy}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
