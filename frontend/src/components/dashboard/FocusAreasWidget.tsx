import { useNavigate } from 'react-router-dom';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLearningState, Severity } from '../../hooks/api/useLearningState';

/**
 * The measured counterpart to AiRecommendedDrills. That component suggests practice from
 * syllabus coverage and heuristic signals; this one reports only what the evidence-graded
 * pipeline (MasteryEngine + quiz history, via GET /learning-state) actually measured — no
 * topic appears here without enough graded attempts behind it.
 *
 * Absence of evidence is shown as absence, never as a zero: a student who hasn't graded enough
 * questions yet sees an honest "not enough evidence" state, not a discouraging score.
 */

const SEVERITY_STYLE: Record<Severity, string> = {
  HIGH: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  MODERATE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  LOW: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
};

function TrendIcon({ trend }: { trend: 'improving' | 'declining' | 'steady' | null }) {
  if (trend === 'improving') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === 'declining') return <TrendingDown className="w-3 h-3 text-rose-500" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

export function FocusAreasWidget() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { learningState, isLoading, isError } = useLearningState();

  // A nice-to-have measurement widget failing must never block or clutter the dashboard —
  // it simply doesn't render, the same way AiRecommendedDrills degrades to catalog defaults.
  if (isError) return null;

  if (isLoading) {
    return (
      <div className={cn(
        'h-40 rounded-2xl border animate-pulse',
        isDarkMode ? 'bg-[#161619] border-white/[0.08]' : 'bg-white border-slate-200/90',
      )} />
    );
  }

  const weaknesses = learningState?.analysis.weaknesses ?? [];
  const strengths = learningState?.analysis.strengths ?? [];
  const priority = learningState?.decisions.currentPriority;
  const hasEvidence = weaknesses.length > 0 || strengths.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3.5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <Target className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558]" />
          <span>Focus Areas</span>
          <span className="text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-white/10">
            Measured, not guessed
          </span>
        </h2>
      </div>

      {!hasEvidence ? (
        <div className={cn(
          'p-5 sm:p-6 rounded-2xl border text-center flex flex-col items-center justify-center',
          isDarkMode ? 'bg-[#161619] border-white/[0.08]' : 'bg-white border-slate-200/90',
        )}>
          <div className="relative flex items-center justify-center mb-3">
            <picture>
              <source
                srcSet={isDarkMode ? '/images/focus-areas-ai-dark.webp?v=4' : '/images/focus-areas-ai-light.webp?v=4'}
                type="image/webp"
              />
              <img
                src={isDarkMode ? '/images/focus-areas-ai-dark.png?v=4' : '/images/focus-areas-ai-light.png?v=4'}
                alt="AI learning assistant"
                className="w-32 sm:w-36 md:w-40 h-auto object-contain select-none pointer-events-none drop-shadow-xs"
                loading="eager"
              />
            </picture>
          </div>
          <p className="text-[12.5px] text-slate-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed">
            Complete a few graded practice questions on a topic and this fills in with exactly
            what to work on next — backed by your actual results, not a guess.
          </p>
          <button
            type="button"
            onClick={() => navigate('/tests')}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#c8e558] hover:bg-[#b8d548] text-slate-950 transition-colors shadow-xs cursor-pointer active:scale-95"
          >
            Start Practicing
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      ) : (
        <div className={cn(
          'rounded-2xl border overflow-hidden',
          isDarkMode ? 'bg-[#161619] border-white/[0.08]' : 'bg-white border-slate-200/90',
        )}>
          {priority?.status === 'AVAILABLE' && priority.topicLabel && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02]">
              <p className="text-[12px] text-slate-500 dark:text-gray-400">
                Highest priority right now
              </p>
              <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900 dark:text-white">
                {priority.topicLabel}
              </p>
            </div>
          )}

          {weaknesses.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              {weaknesses.slice(0, 3).map((w) => (
                <div key={w.topicId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100 truncate">
                      {w.topicLabel}
                    </div>
                    {w.subject && (
                      <div className="text-[11px] text-slate-400 dark:text-gray-500">{w.subject}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TrendIcon trend={w.trend} />
                    {w.accuracy != null && (
                      <span className="text-[11.5px] tabular-nums text-slate-500 dark:text-gray-400">
                        {Math.round(w.accuracy)}%
                      </span>
                    )}
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                      SEVERITY_STYLE[w.severity],
                    )}>
                      {w.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {strengths.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 dark:text-gray-500 mr-1">Strong:</span>
              {strengths.slice(0, 3).map((s) => (
                <span
                  key={s.topicId}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  {s.topicLabel}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
