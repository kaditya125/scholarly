import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, XCircle } from 'lucide-react';
import { QuizSpec } from '../../../lib/api/agent';
import { QuizAttempt, quizApi } from '../../../lib/api/quiz';
import { cn } from '../../../lib/utils';
import Notation from '../Notation';

/**
 * An agent's quiz, taken in the workspace. The questions are the student's quiz attempt, served by
 * the existing quiz routes with the key masked until submit, and scored by the existing grader —
 * so the result lands in their stats and weak topics like any other quiz. Formula markup (v^2,
 * f_c) is drawn as notation; answers that are formulae get the chart's italic-variable styling.
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const looksLikeFormula = (s: string) => /[_^=]/.test(s);

function Option({ text, className }: { text: string; className?: string }) {
  return looksLikeFormula(text) ? <Notation formula text={text} className={cn('font-serif text-[15.5px]', className)} /> : <Notation text={text} className={className} />;
}

export default function QuizPlayer({ spec, onAsk }: { spec: QuizSpec; onAsk?: (text: string) => void }) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      setAttempt(await quizApi.getAttempt(spec.attemptId));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.status === 404 ? 'This quiz is no longer available.' : 'Could not load the quiz.');
    }
  }, [spec.attemptId]);

  useEffect(() => {
    void load();
    // Taken on the full quiz page in another tab? Pick the result up on return.
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  if (error) return <p className="p-6 text-[13.5px] text-neutral-700 dark:text-neutral-300">{error}</p>;
  if (!attempt) {
    return (
      <div className="h-full flex items-center justify-center gap-2.5 text-[13px] text-slate-500 dark:text-gray-400" role="status">
        <span className="w-4 h-4 rounded-full border-2 border-indigo-500/25 border-t-indigo-500 motion-safe:animate-spin" aria-hidden />
        Loading the quiz…
      </div>
    );
  }

  const questions = attempt.questions;
  const answered = questions.filter((q) => answers[q.id] !== undefined).length;

  if (attempt.status === 'completed') {
    const chosen = attempt.answers ?? {};
    return (
      <div className="h-full overflow-y-auto p-5 flex flex-col gap-5 *:shrink-0">
        <section className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-gray-500">Your result</p>
            <p className="text-[34px] font-semibold tracking-[-0.02em] text-neutral-900 dark:text-neutral-50 tabular-nums">{attempt.accuracy ?? 0}%</p>
          </div>
          <p className="text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums text-right">
            {attempt.correctCount ?? 0} correct · {attempt.incorrectCount ?? 0} wrong · {attempt.unattemptedCount ?? 0} blank
            <br />
            Score {attempt.score ?? 0} / {attempt.maxMarks ?? questions.length}
          </p>
        </section>

        {attempt.topicBreakdown?.length ? (
          <section className="flex flex-col gap-2">
            {attempt.topicBreakdown.map((t) => (
              <div key={t.topic} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-40 shrink-0 truncate text-neutral-700 dark:text-neutral-200" title={t.topic}>{t.topic}</span>
                <span className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                  <span className={cn('block h-full rounded-full', t.accuracy < 60 ? 'bg-rose-500' : t.accuracy >= 80 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${Math.max(3, t.accuracy)}%` }} />
                </span>
                <span className="w-12 text-right tabular-nums text-slate-500 dark:text-gray-400">{t.correct}/{t.total}</span>
              </div>
            ))}
          </section>
        ) : null}

        {onAsk && (
          <button
            onClick={() => onAsk('Analyze my quiz mistakes and tell me what I should revise.')}
            className="self-start inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            Analyse my mistakes
          </button>
        )}

        <ol className="flex flex-col gap-4">
          {questions.map((q, i) => {
            const mine = chosen[q.id];
            const right = mine === q.correctAnswerIndex;
            return (
              <li key={q.id} className="rounded-xl border border-neutral-200 dark:border-white/10 p-4">
                <p className="text-[13.5px] font-medium leading-relaxed text-neutral-900 dark:text-neutral-100">
                  {i + 1}. <Notation text={q.text} />
                </p>
                <div className="mt-2 flex flex-col gap-1 text-[13px]">
                  {mine !== undefined && !right && (
                    <span className="inline-flex items-start gap-1.5 text-rose-700 dark:text-rose-300">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} /> <Option text={q.options[mine]} />
                    </span>
                  )}
                  {mine === undefined && <span className="text-slate-500 dark:text-gray-400">Left blank</span>}
                  <span className="inline-flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} /> <Option text={q.options[q.correctAnswerIndex]} />
                  </span>
                </div>
                {q.explanation && (
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
                    <Notation text={q.explanation} />
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const q = questions[index];
  const submit = async () => {
    setSubmitting(true);
    try {
      setAttempt(await quizApi.submitAttempt(attempt.id, { answers, timeSpentSeconds: Math.round((Date.now() - startedAt.current) / 1000) }));
    } catch {
      setError('Could not submit your answers. Please try again.');
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums">
        <span>
          Question {index + 1} of {questions.length} · {answered} answered
        </span>
        <a
          href={`/quiz/attempts/${attempt.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white"
        >
          Full page <ExternalLink className="w-3 h-3" strokeWidth={2} />
        </a>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4 *:shrink-0">
        <span className="self-start text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300">{q.topic}</span>
        <p className="text-[16px] leading-relaxed font-medium text-neutral-900 dark:text-neutral-50">
          <Notation text={q.text} />
        </p>
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Answer options">
          {q.options.map((opt, oi) => {
            const selected = answers[q.id] === oi;
            return (
              <button
                key={oi}
                role="radio"
                aria-checked={selected}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                className={cn(
                  'w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                  selected
                    ? 'border-indigo-400 dark:border-indigo-400/60 bg-indigo-50/70 dark:bg-indigo-500/10 text-neutral-900 dark:text-neutral-50'
                    : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 text-neutral-800 dark:text-neutral-200',
                )}
              >
                <span className={cn('w-6 h-6 rounded-full border text-[12px] font-semibold flex items-center justify-center shrink-0', selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-neutral-300 dark:border-white/20 text-slate-500')}>
                  {LETTERS[oi]}
                </span>
                <Option text={opt} className="pt-0.5" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-neutral-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} /> Previous
        </button>
        {confirming ? (
          <span className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-gray-300">
            {questions.length - answered} unanswered.
            <button onClick={submit} disabled={submitting} className="h-9 px-3 rounded-lg font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60">
              {submitting ? 'Submitting…' : 'Submit anyway'}
            </button>
            <button onClick={() => setConfirming(false)} className="h-9 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
              Keep going
            </button>
          </span>
        ) : index < questions.length - 1 ? (
          <button
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            Next <ChevronRight className="w-4 h-4" strokeWidth={2} />
          </button>
        ) : (
          <button
            onClick={() => (answered < questions.length ? setConfirming(true) : void submit())}
            disabled={submitting}
            className="h-9 px-3.5 rounded-lg text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            {submitting ? 'Submitting…' : 'Submit answers'}
          </button>
        )}
      </div>
    </div>
  );
}
