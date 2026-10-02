import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Route, AlertTriangle } from 'lucide-react';
import { useCreateRemediationDrill } from '../../hooks/api/useQuizAttempts';
import type { PedagogicalDiagnostic, RemediationErrorCode } from '../../lib/api/quiz';
import { cn } from '../../lib/utils';

/**
 * Shows the prerequisite-graph diagnosis of a scored test and the "Fix this gap" action.
 *
 * Renders nothing when there is no diagnosis — including `null`, which means the test's exam is
 * outside the graph (we never show an invented diagnosis). The drill is generated on click, not
 * on submit; a diagnosis that already has a drill links straight to it.
 */
export default function PrerequisiteGapCard({
  attemptId,
  diagnostics,
}: {
  attemptId: string | undefined;
  diagnostics: PedagogicalDiagnostic[] | null | undefined;
}) {
  if (!attemptId || !diagnostics?.length) return null;
  return (
    <section aria-labelledby="prereq-gap-heading" className="space-y-3">
      <h2 id="prereq-gap-heading" className="text-[15px] font-semibold text-slate-900 dark:text-white">
        Prerequisite check
      </h2>
      {diagnostics.slice(0, 3).map((d) => (
        <DiagnosticCard key={d.id} attemptId={attemptId} d={d} />
      ))}
    </section>
  );
}

function ConceptChip({ c }: { c: PedagogicalDiagnostic['prerequisiteChain'][number] }) {
  const state = c.evidence === 'weak' ? 'weak' : c.evidence === 'strong' ? 'strong' : 'not tested yet';
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded-md text-[11.5px] border',
        c.evidence === 'weak'
          ? 'border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
          : c.evidence === 'strong'
            ? 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400',
      )}
      title={c.accuracy !== undefined ? `${c.accuracy}% — ${state}` : state}
    >
      {c.title}
      <span className="sr-only"> ({c.accuracy !== undefined ? `${c.accuracy}%, ` : ''}{state})</span>
    </span>
  );
}

const ERROR_COPY: Record<RemediationErrorCode, string> = {
  QUOTA_EXCEEDED: 'You’ve used this month’s allowance of AI-generated practice. It resets with your plan period.',
  REMEDIATION_IN_PROGRESS: 'This drill is already being prepared — try again in a few seconds.',
  REMEDIATION_GENERATION_FAILED: 'We couldn’t produce three questions with independently verified answers. Please try again.',
  DIAGNOSTIC_UNSUPPORTED: 'A drill isn’t available for this result.',
  DIAGNOSTIC_NOT_FOUND: 'This result has changed. Reload the page and try again.',
  NOT_FOUND: 'This test could not be found.',
};

function DiagnosticCard({ attemptId, d }: { attemptId: string; d: PedagogicalDiagnostic }) {
  const navigate = useNavigate();
  const create = useCreateRemediationDrill(attemptId);
  const [error, setError] = useState<string | null>(null);

  const existing = d.remediationDrill;
  const openDrill = (id: string) => navigate(`/quiz/attempts/${id}`);

  const onFix = async () => {
    setError(null);
    if (existing) return openDrill(existing.drillAttemptId);
    try {
      const outcome = await create.mutateAsync(d.id);
      openDrill(outcome.drill.drillAttemptId);
    } catch (e: any) {
      const code = e?.response?.data?.code as RemediationErrorCode | undefined;
      setError((code && ERROR_COPY[code]) || 'Something went wrong. Please try again.');
    }
  };

  const heading =
    d.status === 'ROOT_CAUSE_IDENTIFIED' ? 'You may have a prerequisite gap'
    : d.status === 'TOPIC_LEVEL_GAP' ? `The gap is in ${d.targetConcept} itself`
    : 'Check the prerequisites first';
  const action =
    existing ? 'Open your drill'
    : d.status === 'PREREQUISITES_UNASSESSED' ? 'Take a 3-question prerequisite check'
    : 'Fix this gap';
  const chain = d.prerequisiteChain;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Route className="w-4 h-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{heading}</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-gray-400">
            {d.topic}: {d.accuracy}% · confidence {d.confidence}
          </p>

          {d.rootCauseTitle && d.status === 'ROOT_CAUSE_IDENTIFIED' && (
            <p className="mt-3 text-[13px] text-slate-700 dark:text-gray-200">
              <span className="font-medium">Root concept:</span> {d.rootCauseTitle}
              {d.rootCauseChapter && <span className="text-slate-500 dark:text-gray-400"> — {d.rootCauseChapter}</span>}
            </p>
          )}
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-gray-300">
            <span className="font-medium text-slate-700 dark:text-gray-200">Why:</span> {d.explanation}
          </p>

          {chain.length > 1 && (d.status === 'ROOT_CAUSE_IDENTIFIED' ? (
            // A real dependency path: root → … → topic.
            <ol className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Prerequisite path">
              {chain.map((c, i) => (
                <li key={c.conceptId} className="inline-flex items-center gap-1.5">
                  <ConceptChip c={c} />
                  {i < chain.length - 1 && <ArrowRight className="w-3 h-3 text-slate-400" aria-hidden />}
                </li>
              ))}
            </ol>
          ) : (
            // Sibling prerequisites of the topic — not a chain, so no arrows between them.
            <div className="mt-3">
              <p className="text-[11.5px] font-medium text-slate-500 dark:text-gray-400 mb-1.5">{d.targetConcept} builds on</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Prerequisites">
                {chain.filter((c) => c.conceptId !== d.targetConceptId).map((c) => (
                  <li key={c.conceptId}><ConceptChip c={c} /></li>
                ))}
              </ul>
            </div>
          ))}

          {d.remediationEligible && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onFix}
                disabled={create.isPending}
                aria-busy={create.isPending}
                className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-slate-900 text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                {create.isPending ? 'Preparing 3 verified questions…' : action}
              </button>
              {existing && (
                <span className="text-[12px] text-slate-500 dark:text-gray-400">{existing.title}</span>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 flex items-start gap-1.5 text-[12.5px] text-red-700 dark:text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
