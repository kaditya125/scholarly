import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { FileText, Play, BarChart3, Clock3, Sparkles, BookOpen, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuizAttempts } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import type { QuizAttemptSummary, QuizSource } from '../../lib/api/quiz';

const sourceMeta: Record<QuizSource, { label: string; icon: React.ReactNode; cls: string }> = {
  'weak-areas': { label: 'Weak areas', icon: <Target className="w-3 h-3" />, cls: 'bg-rose-100 text-rose-600 dark:bg-rose-900/25 dark:text-rose-400' },
  topic: { label: 'Topic', icon: <Sparkles className="w-3 h-3" />, cls: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/25 dark:text-indigo-400' },
  notebook: { label: 'Notebook', icon: <BookOpen className="w-3 h-3" />, cls: 'bg-teal-100 text-teal-600 dark:bg-teal-900/25 dark:text-teal-400' },
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
  const meta = sourceMeta[a.source];
  const accuracy = a.accuracy ?? 0;
  const accColor = accuracy >= 80 ? 'text-green-600 dark:text-green-400' : accuracy >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e1e1f] hover:border-slate-300 dark:hover:border-white/20 transition-colors"
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', completed ? 'bg-slate-100 dark:bg-white/5' : 'bg-amber-100 dark:bg-amber-900/25')}>
        {completed ? <FileText className="w-5 h-5 text-slate-500 dark:text-gray-400" /> : <Clock3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 truncate">{a.title}</h4>
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0', meta.cls)}>{meta.icon}{meta.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-gray-500">
          <span>{a.totalQuestions} Qs</span>
          <span>·</span>
          <span>{relativeDate(a.completedAt || a.createdAt)}</span>
          {!completed && <><span>·</span><span className="text-amber-600 dark:text-amber-400 font-semibold">In progress</span></>}
        </div>
      </div>

      {completed && (
        <div className="text-right shrink-0 hidden sm:block">
          <div className={cn('text-[15px] font-bold leading-none', accColor)}>{accuracy}%</div>
          <div className="text-[11px] text-slate-400 dark:text-gray-500 mt-1">{a.correctCount ?? 0}/{a.totalQuestions} correct</div>
        </div>
      )}

      {completed ? (
        <button
          onClick={onReport}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-[12.5px] font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <BarChart3 className="w-4 h-4" /> Report
        </button>
      ) : (
        <button
          onClick={onResume}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12.5px] font-semibold transition-colors"
        >
          <Play className="w-4 h-4" /> Resume
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Your tests</h3>
        {attempts.length > 0 && <span className="text-[12px] font-medium text-slate-400 dark:text-gray-500">{attempts.length} generated</span>}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[74px] rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : attempts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-[24px] border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-[#1e1e1f]">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h4 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 mb-1">No tests yet</h4>
          <p className="text-[13px] text-slate-500 dark:text-gray-400 max-w-xs">
            Generate your first test above — every test you create is tracked here with your score and a detailed report.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
