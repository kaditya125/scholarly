import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Clock, Loader2, CheckCircle2, XCircle, MinusCircle, AlertTriangle,
} from 'lucide-react';
import { useQuizAttempt, useSubmitQuizAttempt } from '../hooks/api/useQuizAttempts';
import { cn } from '../lib/utils';

/**
 * /quiz/attempts/:attemptId — takes a single quiz attempt through to a scored result.
 *
 * This is the real attempt-taking UI for backend-firestore's quiz-attempts system
 * (quizAttempts.service.ts / GET+submit `/quiz/attempts/:id`). It did not exist before Phase 3G:
 * TestEngine.tsx is a separate, hardcoded mock screen wired to `/quiz` + `/quiz/submit`, which
 * don't correspond to real generated attempts, so it could not be reused here. A class-assignment
 * attempt (classAssignment.service.ts `startAttempt`) is a normal QuizAttempt underneath, so this
 * page also works unmodified for a student's own self-serve generated quizzes in the future.
 */

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}

export default function QuizAttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const { attempt, isLoading, isError } = useQuizAttempt(attemptId);
  const submit = useSubmitQuizAttempt(attemptId);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCompleted = attempt?.status === 'completed';

  useEffect(() => {
    if (!attempt || isCompleted) return;
    const elapsedSeconds = (Date.now() - new Date(attempt.createdAt).getTime()) / 1000;
    setTimeLeft(Math.max(0, attempt.durationMinutes * 60 - elapsedSeconds));
  }, [attempt, isCompleted]);

  useEffect(() => {
    if (timeLeft === null || isCompleted) return;
    if (timeLeft <= 0) {
      void handleSubmit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isCompleted]);

  const handleSubmit = async () => {
    if (!attempt || submit.isPending || isCompleted) return;
    setError(null);
    const elapsedSeconds = Math.round((Date.now() - new Date(attempt.createdAt).getTime()) / 1000);
    try {
      await submit.mutateAsync({ answers, timeSpentSeconds: elapsedSeconds });
      setShowConfirm(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'We couldn’t submit your answers. Please try again.');
    }
  };

  const currentQ = attempt?.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  const scoredQuestions = useMemo(() => {
    if (!isCompleted || !attempt) return [];
    return attempt.questions.map((q) => ({
      ...q,
      selected: attempt.answers?.[q.id],
    }));
  }, [isCompleted, attempt]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  if (isError || !attempt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#131314] px-6 text-center">
        <AlertTriangle className="w-6 h-6 text-slate-400" aria-hidden />
        <p className="text-[14px] text-slate-600 dark:text-gray-300">We couldn&rsquo;t load this test.</p>
        <button onClick={() => navigate(-1)} className="text-[13.5px] font-semibold underline underline-offset-2">
          Go back
        </button>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#131314]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-8 space-y-6">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Back
          </button>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-8">
            <p className="text-[13px] font-medium text-slate-500 dark:text-gray-400">{attempt.title}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[36px] font-bold tracking-[-0.03em]">{attempt.accuracy ?? 0}%</span>
              <span className="text-[14px] text-slate-500 dark:text-gray-400">accuracy</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-slate-600 dark:text-gray-300">
              <span>Score: <strong>{attempt.score}</strong> / {attempt.maxMarks}</span>
              <span>Correct: {attempt.correctCount}</span>
              <span>Incorrect: {attempt.incorrectCount}</span>
              <span>Unattempted: {attempt.unattemptedCount}</span>
            </div>
          </div>

          <div className="space-y-3">
            {scoredQuestions.map((q, i) => {
              const isCorrect = q.selected === q.correctAnswerIndex;
              const isUnattempted = q.selected === undefined;
              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5">
                  <div className="flex items-start gap-2.5">
                    {isUnattempted ? (
                      <MinusCircle className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                    ) : isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
                    ) : (
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" strokeWidth={2} aria-hidden />
                    )}
                    <p className="text-[14px] font-medium leading-relaxed">{i + 1}. {q.text}</p>
                  </div>
                  <div className="mt-3 pl-[26px] space-y-1.5">
                    {q.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className={cn(
                          'text-[13px] px-3 py-1.5 rounded-lg border',
                          oi === q.correctAnswerIndex
                            ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                            : oi === q.selected
                              ? 'border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300'
                              : 'border-slate-100 dark:border-white/[0.06] text-slate-500 dark:text-gray-400',
                        )}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className="mt-3 pl-[26px] text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">{q.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!currentQ) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#fafbfc] dark:bg-[#131314] text-slate-900 dark:text-slate-100">
      <header className="h-16 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold truncate">{attempt.title}</p>
          <p className="text-[11.5px] text-slate-500 dark:text-gray-400">Question {currentIndex + 1} of {attempt.questions.length} · {answeredCount} answered</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {timeLeft !== null && (
            <span className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-mono text-[12.5px] font-medium border',
              timeLeft < 300 ? 'border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400' : 'border-slate-200 dark:border-white/12 text-slate-600 dark:text-gray-300',
            )}>
              <Clock className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              {formatTime(timeLeft)}
            </span>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-semibold"
          >
            Submit
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-5 sm:px-6 py-8">
          {error && <p className="mb-4 text-[13px] text-red-700 dark:text-red-400">{error}</p>}
          <h2 className="text-[16px] font-medium leading-relaxed mb-6">{currentQ.text}</h2>
          <div className="space-y-3" role="radiogroup" aria-label="Question options">
            {currentQ.options.map((opt, i) => {
              const isSelected = answers[currentQ.id] === i;
              return (
                <button
                  key={i}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: i }))}
                  className={cn(
                    'w-full text-left px-4 py-3.5 rounded-xl border-2 transition-colors flex items-start gap-3',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] hover:border-slate-300 dark:hover:border-white/20',
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5',
                    isSelected ? 'border-emerald-500' : 'border-slate-300 dark:border-white/20',
                  )}>
                    {isSelected && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                  </div>
                  <span className="text-[14px]">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-[720px] mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))}
            disabled={currentIndex === 0}
            className="h-9 px-4 rounded-lg border border-slate-200 dark:border-white/12 text-[13px] font-medium disabled:opacity-40"
          >
            Previous
          </button>
          <div className="hidden sm:flex flex-wrap gap-1.5 justify-center">
            {attempt.questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  'w-7 h-7 rounded-md text-[11.5px] font-semibold border',
                  answers[q.id] !== undefined
                    ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-white/12 text-slate-500 dark:text-gray-400',
                  currentIndex === i && 'ring-2 ring-slate-900 dark:ring-white ring-offset-1',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCurrentIndex((v) => Math.min(attempt.questions.length - 1, v + 1))}
            disabled={currentIndex === attempt.questions.length - 1}
            className="h-9 px-4 rounded-lg border border-slate-200 dark:border-white/12 text-[13px] font-medium disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </footer>

      {showConfirm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141416] border border-slate-200 dark:border-white/10 p-6">
            <h3 className="text-[16px] font-semibold">Submit test?</h3>
            <p className="mt-1.5 text-[13.5px] text-slate-500 dark:text-gray-400">
              {answeredCount} of {attempt.questions.length} answered
              {answeredCount < attempt.questions.length ? ` — ${attempt.questions.length - answeredCount} left blank.` : '.'}
            </p>
            {error && <p className="mt-2 text-[13px] text-red-700 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setShowConfirm(false)} className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/12 text-[13.5px] font-medium">
                Keep going
              </button>
              <button
                onClick={handleSubmit}
                disabled={submit.isPending}
                className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13.5px] font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {submit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
