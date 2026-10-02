import { CheckCircle2, XCircle } from 'lucide-react';
import { ReportSpec } from '../../../lib/api/agent';
import { cn } from '../../../lib/utils';
import Notation from '../Notation';

/**
 * A performance analysis: weak areas first (with the evidence behind each and where to revise),
 * then what to do, then every question missed. Nothing here is re-scored in the browser — it is the
 * analysis as the agent saved it.
 */

const looksLikeFormula = (s: string) => /[_^=]/.test(s);
const pages = (refs?: Array<{ label: string; page?: number }>) => {
  if (!refs?.length) return null;
  const nums = [...new Set(refs.map((r) => r.page).filter((p): p is number => Boolean(p)))].sort((a, b) => a - b);
  return `${refs[0].label}${nums.length ? ` · ${nums.length === 1 ? 'p.' : 'pp.'} ${nums.join(', ')}` : ''}`;
};

export default function ReportView({ spec, onAsk }: { spec: ReportSpec; onAsk?: (text: string) => void }) {
  const attempts = spec.basis.attempts;
  return (
    <div className="h-full overflow-y-auto p-5 flex flex-col gap-6 *:shrink-0">
      <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
        From {attempts.length === 1 ? `“${attempts[0].title}” (${attempts[0].accuracy}%)` : `your last ${attempts.length} attempts`} · {spec.basis.questionsAnswered} questions answered
      </p>

      <section className="flex flex-col gap-3">
        <h3 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-gray-500">Weak areas</h3>
        {spec.weakAreas.length === 0 && <p className="text-[13.5px] text-neutral-700 dark:text-neutral-300">None — every topic is at 60% or above.</p>}
        {spec.weakAreas.map((w) => (
          <div key={`${w.examId ?? ''}:${w.topic}`} className="rounded-xl border border-rose-200/70 dark:border-rose-500/20 bg-rose-50/40 dark:bg-rose-500/[0.05] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-50">{w.topic}</span>
              <span className="text-[13px] tabular-nums text-rose-700 dark:text-rose-300">
                {w.correct}/{w.total} · {w.accuracy}%
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white dark:bg-white/[0.06] overflow-hidden">
              <span className="block h-full rounded-full bg-rose-500" style={{ width: `${Math.max(3, w.accuracy)}%` }} />
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[12px] text-slate-600 dark:text-gray-400">
              {w.confidence < 0.5 && <span>Only a few questions on this, so treat it as a hint.</span>}
              {pages(w.refs) && <span>Revise: {pages(w.refs)} of the chapter</span>}
              {w.syllabusPath?.length ? (
                <span>
                  {w.syllabusMatch === 'name' ? 'Matched by name to ' : 'Syllabus: '}
                  {w.syllabusPath.join(' › ')}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {spec.strongAreas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-gray-500">Strong</h3>
          <div className="flex flex-wrap gap-2">
            {spec.strongAreas.map((s) => (
              <span key={s.topic} className="text-[12.5px] px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 tabular-nums">
                {s.topic} · {s.accuracy}%
              </span>
            ))}
          </div>
        </section>
      )}

      {spec.recommendations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-gray-500">What to do</h3>
          <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-neutral-800 dark:text-neutral-200">
            {spec.recommendations.map((r, i) => (
              <li key={i}>
                <Notation text={r.action} />
              </li>
            ))}
          </ol>
          {onAsk && spec.weakAreas.length > 0 && (
            <button
              onClick={() => onAsk('Create a revision plan for those weak areas.')}
              className="self-start mt-1 h-9 px-3.5 rounded-lg text-[13px] font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              Plan my revision
            </button>
          )}
        </section>
      )}

      {spec.mistakes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-gray-500">Questions missed ({spec.mistakes.length})</h3>
          <ol className="flex flex-col gap-3">
            {spec.mistakes.map((m, i) => (
              <li key={i} className="rounded-xl border border-neutral-200 dark:border-white/10 p-4">
                <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500">{m.topic}</span>
                <p className="mt-1 text-[13.5px] leading-relaxed text-neutral-900 dark:text-neutral-100">
                  <Notation text={m.question} />
                </p>
                <div className="mt-2 flex flex-col gap-1 text-[13px]">
                  {m.yourAnswer ? (
                    <span className="inline-flex items-start gap-1.5 text-rose-700 dark:text-rose-300">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} />
                      <Notation formula={looksLikeFormula(m.yourAnswer)} text={m.yourAnswer} className={cn(looksLikeFormula(m.yourAnswer) && 'font-serif')} />
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-gray-400">Left blank</span>
                  )}
                  <span className="inline-flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} />
                    <Notation formula={looksLikeFormula(m.correctAnswer)} text={m.correctAnswer} className={cn(looksLikeFormula(m.correctAnswer) && 'font-serif')} />
                  </span>
                </div>
                {m.note && (
                  <p className="mt-2 text-[12px] text-slate-500 dark:text-gray-400">
                    <Notation text={m.note} />
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
