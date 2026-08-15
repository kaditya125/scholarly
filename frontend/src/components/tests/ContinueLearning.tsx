import { Clock, PlayCircle, CheckCircle2, RotateCcw, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useQuizAttempts } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { useNavigate } from 'react-router-dom';

export function ContinueLearning() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();
  const launch = useLaunchTest();
  const { attempts, isLoading } = useQuizAttempts();

  const inProgressAttempts = attempts.filter(a => a.status === 'in-progress');
  const recentCompleted = attempts.filter(a => a.status === 'completed').slice(0, 2);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white">
          Continue Learning
        </h2>
        <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] animate-pulse h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          {inProgressAttempts.length > 0 ? "In-Progress Tests" : "Recent Practice"}
        </h2>
      </div>

      {inProgressAttempts.length > 0 ? (
        <div className="space-y-3">
          {inProgressAttempts.map((attempt) => {
            const answered = attempt.answeredCount ?? attempt.correctCount ?? 0;
            const pct = Math.round((answered / (attempt.totalQuestions || 1)) * 100);
            return (
              <div
                key={attempt.id}
                className={cn(
                  "p-5 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all",
                  isDarkMode 
                    ? "bg-white/[0.04] border-white/[0.07] shadow-xs hover:border-white/[0.14] hover:bg-white/[0.06]" 
                    : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300"
                )}
              >
                <div className="flex-1 w-full min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">
                      {attempt.title}
                    </h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md border border-amber-500/20 shrink-0">
                      Paused
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-3">
                    <span className="capitalize">{attempt.mode} Mode</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      {answered} of {attempt.totalQuestions} Answered ({pct}%)
                    </span>
                  </div>

                  <div className="w-full max-w-md h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#c8e558] transition-all duration-500 ease-out" 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
                
                <button 
                  onClick={() => launch({ resumeAttemptId: attempt.id, mode: attempt.mode })}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-xs active:scale-[0.98] shrink-0"
                >
                  <PlayCircle className="w-4 h-4" />
                  Resume Now
                </button>
              </div>
            );
          })}
        </div>
      ) : recentCompleted.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recentCompleted.map((attempt) => (
            <div
              key={attempt.id}
              className={cn(
                "p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all",
                isDarkMode 
                  ? "bg-white/[0.04] border-white/[0.07] shadow-xs hover:border-white/[0.14] hover:bg-white/[0.06]" 
                  : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300"
              )}
            >
              <div>
                <div className="flex justify-between items-start mb-1.5">
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                    {attempt.title}
                  </h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/20">
                    {Math.round(attempt.accuracy || 0)}% Score
                  </span>
                </div>
                <p className="text-[12px] text-slate-400">
                  {attempt.score}/{attempt.totalQuestions} Correct • Completed {new Date(attempt.completedAt || attempt.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <button
                  onClick={() => launch({ topic: attempt.topic || attempt.title, count: attempt.totalQuestions, mode: attempt.mode })}
                  className="flex-1 py-1.5 text-[12px] font-semibold rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 transition-colors flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Retake
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn(
          "p-6 rounded-2xl border text-center flex flex-col items-center justify-center gap-3",
          isDarkMode ? "bg-white/[0.03] border-white/[0.07]" : "bg-white border-slate-200/90 shadow-xs"
        )}>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[#8ba32b] dark:text-[#c8e558]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">
              No Practice Tests in Progress
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm">
              Generate a custom AI mock test or pick from featured test series below to kickstart your practice.
            </p>
          </div>
          <button
            onClick={() => launch({ count: 10, mode: 'exam', topic: 'Full Syllabus Mixed Diagnostic' })}
            className="mt-1 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[12.5px] font-semibold flex items-center gap-1.5 transition-all shadow-xs"
          >
            Start First Test <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
