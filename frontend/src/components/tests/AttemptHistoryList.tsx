import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { FileText, Play, BarChart3, Clock3, Sparkles, BookOpen, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuizAttempts } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import type { QuizAttemptSummary, QuizSource } from '../../lib/api/quiz';

const sourceMeta: Record<QuizSource, { label: string; icon: React.ReactNode; cls: string }> = {
  'weak-areas': { label: 'Weak areas', icon: <Target className="w-3 h-3" />, cls: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40' },
  topic: { label: 'Topic', icon: <Sparkles className="w-3 h-3" />, cls: 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border border-slate-200/80 dark:border-white/10' },
  notebook: { label: 'Notebook', icon: <BookOpen className="w-3 h-3" />, cls: 'bg-[#c8e558]/15 text-slate-900 dark:text-[#c8e558] border border-[#c8e558]/30' },
};

function relativeDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day && new Date().getDate() === d.getDate()) return 'Today';
  if (diff < 2 * day) return 'Yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function AttemptRow({ a, onResume, onReport, index }: { a: QuizAttemptSummary; onResume: () => void; onReport: () => void; index: number }) {
  const completed = a.status === 'completed';
  const meta = sourceMeta[a.source] || sourceMeta.topic;
  const accuracy = a.accuracy ?? 0;
  const accColor = accuracy >= 80 ? 'text-emerald-600 dark:text-emerald-400' : accuracy >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-center gap-3.5 p-4 rounded-2xl border border-slate-200/90 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-xs"
    >
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', completed ? 'bg-slate-100 dark:bg-white/5' : 'bg-amber-500/10')}>
        {completed ? <FileText className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400" /> : <Clock3 className="w-4.5 h-4.5 text-amber-500" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{a.title}</h4>
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0', meta.cls)}>{meta.icon}{meta.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-slate-500">
          <span>{a.totalQuestions} Questions</span>
          <span>•</span>
          <span>{relativeDate(a.completedAt || a.createdAt)}</span>
          {!completed && <><span>•</span><span className="text-amber-600 dark:text-amber-400 font-semibold">In progress</span></>}
        </div>
      </div>

      {completed && (
        <div className="text-right shrink-0 hidden sm:block">
          <div className={cn('text-[14px] font-bold leading-none', accColor)}>{Math.round(accuracy)}%</div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{a.correctCount ?? 0}/{a.totalQuestions} correct</div>
        </div>
      )}

      {completed ? (
        <button
          onClick={onReport}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-200 text-[12px] font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer shadow-2xs"
        >
          <BarChart3 className="w-3.5 h-3.5" /> Report
        </button>
      ) : (
        <button
          onClick={onResume}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 text-[12px] font-semibold transition-all cursor-pointer shadow-xs active:scale-98"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> Resume
        </button>
      )}
    </motion.div>
  );
}

export function AttemptHistoryList() {
  const { attempts, isLoading } = useQuizAttempts();
  const launch = useLaunchTest();
  const navigate = useNavigate();

  return (
    <div className="font-sans">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">Generated Practice Tests</h3>
        {attempts.length > 0 && <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">{attempts.length} attempts recorded</span>}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[74px] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/60 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : attempts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3 text-slate-500">
            <FileText className="w-5 h-5" />
          </div>
          <h4 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">No tests recorded yet</h4>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm">
            Generate your first test above — every test you take is tracked here with your performance score and detailed breakdown.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {attempts.map((a, i) => (
            <AttemptRow
              key={a.id}
              a={a}
              index={i}
              onResume={() => launch({ resumeAttemptId: a.id, mode: a.mode, topic: a.topic, notebookId: a.notebookId, notebookTitle: a.notebookTitle })}
              onReport={() => navigate('/report', { state: { attemptId: a.id } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
