import React, { useEffect, useMemo, useState } from 'react';
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
 *
 * -- Why the query is scoped to exam + year, not to the exact sitting -------------------------
 * This view first asked for examId + year + session + shift, on the assumption that the source
 * registry and the question bank describe a sitting the same way. They do not:
 *
 *   - shift     the registry writes "Shift 1"; questions write "1", "13 April Shift 1", "Set A",
 *               or nothing. An equality filter on "Shift 1" therefore matches almost nothing, and
 *               every paper whose registry entry carries a shift came back empty.
 *   - sourceId  not a join key either. Both sides have the field, but they are separate id
 *               spaces: zero of the 33,048 questions carry a sourceId found in the registry.
 *
 * Exam and year are the only two fields that agree across both sides, so they are what we query.
 * That deliberately returns more than this one sitting, which is why the questions are split
 * below rather than presented wholesale as this paper's contents: labelling another shift's
 * questions as this shift's would invent provenance the data does not support.
 */
interface Props {
  paper: PyqSource;
  onBack: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * How wide a window over the year to pull, and how much of it to draw at once.
 *
 * The cap has to be generous because the split below happens on the client: the server can only
 * narrow to exam + year, so a paper's own sitting has to be inside the window or the page reports
 * it missing. At 300 a JEE Main April paper saw 300 January questions and concluded it had none.
 * 1,000 is where the gain flattens — it settles 127 of 173 papers, and 1,500 settles no more —
 * and with `compact` trimming each question to ~800 bytes it stays a modest response.
 *
 * PAGE is separate, because drawing 1,000 question cards is a cost the reader pays in scroll and
 * layout for questions they have not asked to see.
 */
const LIMIT = 1000;
const PAGE = 60;

/** Options arrive as either an array or a keyed object depending on the ingestion generation. */
function optionList(o: PyqQuestion['options']): { key: string; text: string }[] {
  if (!o) return [];
  if (Array.isArray(o)) return o.map((text, i) => ({ key: String.fromCharCode(65 + i), text: String(text) }));
  return Object.entries(o).map(([key, text]) => ({ key: key.toUpperCase(), text: String(text) }));
}

/** "Shift 1" | "1" | "13 April Shift 1" -> 1. "Set A" -> null. */
function shiftNo(v?: string): number | null {
  if (!v) return null;
  const m = v.match(/shift\s*(\d+)/i) || v.match(/^\s*(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/**
 * "Session 1 (Jan)" -> [1], "Session 1 & 2" -> [1, 2].
 *
 * Gated on the word "session" so that "67th CCE Prelims (Re-Exam)" does not read as session 67.
 */
function sessionNos(v?: string): number[] {
  if (!v || !/session/i.test(v)) return [];
  return Array.from(v.matchAll(/\d+/g), (m) => Number(m[0]));
}

/**
 * Does the question's own metadata place it at this sitting?
 *
 * Requires a field to actively agree, not merely to avoid disagreeing — otherwise a question
 * carrying no session and no shift would corroborate every paper it was compared against.
 */
function corroborates(q: PyqQuestion, p: PyqSource): boolean {
  const ps = sessionNos(p.session);
  const qs = sessionNos(q.session);
  if (ps.length && qs.length && !qs.some((n) => ps.includes(n))) return false;

  const pShift = shiftNo(p.shift);
  const qShift = shiftNo(q.shift);
  if (pShift !== null && qShift !== null && pShift !== qShift) return false;

  return (ps.length > 0 && qs.length > 0) || (pShift !== null && qShift !== null);
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <button
      onClick={onMore}
      className="mt-3 w-full rounded-2xl border border-dashed border-slate-200 dark:border-white/10 py-3 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:border-[#8ba32b]/45 dark:hover:border-[#c8e558]/35 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
    >
      Show {Math.min(PAGE, total - shown)} more
      <span className="text-slate-400 dark:text-slate-500 font-normal tabular-nums"> · {shown} of {total}</span>
    </button>
  );
}

function QuestionCard({ q, isOpen, onToggle }: { q: PyqQuestion; isOpen: boolean; onToggle: () => void }) {
  const opts = optionList(q.options);
  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] p-4">
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

          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
            {q.correctAnswer && (
              <button
                onClick={onToggle}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6ca855] dark:text-[#c8e558] hover:underline cursor-pointer"
              >
                {isOpen ? 'Hide answer' : 'Show answer'}
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-180')} />
              </button>
            )}
            <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
              {[
                q.subject,
                q.session,
                q.shift ? (/shift/i.test(q.shift) ? q.shift : `Shift ${q.shift}`) : null,
                q.marks ? `${q.marks} mark${q.marks === 1 ? '' : 's'}` : null,
              ]
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
}

export function PyqPaperView({ paper, onBack }: Props) {
  const { questions, isLoading, isError } = usePyqQuestions({
    examId: paper.examId,
    year: paper.year,
    limit: LIMIT,
    compact: true,
  });

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [shownSitting, setShownSitting] = useState(PAGE);
  const [shownYear, setShownYear] = useState(PAGE);

  // Opening a different paper is a different document; carry none of the last one's state over.
  useEffect(() => {
    setRevealed(new Set());
    setShownSitting(PAGE);
    setShownYear(PAGE);
  }, [paper.sourceId]);

  const toggle = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const { thisSitting, sameYear } = useMemo(() => {
    const ordered = [...questions].sort((a, b) => (a.questionNumber ?? 0) - (b.questionNumber ?? 0));

    // A registry entry naming neither a session nor a shift makes no claim finer than the year,
    // so the year's questions are as precisely attributed as that paper gets.
    if (!paper.session && !paper.shift) return { thisSitting: ordered, sameYear: [] as PyqQuestion[] };

    return {
      thisSitting: ordered.filter((q) => corroborates(q, paper)),
      sameYear: ordered.filter((q) => !corroborates(q, paper)),
    };
  }, [questions, paper]);

  const subjects = useMemo(
    () => Array.from(new Set(thisSitting.map((q) => q.subject).filter(Boolean))) as string[],
    [thisSitting],
  );

  const examLabel = paper.examName || paper.examId;
  const truncated = questions.length >= LIMIT;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mb-5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        {examLabel}
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
      ) : isError || questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 px-5 py-12 text-center">
          <Inbox className="w-5 h-5 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-[13px] text-slate-600 dark:text-slate-300 font-medium">
            {isError
              ? 'Could not load questions for this paper'
              : `No ${examLabel} ${paper.year} questions in the bank yet`}
          </p>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1">
            {isError
              ? 'The paper is listed, but its questions could not be fetched.'
              : 'The paper is in the registry; its questions have not been extracted and indexed.'}
            {paper.sourceUrl && ' The official source is linked above.'}
          </p>
        </div>
      ) : (
        <div className="pb-10">
          {thisSitting.length > 0 && (
            <section className="mb-9">
              <div className="flex items-baseline gap-2.5 mb-4 flex-wrap">
                <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  {thisSitting.length} question{thisSitting.length === 1 ? '' : 's'}
                </span>
                {subjects.length > 0 && (
                  <span className="text-[12px] text-slate-400 dark:text-slate-500">{subjects.join(' · ')}</span>
                )}
              </div>

              <div className="space-y-2.5">
                {thisSitting.slice(0, shownSitting).map((q) => (
                  <QuestionCard
                    key={q.questionId}
                    q={q}
                    isOpen={revealed.has(q.questionId)}
                    onToggle={() => toggle(q.questionId)}
                  />
                ))}
              </div>

              <ShowMore
                shown={shownSitting}
                total={thisSitting.length}
                onMore={() => setShownSitting((n) => n + PAGE)}
              />
            </section>
          )}

          {sameYear.length > 0 && (
            <section>
              <div className="mb-4">
                <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  Elsewhere in {examLabel} {paper.year}
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 max-w-prose">
                  {thisSitting.length === 0
                    ? 'None of these name this session or shift, so they are not presented as this paper’s contents. They are from the same exam and year.'
                    : 'From the same exam and year, but recorded under a different session or shift.'}
                </p>
              </div>

              <div className="space-y-2.5">
                {sameYear.slice(0, shownYear).map((q) => (
                  <QuestionCard
                    key={q.questionId}
                    q={q}
                    isOpen={revealed.has(q.questionId)}
                    onToggle={() => toggle(q.questionId)}
                  />
                ))}
              </div>

              <ShowMore
                shown={shownYear}
                total={sameYear.length}
                onMore={() => setShownYear((n) => n + PAGE)}
              />
            </section>
          )}

          {truncated && (
            <p className="mt-6 text-[12px] text-slate-400 dark:text-slate-500 text-center">
              Showing the first {LIMIT} questions for {examLabel} {paper.year}.
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
