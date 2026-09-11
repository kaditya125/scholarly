import React, { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Inbox, ExternalLink, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { PyqSource, PyqQuestion, paperVariant, documentTypeLabel } from '../../lib/api/pyq';
import { usePyqQuestions } from '../../hooks/ai/usePyqSources';
import { cn } from '../../lib/utils';

/**
 * One paper, and the questions in it.
 *
 * Clicking a paper used to navigate to /tests, which is a different feature with a different
 * intent: a test is timed, scored and attempted once. Opening a document from a document library
 * should show the document. Reading a past paper and sitting a mock exam are not the same action
 * and should not share a click target.
 *
 * Answers are collapsed by default. A past paper is most useful attempted before it is checked,
 * and revealing the answer beside every question removes that option from the reader.
 */
interface Props {
  paper: PyqSource;
  onBack: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/** Options arrive as either an array or a keyed object depending on the ingestion generation. */
function optionList(o: PyqQuestion['options']): { key: string; text: string }[] {
  if (!o) return [];
  if (Array.isArray(o)) return o.map((text, i) => ({ key: String.fromCharCode(65 + i), text: String(text) }));
  return Object.entries(o).map(([key, text]) => ({ key: key.toUpperCase(), text: String(text) }));
}

export function PyqPaperView({ paper, onBack }: Props) {
  // Filter by the same fields that identify the paper. Narrower than sourceId, but the questions
  // endpoint filters on exam/year/session/shift, not on source.
  const { questions, isLoading, isError } = usePyqQuestions({
    examId: paper.examId,
    year: paper.year,
    session: paper.session,
    shift: paper.shift,
  });

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const ordered = useMemo(
    () => [...questions].sort((a, b) => (a.questionNumber ?? 0) - (b.questionNumber ?? 0)),
    [questions],
  );

  const subjects = useMemo(
    () => Array.from(new Set(ordered.map((q) => q.subject).filter(Boolean))) as string[],
    [ordered],
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mb-5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        {paper.examName || paper.examId}
      </button>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {paper.year} · {paperVariant(paper)}
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            {[documentTypeLabel(paper.documentType), paper.authority, paper.language?.toUpperCase()]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {paper.sourceUrl && (
          <a
            href={paper.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-medium bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:border-[#8ba32b]/45 dark:hover:border-[#c8e558]/35 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Official source
          </a>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
          <span className="text-[13px] text-slate-400">Loading questions…</span>
        </div>
      ) : isError || ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 px-5 py-12 text-center">
          <Inbox className="w-5 h-5 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-[13px] text-slate-600 dark:text-slate-300 font-medium">
            {isError ? 'Could not load questions for this paper' : 'No questions indexed for this paper yet'}
          </p>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1">
            {isError
              ? 'The paper is listed, but its questions could not be fetched.'
              : 'The paper is in the registry; its questions have not been extracted and indexed.'}
            {paper.sourceUrl && ' The official source is linked above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
              {ordered.length} question{ordered.length === 1 ? '' : 's'}
            </span>
            {subjects.length > 0 && (
              <span className="text-[12px] text-slate-400 dark:text-slate-500">{subjects.join(' · ')}</span>
            )}
          </div>

          <div className="space-y-2.5 pb-10">
            {ordered.map((q) => {
              const isOpen = revealed.has(q.questionId);
              const opts = optionList(q.options);
              return (
                <div
                  key={q.questionId}
                  className="rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-slate-400 dark:text-slate-500 mt-0.5 w-6">
                      {q.questionNumber ?? '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] text-slate-900 dark:text-white leading-relaxed">
                        {q.questionText || '(question text not extracted)'}
                      </p>

                      {opts.length > 0 && (
                        <div className="mt-2.5 space-y-1">
                          {opts.map(({ key, text }) => {
                            const isCorrect =
                              isOpen &&
                              q.correctAnswer &&
                              (q.correctAnswer.toUpperCase() === key || q.correctAnswer === text);
                            return (
                              <div
                                key={key}
                                className={cn(
                                  'flex items-start gap-2 px-2.5 py-1.5 rounded-lg border text-[12.5px]',
                                  isCorrect
                                    ? 'border-[#8ba32b]/30 dark:border-[#c8e558]/30 bg-[#8ba32b]/8 dark:bg-[#c8e558]/10'
                                    : 'border-transparent',
                                )}
                              >
                                <span className="text-slate-400 dark:text-slate-500 font-medium">{key}</span>
                                <span className="text-slate-700 dark:text-slate-300">{text}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center gap-3">
                        {q.correctAnswer && (
                          <button
                            onClick={() => toggle(q.questionId)}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6ca855] dark:text-[#c8e558] hover:underline cursor-pointer"
                          >
                            {isOpen ? 'Hide answer' : 'Show answer'}
                            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-180')} />
                          </button>
                        )}
                        <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
                          {[q.subject, q.marks ? `${q.marks} mark${q.marks === 1 ? '' : 's'}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>

                      {isOpen && opts.length === 0 && q.correctAnswer && (
                        <p className="mt-2 text-[12.5px] text-slate-700 dark:text-slate-300">
                          <span className="font-medium">Answer:</span> {q.correctAnswer}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}
