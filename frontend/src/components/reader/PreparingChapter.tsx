import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Sparkles, BookOpen, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';

interface PreparingChapterProps {
  status: string;
  /** Epoch ms when the reader first observed the current stuck-in-progress source
   *  status. When set AND (Date.now() - stuckSinceMs) > ~60s, the UI escalates
   *  from a passive spinner to a prominent yellow warning + an actionable "this
   *  is taking longer than expected" hint + a primary-amber Force Retry button. */
  stuckSinceMs?: number | null;
  /** Free-text reason for the most recent FAILED transition, sourced from the source
   *  document in Firestore (Phase 3). Catalogued values:
   *    - 'STUCK_TIMEOUT'        — admin watchdog flipped us (retry ought to work)
   *    - 'PIPELINE_ERROR'       — generic catch-block failure (retry may work)
   *    - 'MISSING_SOURCE_FILE'  — original GCS object gone (non-retryable)
   *    - 'PERMISSION_DENIED'    — Firestore rules / IAM rejected (non-retryable)
   *    - 'SOURCE_NOT_FOUND'     — source doc deleted (non-retryable)
   *    - 'SNAPSHOT_FAILED'      — WebChannel / auth error from this client (non-retryable)
   *  Unknown reasons fall back to the legacy generic "We hit an issue" copy. */
  failureReason?: string | null;
  /** First ~300 chars of the underlying error message — rendered as small grey
   *  supplementary text so the user has the actual failing call (e.g. "getaddrinfo
   *  ENOTFOUND storage.googleapis.com") without us hiding it completely. */
  errorDetails?: string | null;
  onRetry?: () => void;
  /** Switches the reader to NCERT-PDF-only mode (already wired in ChapterReader via
   *  setMode('ncert')). Provides a hard escape hatch when the article pipeline is
   *  genuinely stuck — the original PDF is fetched from a different path that doesn't
   *  depend on the article-generation job. */
  onOpenPdf?: () => void;
}

// STEPS rows are ordered so each index matches the natural ingestion pipeline
// (upload → extract → chunk → embed → index → KG → rich assets).  Combined
// with STATUS_TO_STEP_IDX below, every ProcessingStatus value maps to exactly
// one row instead of silently falling through to "Generating documentary article".
const STEPS = [
  { id: 'UPLOADING', label: 'Uploading chapter' },
  { id: 'EXTRACTING_PDF', label: 'Extracting chapter structure' },
  { id: 'CHUNKING', label: 'Chunking text' },
  { id: 'EMBEDDING', label: 'Generating embeddings' },
  { id: 'INDEXING', label: 'Indexing in vector store' },
  { id: 'BUILDING_KNOWLEDGE_GRAPH', label: 'Building knowledge graph' },
  { id: 'GENERATING_ARTICLE', label: 'Generating documentary article' },
  { id: 'GENERATING_STUDY_MODE', label: 'Creating Study Mode' },
  { id: 'GENERATING_REVISION_MODE', label: 'Creating Revision Mode' },
  { id: 'GENERATING_EXAM_MODE', label: 'Creating Exam Mode' },
  { id: 'GENERATING_FLASHCARDS', label: 'Generating Flashcards' },
  { id: 'GENERATING_PODCAST', label: 'Generating Podcast' },
  { id: 'INDEXING_CONTENT', label: 'Indexing AI knowledge' },
];

// Single source of truth for which STEPS index should be the "active" one
// for a given source.status.  Mirrors backend-firestore/src/types/notebook.ts
// ProcessingStatus — when a new status is added on the backend, this table is
// the one place the reader UI needs to teach itself to render it correctly.
const STATUS_TO_STEP_IDX: Record<string, number> = {
  // Pre-extraction phases — fold onto "Uploading chapter" (idx 0)
  NOT_STARTED: 0,
  QUEUED: 0,
  PENDING: 0,
  UPLOADING: 0,
  // Extraction phases — fold onto "Extracting chapter structure" (idx 1)
  PROCESSING: 1,
  OCR: 1,
  EXTRACTING: 1,
  EXTRACTING_PDF: 1,
  // Mid-pipeline phases — first-class steps
  CHUNKING: 2,
  EMBEDDING: 3,
  INDEXING: 4,
  // Knowledge graph (incl. legacy alias)
  BUILDING_KNOWLEDGE_GRAPH: 5,
  GENERATING_GRAPH: 5,
  // Rich-asset generation phases
  GENERATING_ARTICLE: 6,
  GENERATING_STUDY_MODE: 7,
  GENERATING_REVISION_MODE: 8,
  GENERATING_EXAM_MODE: 9,
  GENERATING_FLASHCARDS: 10,
  GENERATING_PODCAST: 11,
  INDEXING_CONTENT: 12,
};

// ── Reason-catalog (Phase 3) ───────────────────────────────────────────────
// Each entry produces a title + description for the "Generation hit an issue"
// state. Unknown / null reasons fall through to PIPELINE_ERROR copy. The
// list is also used to decide whether the Force Retry CTA should be hidden
// (genuinely non-retryable sources get a green Open-NCERT-PDF CTA instead).
const FAILED_COPY: Record<string, { title: string; description: string }> = {
  STUCK_TIMEOUT: {
    title: 'Generation hit an issue',
    description: "We hit an issue generating this chapter's documentary article. Use Force Retry below, or check the chapter status in your notebook.",
  },
  PIPELINE_ERROR: {
    title: 'Generation hit an issue',
    description: "We hit an issue generating this chapter's documentary article. Use Force Retry below, or check the chapter status in your notebook.",
  },
  MISSING_SOURCE_FILE: {
    title: "This chapter's source file is unavailable",
    description: "The original document is no longer in storage, so the documentary article can't be generated. You can still read the NCERT PDF below, or re-upload this chapter from your notebook.",
  },
  PERMISSION_DENIED: {
    title: "We can't process this chapter",
    description: "Background access to this chapter's content was denied. The embedded NCERT PDF still works below.",
  },
  SOURCE_NOT_FOUND: {
    title: 'This chapter has been removed',
    description: 'The source document was deleted from your notebook. The embedded NCERT PDF still works below.',
  },
  SNAPSHOT_FAILED: {
    title: "Connection interrupted",
    description: "Couldn't reach your chapter's status. The embedded NCERT PDF still works below.",
  },
};
const NON_RETRYABLE_REASONS = ['MISSING_SOURCE_FILE', 'PERMISSION_DENIED', 'SOURCE_NOT_FOUND', 'SNAPSHOT_FAILED'];

export function PreparingChapter({ status, stuckSinceMs, failureReason, errorDetails, onRetry, onOpenPdf }: PreparingChapterProps) {
  // ── HOOKS FIRST — must be called in the same order on every render, regardless of
  // whether `status` is still '' (unknown) or has populated to a real ProcessingStatus.
  // React Rules of Hooks: putting `if (!status) return ...` BEFORE these would mean
  // render #1 calls 2 hooks and render #2 (status populated) also calls 2 hooks — fine.
  // But had we early-returned BEFORE the hooks, render #1 would call 0 and render #2
  // would call 2 → React throws "rendered more hooks than during the previous render".
  const FAILED_DEFAULT_IDX = STEPS.findIndex((s) => s.id === 'GENERATING_ARTICLE');
  const lastActiveIdxRef = useRef<number | null>(null);

  // Phase 3: derive `isFailed` (FAILED or FAILED_NONRETRYABLE both belong on the
  // failed UI flow) and `isNonRetryable` (the Force Retry CTA is hidden for these
  // reasons — retrying will hit the exact same failure). Defined before any
  // early-return so the constants stay referenced regardless of render order.
  const isFailed = status === 'FAILED' || status === 'FAILED_NONRETRYABLE';
  const isNonRetryable =
    status === 'FAILED_NONRETRYABLE' ||
    (status === 'FAILED' && !!failureReason && NON_RETRYABLE_REASONS.includes(failureReason));
  const failedCopy = isFailed
    ? (FAILED_COPY[failureReason || ''] || FAILED_COPY.PIPELINE_ERROR)
    : null;

  // Track the most recent non-terminal status's resolved STEPS index so when
  // the source lands in FAILED we can highlight *the* failing row (instead of
  // marking every row rose, the historical behavior).  Captures the last idx
  // on every non-terminal status update; stays at the last observed value if
  // status later flips to FAILED / READY / READY_DEGRADED / COMPLETED.
  //
  // FAILED_DEFAULT_IDX is the fallback when no prior non-terminal status was
  // observed (e.g. fresh page-load after the backend already wrote FAILED).
  // GENERATING_ARTICLE is empirically the most common failure point in this
  // pipeline, so it's used as the default — derived from STEPS so a future
  // reorder keeps this in sync automatically.
  useEffect(() => {
    const isTerminal =
      status === 'FAILED' ||
      status === 'FAILED_NONRETRYABLE' ||
      status === 'READY' ||
      status === 'READY_DEGRADED' ||
      status === 'COMPLETED';
    if (!isTerminal) {
      const fromTable = STATUS_TO_STEP_IDX[status];
      const fromSteps = STEPS.findIndex((s) => s.id === status);
      lastActiveIdxRef.current =
        fromTable !== undefined ? fromTable : (fromSteps >= 0 ? fromSteps : 0);
    }
  }, [status]);

  // Live ticker that re-renders PreparingChapter every 5s while we're in a stuck state
  // so the "taking longer than expected" hint shows a live elapsed-time copy. Cheap
  // because PreparingChapter is the only thing mounted while docChapter is null
  // (ArticleContent isn't rendered). The interval is cleared the instant stuckSinceMs
  // flips to null (terminal status reached), so post-READY renders never re-mount it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!stuckSinceMs) return;
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [stuckSinceMs]);

  // Threshold matches the rate limit in ChapterReader's lastRetryAtRef (60s) so the
  // UI escalates just before the second auto-retry POST would have fired — feels
  // responsive to the user rather than trailing behind the silent recovery attempt.
  const STUCK_THRESHOLD_MS = 60_000;
  const elapsedMs = stuckSinceMs ? Math.max(0, now - stuckSinceMs) : 0;
  const isStuck = !!stuckSinceMs && elapsedMs > STUCK_THRESHOLD_MS;
  const stuckMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));

  // ── UNKNOWN-STATUS EARLY RETURN ──
  // Firestore snapshot hasn't told us anything yet. Render a neutral "Connecting…"
  // panel AFTER all hooks have run so the hook order stays consistent when
  // status flips from '' → some-real-value on a later render.
  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-6">
        <div className="max-w-md w-full bg-white dark:bg-[#1C1C1F] rounded-2xl shadow-sm border border-[#E2E1DC] dark:border-white/10 p-8">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-center text-[#1A1A1A] dark:text-white mb-2">
            Connecting to your chapter…
          </h2>
          <p className="text-center text-sm text-[#555] dark:text-gray-400">
            Locating this chapter on the server and checking its preparation status.
          </p>
        </div>
      </div>
    );
  }

  // Determine which steps are done, active, or pending
  const getStepState = (stepId: string, idx: number) => {
    // On FAILED / FAILED_NONRETRYABLE, mark ONLY the step that was active when
    // the source landed here as 'failed' — prior steps render 'done', subsequent
    // steps render 'pending'. This replaces the historical behavior of marking
    // every row rose, which couldn't tell the user *which* step actually broke.
    // The failing idx comes from lastActiveIdxRef (last observed non-terminal
    // status); if none was ever observed, fall back to FAILED_DEFAULT_IDX.
    if (isFailed) {
      const failedIdx = lastActiveIdxRef.current ?? FAILED_DEFAULT_IDX;
      if (idx === failedIdx) return 'failed';
      if (idx < failedIdx) return 'done';
      return 'pending';
    }
    // READY / READY_DEGRADED / COMPLETED — every step made it through.
    if (status === 'READY' || status === 'READY_DEGRADED' || status === 'COMPLETED') return 'done';

    // Resolve which STEPS index should be "active" right now.  Three-tier lookup:
    //   1. STATUS_TO_STEP_IDX — explicit table covering every ProcessingStatus
    //      so early-phase statuses (NOT_STARTED / QUEUED / UPLOADING / OCR /
    //      CHUNKING / EMBEDDING / INDEXING / ...) render correctly instead of
    //      silently falling through to "Generating documentary article".
    //   2. STEPS.findIndex — defensive backstop for any future status whose id
    //      matches a STEPS row but wasn't added to the table.
    //   3. Fallback to idx 0 ("Uploading chapter") — better than the historical
    //      default of idx 2, which lied during the pre-extraction phase.
    const fromTable = STATUS_TO_STEP_IDX[status];
    const fromSteps = STEPS.findIndex((s) => s.id === status);
    const activeIndex = fromTable !== undefined ? fromTable : (fromSteps >= 0 ? fromSteps : 0);

    if (idx < activeIndex) return 'done';
    if (idx === activeIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-6">
      <div className="max-w-md w-full bg-white dark:bg-[#1C1C1F] rounded-2xl shadow-sm border border-[#E2E1DC] dark:border-white/10 p-8">

        {/* Stuck warning — visible only when preparation has been in flight >60s with
            no forward progress. Provides the user with a clear, actionable signal that
            the pipeline is stalled (vs. simply slow) and directs them to Force Retry or
            the NCERT PDF escape hatch. */}
        {isStuck && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-left">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
              <span className="font-semibold">This is taking longer than expected</span>
              {' '}— chapters usually finish in 30–90 seconds. The pipeline looks stalled at{' '}
              <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 font-mono text-[12px]">
                {status || 'an unknown step'}
              </code>
              . Tap <b>Force Retry now</b> below to nudge it, or open the original PDF to keep studying.
            </div>
          </div>
        )}

        <div className="flex justify-center mb-6">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-2 ${
            isStuck
              ? 'bg-amber-200 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300'
              : isFailed
              ? isNonRetryable
                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-500/20 text-rose-500 dark:text-rose-400'
              : 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
          }`}>
            {isFailed ? <XCircle className="w-8 h-8" /> : <Sparkles className="w-8 h-8" />}
          </div>
        </div>

        <h2 className={`text-2xl font-bold text-center mb-2 ${
          isFailed
            ? isNonRetryable
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-rose-600 dark:text-rose-400'
            : 'text-[#1A1A1A] dark:text-white'
        }`}>
          {isStuck
            ? `Stuck while preparing…`
            : isFailed
            ? (failedCopy?.title ?? 'Generation hit an issue')
            : 'Preparing your learning experience...'}
        </h2>
        <p className={`text-center mb-2 text-sm ${isFailed ? (isNonRetryable ? 'text-[#555] dark:text-gray-400' : 'text-rose-500 dark:text-rose-400') : 'text-[#555] dark:text-gray-400'}`}>
          {isStuck
            ? `No forward progress in over ${stuckMinutes} minute${stuckMinutes === 1 ? '' : 's'}. You can keep waiting, force a retry, or read the original PDF in the meantime.`
            : isFailed
            ? (failedCopy?.description ?? "We hit an issue generating this chapter's documentary article. Use Force Retry below, or check the chapter status in your notebook.")
            : 'We are analyzing the NCERT chapter and generating your premium documentary content.'}
        </p>

        {/* Phase 3: when the backend actually wrote an errorDetails string and we
            have it, surface it as a small monospace ribbon so the user knows the
            REAL failure (e.g. "getaddrinfo ENOTFOUND storage.googleapis.com") instead
            of just the user-friendly summary. Belt-and-braces tech detail — users
            can report it when filing a support ticket. */}
        {isFailed && errorDetails && (
          <p className="text-center mb-6 text-[11px] font-mono text-slate-500 dark:text-gray-500 break-words">
            <span className="opacity-60">details:</span> {errorDetails}
          </p>
        )}

        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 text-[15px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span>NCERT chapter located</span>
          </div>

          {STEPS.map((step, idx) => {
            const state = getStepState(step.id, idx);
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 text-[15px] transition-colors duration-300 ${
                  state === 'done' ? 'text-emerald-600 dark:text-emerald-400 font-medium' :
                  state === 'active' ? 'text-[#1A1A1A] dark:text-white font-semibold' :
                  state === 'failed' ? 'text-rose-500 dark:text-rose-400 font-semibold' :
                  'text-[#777] dark:text-gray-500'
                }`}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : state === 'active' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                ) : state === 'failed' ? (
                  <XCircle className="w-5 h-5 text-rose-500" />
                ) : (
                  <Circle className="w-5 h-5 opacity-40" />
                )}
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        <div className="bg-[#F9F8F4] dark:bg-white/5 rounded-xl p-4 flex flex-col items-center justify-center border border-[#E2E1DC] dark:border-white/10">
          {isFailed ? (
            <>
              <span className={`text-[13px] font-medium ${isNonRetryable ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {isNonRetryable ? 'Re-upload required' : 'Generation failed'}
              </span>
              <div className={`w-full h-1.5 rounded-full mt-3 overflow-hidden ${isNonRetryable ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-rose-100 dark:bg-rose-500/20'}`}>
                <div className={`h-full rounded-full w-full ${isNonRetryable ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
              </div>
            </>
          ) : (
            <>
              <span className="text-[13px] text-[#555] dark:text-gray-400 font-medium">Estimated time: 30–90 seconds</span>
              <div className="w-full bg-[#E2E1DC] dark:bg-white/10 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full w-1/3 animate-pulse"></div>
              </div>
            </>
          )}
        </div>

        {/* Action area — promoted to a primary CTA when stuck so the user can act on
            the warning chip above. The "Open NCERT PDF" escape hatch lives one click
            below Force Retry and switches the reader to a mode that doesn't depend on
            the article-generation job (the source PDF is streamed from GCS via a
            separate path).
            Phase 3: when the failure is non-retryable (MISSING_SOURCE_FILE /
            PERMISSION_DENIED / SOURCE_NOT_FOUND / SNAPSHOT_FAILED), we HIDE the
            Force Retry CTA entirely (clicking it would just re-run the same broken
            path) and promote "Open NCERT PDF instead" to the primary amber CTA so
            the user has exactly one obvious next step. */}
        <div className="mt-6 flex flex-col gap-2">
          {onRetry && !isNonRetryable && (
            <button
              onClick={onRetry}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isStuck
                  ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                  : 'border border-[#E2E1DC] dark:border-white/10 text-[#777] hover:text-[#1A1A1A] dark:hover:text-white'
              }`}
            >
              {isStuck ? 'Force Retry now' : 'Stuck? Force Retry'}
            </button>
          )}
          {onOpenPdf && (
            <button
              onClick={onOpenPdf}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                isNonRetryable
                  ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                  : 'border border-[#E2E1DC] dark:border-white/10 text-[13px] font-medium text-[#555] dark:text-gray-400 hover:text-[#1A1A1A] dark:hover:text-white'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open NCERT PDF instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
