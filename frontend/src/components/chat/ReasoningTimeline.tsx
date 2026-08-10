import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../lib/utils';

export interface RStep { stage?: string; message: string; detail?: boolean; }

export interface StepDef { key: string; title: string; stages: string[]; hints: string[]; }

export interface StepDefX extends StepDef { detail: string; }

/**
 * Default reasoning-pipeline step definitions used by the Magic Chat page.
 * Callers can supply their own definitions via the `stepDefs` prop when the
 * upstream pipeline emits different backend stages (e.g. Podcast Studio).
 */
export const DEFAULT_STEP_DEFS: StepDefX[] = [
  { key: 'understand', title: 'Understanding the question', stages: ['INTENT_DETECTION', 'CONTEXT_ENRICHMENT'],
    hints: ['Reading the question', 'Detecting intent'],
    detail: 'Parsing your message to detect intent (question, greeting or task), extracting the core concept and entities, and working out what you\u2019re really asking.' },
  { key: 'memory', title: 'Loading memory & profile', stages: ['MEMORY_RETRIEVAL'],
    hints: ['Recalling past sessions'],
    detail: 'Loading your learning profile \u2014 target exam, past sessions, mastery levels and weak topics \u2014 so the answer is personalised to where you currently are.' },
  { key: 'graph', title: 'Mapping concept relationships', stages: ['GRAPH_RETRIEVAL'],
    hints: ['Traversing the knowledge graph'],
    detail: 'Traversing the SCERT knowledge graph: locating the concept node, then walking prerequisite, related-to and part-of edges to build a map of what this topic depends on.' },
  { key: 'search', title: 'Retrieving knowledge', stages: ['RAG_RETRIEVAL'],
    hints: ['Searching the vector store'],
    detail: 'Embedding your query and running semantic vector search over the indexed curriculum (Pinecone), then reranking the top passages by relevance to ground the answer.' },
  { key: 'reason', title: 'Reasoning & planning', stages: [],
    hints: ['Thinking it through'],
    detail: 'Reasoning through the retrieved context step by step \u2014 ordering prerequisites and planning the clearest way to explain it.' },
  { key: 'generate', title: 'Composing the answer', stages: ['AGENT_EXECUTION', 'VERIFICATION', 'ASSET_GENERATION', 'ANALYTICS', 'MEMORY_UPDATE'],
    hints: ['Drafting the explanation'],
    detail: 'Composing a grounded answer from the retrieved passages, cross-checking each claim against your sources, then formatting the final explanation.' },
];

/**
 * Build a stage-name → step-index map from a step-def array. Callers use
 * this indirectly via the `stepDefs` prop.
 */
function buildStageMap(defs: StepDefX[]): Record<string, number> {
  const m: Record<string, number> = {};
  defs.forEach((s, i) => s.stages.forEach((st) => { m[st] = i; }));
  return m;
}

export default function ReasoningTimeline({
  steps,
  reasoningText,
  streaming = false,
  hasAnswer = false,
  durationMs,
  stepDefs,
  reasoningStepIndex,
  paceMs = 0,
  showProgress = false,
}: {
  steps: RStep[];
  reasoningText?: string;
  streaming?: boolean;
  hasAnswer?: boolean;
  durationMs?: number;
  /**
   * Minimum dwell time per step, in ms. The backend emits all six stage labels within
   * ~200ms (they're markers between awaits, not the work itself), so an unpaced timeline
   * blows through every step instantly and then sits silent for the seconds the LLM
   * actually takes. With paceMs set, the visible step advances at most once per interval,
   * spreading the display across the real wait. It never runs AHEAD of the backend —
   * pacing can only delay a step, never invent one. 0 (default) keeps the old behaviour.
   */
  paceMs?: number;
  /** Render a thin determinate progress bar in the header while streaming. */
  showProgress?: boolean;
  /** Override the default pipeline steps (backward compatible). */
  stepDefs?: StepDefX[];
  /** Which step index holds the free-form reasoning prose. Defaults to
   * `stepDefs.findIndex(s => s.key === 'reason')`, else 4 for backward
   * compatibility with the built-in defs. */
  reasoningStepIndex?: number;
}) {
  const STEP_DEFS_ACTIVE = stepDefs && stepDefs.length > 0 ? stepDefs : DEFAULT_STEP_DEFS;
  const REASON_INDEX = (() => {
    if (typeof reasoningStepIndex === 'number') return reasoningStepIndex;
    const byKey = STEP_DEFS_ACTIVE.findIndex((s) => s.key === 'reason');
    return byKey >= 0 ? byKey : 4;
  })();
  const STAGE_TO_STEP = useMemo(() => buildStageMap(STEP_DEFS_ACTIVE), [STEP_DEFS_ACTIVE]);
  const total = STEP_DEFS_ACTIVE.length;

  const reached = useMemo(() => {
    let r = 0;
    for (const s of steps || []) {
      const idx = STAGE_TO_STEP[s.stage ?? ''];
      if (typeof idx === 'number' && idx > r) r = idx;
    }
    if (reasoningText && reasoningText.trim().length > 0) r = Math.max(r, REASON_INDEX);
    return r;
  }, [steps, reasoningText, STAGE_TO_STEP, REASON_INDEX]);

  // How many steps did the backend ACTUALLY report progress for (by real stage events), as
  // opposed to the full pipeline? Fast paths (e.g. a greeting) only emit a handful of stages —
  // the timeline must reflect that, not unconditionally mark all STEP_DEFS as done. `reached`
  // already tracks the highest step index seen; `reachedCount` is how many of the fixed steps
  // actually had at least one matching backend stage event (so a skipped middle step, e.g. no
  // GRAPH_RETRIEVAL, correctly renders as not-reached instead of "done").
  const seenStepIndices = useMemo(() => {
    const seen = new Set<number>();
    for (const s of steps || []) {
      const idx = STAGE_TO_STEP[s.stage ?? ''];
      if (typeof idx === 'number') seen.add(idx);
    }
    if (reasoningText && reasoningText.trim().length > 0) seen.add(REASON_INDEX);
    return seen;
  }, [steps, reasoningText]);

  // Paced reveal — see the `paceMs` prop docs. `paced` walks toward `reached`, never past it.
  const [paced, setPaced] = useState(0);
  useEffect(() => {
    if (!paceMs || !streaming) { setPaced(reached); return; }
    if (paced >= reached) return;
    const id = setTimeout(() => setPaced((p) => Math.min(reached, p + 1)), paceMs);
    return () => clearTimeout(id);
  }, [paced, reached, paceMs, streaming]);

  /**
   * Pacing must never hide progress that has genuinely happened.
   *
   * Once reasoning prose starts arriving the model is demonstrably at the
   * "Reasoning & planning" step, so the display floors there regardless of how far the
   * paced walk has crawled. Without this floor the timeline sat on step 1 while the
   * backend was already at step 6 — and because the reasoning renders under the ACTIVE
   * step, it was being drawn under "Understanding the question" and then collapsed away
   * the moment the answer arrived. Pacing smooths a burst; it must not lag reality.
   */
  const hasReasonText = !!(reasoningText && reasoningText.trim());
  const effectiveReached = paceMs && streaming
    ? Math.max(Math.min(paced, reached), hasReasonText ? REASON_INDEX : 0)
    : reached;

  const allDone = hasAnswer || !streaming;
  const activeIndex = allDone ? -1 : effectiveReached;
  // Once finished, the visible step count is however many DISTINCT steps the backend actually
  // reported (not always the full STEP_DEFS.length) — e.g. a greeting fast path only reports
  // "Understanding the question" + "Composing the answer" (AGENT_EXECUTION), so the header
  // correctly reads "2 steps", and the graph/retrieval rows below render as skipped, not done.
  const reachedTotal = allDone ? Math.max(seenStepIndices.size, 1) : total;
  const currentNumber = allDone ? reachedTotal : Math.min(total, activeIndex + 1);

  const [open, setOpen] = useState<boolean>(!!streaming && !hasAnswer);
  useEffect(() => {
    if (hasAnswer) {
      const t = setTimeout(() => setOpen(false), 600);
      return () => clearTimeout(t);
    }
  }, [hasAnswer]);

  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState<number>(durationMs ?? 0);
  useEffect(() => {
    if (durationMs != null) { setElapsed(durationMs); return; }
    if (allDone) { setElapsed(Date.now() - startRef.current); return; }
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
    return () => clearInterval(id);
  }, [allDone, durationMs]);

  // Typewriter reveal of the reasoning prose (stays smoothly just behind incoming text).
  const textRef = useRef(reasoningText || '');
  textRef.current = reasoningText || '';
  const [shown, setShown] = useState(streaming ? 0 : Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    if (!streaming) { setShown(Number.MAX_SAFE_INTEGER); return; }
    const id = setInterval(() => {
      setShown((p) => {
        const f = textRef.current.length;
        // ~125–350 chars/sec. The old rule was exponential catch-up ((f-p)/12 every 30ms),
        // which drained a multi-thousand-character draft in about a second — far too fast
        // to read, so the reasoning appeared to flash rather than write. This is a steady
        // reading cadence with a modest ceiling for long drafts.
        return p >= f ? p : Math.min(f, p + Math.max(5, Math.min(14, Math.ceil((f - p) / 80))));
      });
    }, 40);
    return () => clearInterval(id);
  }, [streaming]);

  const seconds = (elapsed / 1000).toFixed(elapsed < 10000 ? 1 : 0);

  // Completion flourish — a short check-in animation on the streaming→done edge, so
  // finishing reads as an event rather than the header quietly swapping text. Fires
  // once per reply and clears itself; never shown for already-finished history.
  const [justFinished, setJustFinished] = useState(false);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (activeIndex >= 0) { wasRunning.current = true; return; }
    if (wasRunning.current) {
      wasRunning.current = false;
      setJustFinished(true);
      const t = setTimeout(() => setJustFinished(false), 1600);
      return () => clearTimeout(t);
    }
  }, [activeIndex]);

  return (
    <div className="mb-3 w-full">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 text-[12.5px] text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors select-none"
      >
        {activeIndex >= 0 ? (
          /* Round rotating spinner while reasoning is in progress. */
          <span className="w-4 h-4 rounded-full border-2 border-indigo-500/25 border-t-indigo-500 animate-spin shrink-0" aria-hidden />
        ) : justFinished ? (
          /* Completion flourish: the dot blooms into a check with a ring pulse. */
          <span className="relative w-4 h-4 shrink-0 flex items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-emerald-500/30"
              initial={{ scale: 0.5, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />
            <motion.span
              className="relative w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.25, 1] }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              ✓
            </motion.span>
          </span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600 shrink-0" />
        )}
        {activeIndex >= 0 ? (
          <>
            {/* Current state (active step name) shown alongside the spinner, with a shimmer. */}
            <span className="reasoning-shimmer font-medium truncate">{STEP_DEFS_ACTIVE[activeIndex]?.title || 'Reasoning'}{'\u2026'}</span>
            <span className="text-slate-400 dark:text-gray-500 shrink-0 hidden sm:inline">{'\u00b7'} Step {currentNumber} of {total}</span>
          </>
        ) : (
          <>
            <span className="text-slate-600 dark:text-gray-300">Thought</span>
            <span className="text-slate-400">{'\u00b7'} {reachedTotal} step{reachedTotal === 1 ? '' : 's'} {'\u00b7'} {seconds}s</span>
          </>
        )}
        {/* Determinate progress across the pipeline while it runs. */}
        {showProgress && activeIndex >= 0 && (
          <span className="ml-2 hidden sm:block w-20 h-[3px] rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden shrink-0" aria-hidden>
            <motion.span
              className="block h-full rounded-full bg-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(((activeIndex + 1) / total) * 100)}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
          </span>
        )}
        <span className={cn("text-slate-400 text-[11px] shrink-0", !(showProgress && activeIndex >= 0) && "ml-auto")}>{open ? '\u25be' : '\u25b8'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 pl-3 border-l border-slate-200 dark:border-white/10 flex flex-col gap-2">
              {STEP_DEFS_ACTIVE.map((step, i) => {
                // A step is "done" only if the backend actually reported reaching it (or it's
                // the reasoning step and we have reasoning prose) — a fast path (e.g. greeting)
                // that skips GRAPH_RETRIEVAL/RAG_RETRIEVAL must show those as skipped, not done,
                // even after the overall response has finished.
                const wasReached = seenStepIndices.has(i);
                const state = allDone
                  ? (wasReached ? 'done' : 'skipped')
                  : i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
                const hasReason = !!(reasoningText && reasoningText.trim());
                // While streaming, show the live reasoning prose under the currently-active
                // step (so the real reasoning is displayed where the timeline is showing).
                // Once finished, keep it under the "Reasoning & planning" step for review.
                const showReason = hasReason && (streaming ? state === 'active' : i === REASON_INDEX);
                // Real telemetry emitted by the backend for this step (matched concepts,
                // node/edge counts, retrieved passages, sources, profile). These are the
                // actual "how it's doing it internally" lines.
                const resultMsgs = (steps || [])
                  .filter((s) => s.detail && step.stages.includes(s.stage ?? ''))
                  .map((s) => s.message);
                return (
                  <div key={step.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                        state === 'active' ? 'bg-indigo-500 animate-pulse'
                          : state === 'done' ? 'bg-emerald-500/60'
                          : state === 'skipped' ? 'bg-slate-300/40 dark:bg-gray-700/50'
                          : 'bg-slate-300/70 dark:bg-gray-600/70'
                      )} />
                      <span className={cn(
                        'text-[12.5px] transition-colors',
                        state === 'active' ? 'text-slate-700 dark:text-gray-200 font-medium'
                          : state === 'done' ? 'text-slate-400 dark:text-gray-500'
                          : state === 'skipped' ? 'text-slate-300/60 dark:text-gray-600/60 line-through'
                          : 'text-slate-300 dark:text-gray-600'
                      )}>
                        {step.title}
                      </span>
                      {state === 'skipped' && (
                        <span className="text-[10.5px] text-slate-300/70 dark:text-gray-600/70 shrink-0">not needed for this reply</span>
                      )}
                    </div>

                    {/* Under each reached step: a short description of what the step does,
                        then the REAL telemetry lines the backend reported for it. The reason
                        step shows the live reasoning prose instead (below). */}
                    {i !== REASON_INDEX && state !== 'pending' && state !== 'skipped' && !showReason && (
                      <div className="ml-3.5 flex flex-col gap-1">
                        <motion.div
                          initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className={cn(
                            'text-[12px] leading-relaxed',
                            state === 'active' ? 'text-slate-500 dark:text-gray-400' : 'text-slate-400/80 dark:text-gray-500/80'
                          )}
                        >
                          <TypedText text={step.detail} active={state === 'active' && !!streaming} />
                          {state === 'active' && resultMsgs.length === 0 && (
                            <span className="inline-flex ml-1.5 align-middle"><LiveDots /></span>
                          )}
                        </motion.div>
                        {resultMsgs.map((msg, k) => (
                          <motion.div
                            key={k}
                            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-start gap-1.5 text-[12px] leading-relaxed text-slate-600 dark:text-gray-300"
                          >
                            <span className="text-emerald-500 dark:text-emerald-400 mt-[1px] shrink-0">{'\u2713'}</span>
                            <span>{msg}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {showReason && (
                      <div className="ml-3.5 text-[13px] leading-[1.6] text-slate-500 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {state === 'active' ? (reasoningText || '').slice(0, shown) : (reasoningText || '')}
                        </ReactMarkdown>
                        {state === 'active' && streaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-indigo-400/70 animate-pulse align-middle" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Small bouncing dots to keep the active step visibly alive (CSS only, no icons). */
/**
 * Types a fixed string out character by character. Used for the ACTIVE step's
 * description so the wait reads as the system narrating what it is doing, rather
 * than a block of text appearing at once. Inactive steps render instantly — only
 * the step currently running gets the writing treatment.
 */
const TypedText: React.FC<{ text: string; active: boolean }> = ({ text, active }) => {
  const [n, setN] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((p) => Math.min(text.length, p + 1)), 14);
    return () => clearInterval(id);
  }, [text, active]);
  return <span>{active ? text.slice(0, n) : text}</span>;
};

function LiveDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" />
    </span>
  );
}
