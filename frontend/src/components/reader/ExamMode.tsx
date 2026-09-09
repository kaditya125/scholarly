import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Exam Mode — the chapter's practice questions, grouped by the NCERT page they came from.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  WHAT THIS REPLACED. The "Exam Mode" tab existed and did nothing. ChapterReader rendered it
 *  through the same branch as Split View (`mode === 'split' || mode === 'exam'`) while the PDF
 *  panel's condition excluded 'exam' entirely — so the tab showed Split View minus the PDF, with
 *  no exam content anywhere behind it.
 *
 *  ON PROVENANCE. These are model-written practice questions generated from the chapter text at
 *  ingestion. They are NOT previous-year questions and this component must never present them as
 *  such — no "PYQ", no year, no board attribution. `likelihood` is the model's estimate of what
 *  tends to be examined from this material, shown as "often asked", not as a claim about any real
 *  paper. See the EXAM_QUESTIONS spec in backend-firestore/src/services/assetSpecs.ts.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export interface ExamQuestion {
  id: string;
  ncertPageRef: number;
  type: 'mcq' | 'short' | 'long' | 'assertion-reason';
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
  marks?: number;
  likelihood?: 'high' | 'medium';
  whyAsked?: string;
}

const TYPE_LABEL: Record<ExamQuestion['type'], string> = {
  mcq: 'MCQ',
  short: 'Short answer',
  long: 'Long answer',
  'assertion-reason': 'Assertion & reason',
};

export default function ExamMode({
  questions,
  onJumpToPage,
}: {
  questions: ExamQuestion[];
  /** Sends the PDF panel to the page a question came from. */
  onJumpToPage?: (page: number) => void;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [onlyHigh, setOnlyHigh] = useState(false);

  const filtered = useMemo(
    () => (onlyHigh ? questions.filter((q) => q.likelihood !== 'medium') : questions),
    [questions, onlyHigh],
  );

  /** Grouped by NCERT page, pages in reading order — the chapter's own sequence. */
  const byPage = useMemo(() => {
    const map = new Map<number, ExamQuestion[]>();
    for (const q of filtered) {
      const page = Number(q.ncertPageRef) || 1;
      if (!map.has(page)) map.set(page, []);
      map.get(page)!.push(q);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const highCount = useMemo(() => questions.filter((q) => q.likelihood !== 'medium').length, [questions]);

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-[42rem] px-6 py-16">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
          No practice questions yet
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.7] text-slate-500 dark:text-gray-400">
          They are written once, when the chapter is prepared. If the chapter has just been added,
          they will appear here when generation finishes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[46rem] px-6 py-10 sm:py-12">
      <header className="pb-5 border-b border-slate-200 dark:border-white/[0.07]">
        <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
          Practice by page
        </h2>
        <p className="mt-2 max-w-[34rem] text-[14.5px] leading-[1.7] text-slate-500 dark:text-gray-400">
          {questions.length} questions written from this chapter, grouped by the NCERT page they
          are answerable from. Practice questions — not previous-year papers.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <button
            onClick={() => setOnlyHigh((v) => !v)}
            aria-pressed={onlyHigh}
            className={`font-semibold transition-colors ${
              onlyHigh
                ? 'text-slate-900 dark:text-white underline underline-offset-4 decoration-[#8ea63a] dark:decoration-[#c8e558]'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
            }`}
          >
            Often asked only ({highCount})
          </button>
          <span className="tabular-nums text-slate-400 dark:text-gray-500">
            {byPage.length} {byPage.length === 1 ? 'page' : 'pages'} covered
          </span>
          {Object.keys(revealed).length > 0 && (
            <button
              onClick={() => { setRevealed({}); setPicked({}); }}
              className="text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors"
            >
              Hide all answers
            </button>
          )}
        </div>
      </header>

      <div className="mt-10 space-y-12">
        {byPage.map(([page, items]) => (
          <section key={page}>
            <div className="flex items-baseline justify-between gap-4 pb-2.5 border-b border-slate-100 dark:border-white/[0.07]">
              <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-white">
                NCERT page <span className="tabular-nums">{page}</span>
              </h3>
              <div className="flex items-center gap-4 text-[12.5px]">
                <span className="tabular-nums text-slate-400 dark:text-gray-500">
                  {items.length} {items.length === 1 ? 'question' : 'questions'}
                </span>
                {onJumpToPage && (
                  <button
                    onClick={() => onJumpToPage(page)}
                    className="font-semibold text-slate-900 dark:text-white underline underline-offset-4 decoration-slate-300 dark:decoration-white/25 hover:decoration-[#8ea63a] dark:hover:decoration-[#c8e558] transition-colors"
                  >
                    Open page
                  </button>
                )}
              </div>
            </div>

            <ol className="mt-1">
              {items.map((q) => {
                const isOpen = !!revealed[q.id];
                const choice = picked[q.id];
                return (
                  <li key={q.id} className="py-5 border-b border-slate-100 dark:border-white/[0.07]">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                      <span className="font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-gray-500">
                        {TYPE_LABEL[q.type] ?? 'Question'}
                      </span>
                      {q.likelihood !== 'medium' && (
                        <span className="font-semibold text-[#6ca855] dark:text-[#c8e558]">Often asked</span>
                      )}
                      {!!q.marks && (
                        <span className="tabular-nums text-slate-400 dark:text-gray-500">
                          {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-[15px] leading-[1.65] text-slate-800 dark:text-gray-100">
                      {q.question}
                    </p>

                    {q.type === 'mcq' && !!q.options?.length && (
                      <ul className="mt-3 space-y-1.5">
                        {q.options.map((opt, i) => {
                          // Answers are compared on trimmed text because the model writes the
                          // answer as one of the option strings, not as an index.
                          const isAnswer = opt.trim() === (q.answer || '').trim();
                          const isPicked = choice === opt;
                          return (
                            <li key={i}>
                              <button
                                onClick={() => {
                                  setPicked((p) => ({ ...p, [q.id]: opt }));
                                  setRevealed((r) => ({ ...r, [q.id]: true }));
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-[14px] leading-snug border transition-colors ${
                                  isOpen && isAnswer
                                    ? 'border-[#c8e558] bg-[#c8e558]/15 text-slate-900 dark:text-white'
                                    : isOpen && isPicked
                                      ? 'border-red-300 dark:border-red-500/40 text-slate-600 dark:text-gray-300'
                                      : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/25'
                                }`}
                              >
                                <span className="mr-2 font-semibold text-slate-400 dark:text-gray-500">
                                  {String.fromCharCode(65 + i)}
                                </span>
                                {opt}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <button
                      onClick={() => setRevealed((r) => ({ ...r, [q.id]: !isOpen }))}
                      aria-expanded={isOpen}
                      className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      {isOpen ? 'Hide answer' : 'Show answer'}
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isOpen && (
                      <div className="mt-3 pl-4 border-l-2 border-[#c8e558]">
                        {q.type !== 'mcq' && (
                          <p className="text-[14.5px] leading-[1.7] text-slate-800 dark:text-gray-100">{q.answer}</p>
                        )}
                        {q.type === 'mcq' && (
                          <p className="text-[14.5px] leading-[1.7] text-slate-800 dark:text-gray-100">
                            <span className="font-semibold">Answer:</span> {q.answer}
                          </p>
                        )}
                        {q.explanation && (
                          <p className="mt-2 text-[14px] leading-[1.7] text-slate-600 dark:text-gray-300">
                            {q.explanation}
                          </p>
                        )}
                        {q.whyAsked && (
                          <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                            Why it comes up: {q.whyAsked}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
