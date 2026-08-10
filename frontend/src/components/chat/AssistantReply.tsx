import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  RefreshCw,
  FileText,
  Globe,
  Eye,
  ChevronsUpDown,
  Quote,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import MarkdownMessage from './MarkdownMessage';
import ReasoningTimeline, { RStep } from './ReasoningTimeline';

/**
 * A retrieved source, as emitted by the backend's SSE `citation` events and
 * repeated in the final `done` payload. Only `source` is guaranteed; the rest
 * are present when RetrievalService had them (see services/rag/retrieval.service.ts).
 */
export interface ReplySource {
  source: string;
  text?: string;
  score?: number;
  authorityScore?: number;
  selectionReasoning?: string;
  pageNumber?: number;
}

export type Rating = 'thumbs_up' | 'thumbs_down';

export interface AssistantReplyProps {
  content: string;
  /** True while this reply is still streaming — drives the caret and live status line. */
  streaming?: boolean;
  /** Backend progress events, mapped to the reasoning timeline's step model. */
  steps?: RStep[];
  /** Most recent progress message, shown as the live status line. */
  statusMessage?: string;
  /** The model's pre-formatting draft, streamed into the reasoning timeline. */
  reasoning?: string;
  /** Sources retrieved for this answer. */
  citations?: ReplySource[];

  onCopy?: () => void;
  copied?: boolean;
  onSpeak?: () => void;
  speaking?: boolean;
  onRegenerate?: () => void;
  /** Omitted while the message has no persisted id yet — the buttons then render disabled. */
  onRate?: (rating: Rating) => void;
  rating?: Rating | null;
  /** Called when the reader selects text and clicks Reply. */
  onQuote?: (text: string) => void;
  /**
   * Fires once the smooth reveal has rendered the whole answer AND streaming has ended.
   * Chat uses it to hold this component mounted through the tail of the animation, so the
   * answer finishes writing instead of snapping to full text when the message is committed.
   */
  onRevealDone?: () => void;
}

/**
 * Smooth reveal for streamed text.
 *
 * The provider does not emit one token at a time — Gemini delivers fairly large
 * chunks, so rendering `content` raw makes the answer arrive in visible bursts
 * (a paragraph appears at once, then a pause, then another). This chases the
 * incoming buffer at a steady character rate instead, so the answer *writes*
 * itself. It only ever lags behind real content; it never invents text, and it
 * snaps to the full string the moment streaming stops.
 */
function useSmoothReveal(text: string, streaming: boolean): string {
  const full = text || '';
  const ref = useRef(full);
  ref.current = full;

  // Distinguishes a live reply from replayed history. History renders instantly —
  // only a reply that actually streamed gets the writing treatment. Once true it
  // stays true, so the reveal keeps running after `streaming` flips to false and
  // finishes the tail instead of snapping to the full string.
  const everStreamed = useRef(streaming);
  if (streaming) everStreamed.current = true;

  const [shown, setShown] = useState(streaming ? 0 : full.length);

  useEffect(() => {
    if (!everStreamed.current) { setShown(ref.current.length); return; }
    const id = setInterval(() => {
      setShown((p) => {
        const f = ref.current.length;
        if (p >= f) return p;
        // ~175–450 chars/sec — deliberately a reading pace, not a data-transfer pace.
        // The floor keeps a steady cadence when the buffer is nearly drained; the
        // ceiling stops a very long answer taking a minute. Purely cosmetic — it can
        // only lag real content, never run ahead of it.
        return Math.min(f, p + Math.max(7, Math.min(18, Math.ceil((f - p) / 70))));
      });
      // 40ms rather than 16ms: 25fps is indistinguishable for text, and it cuts the
      // number of full markdown re-renders by 60%. At 60fps the parse cost alone made
      // the animation stutter, which is the opposite of smooth.
    }, 40);
    return () => clearInterval(id);
  }, [streaming]);

  return everStreamed.current ? full.slice(0, shown) : full;
}

/** Web results carry a URL as their source; everything else is a document/notebook chunk. */
const isUrl = (s: string) => /^https?:\/\//i.test(s);

const sourceLabel = (s: string) => {
  if (!isUrl(s)) return s;
  try {
    return new URL(s).hostname.replace(/^www\./, '');
  } catch {
    return s;
  }
};

/** Distinct sources, preserving retrieval order (highest weighted score first). */
function distinctSources(citations: ReplySource[]): ReplySource[] {
  const seen = new Set<string>();
  const out: ReplySource[] = [];
  for (const c of citations) {
    if (!c?.source || seen.has(c.source)) continue;
    seen.add(c.source);
    out.push(c);
  }
  return out;
}

const SourceIcon = ({ source, className }: { source: string; className?: string }) =>
  isUrl(source) ? <Globe className={className} strokeWidth={1.75} /> : <FileText className={className} strokeWidth={1.75} />;

/**
 * AssistantReply — the reply template for the AI chat surface.
 *
 * Layout, top to bottom:
 *   Thought ›            collapsible reasoning timeline (backend progress stages)
 *   Viewed  · chips      distinct sources the retrieval layer actually read
 *   status line          live "Searching your notebooks…" while streaming
 *   markdown body        the answer itself
 *   N results            the full retrieved-source list, collapsed behind "More"
 *   action bar           copy · rate · listen · regenerate
 *
 * Every section is driven by data the backend genuinely emits. Sections with no
 * data simply don't render, so a reply with no retrieval degrades to plain markdown
 * plus an action bar rather than showing empty chrome.
 */
export default function AssistantReply({
  content,
  streaming = false,
  steps = [],
  statusMessage,
  reasoning,
  citations = [],
  onCopy,
  copied,
  onSpeak,
  speaking,
  onRegenerate,
  onRate,
  rating,
  onQuote,
  onRevealDone,
}: AssistantReplyProps) {
  const [showAllSources, setShowAllSources] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Floating "Reply" affordance for a text selection inside this reply.
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);

  const handleSelection = useCallback(() => {
    if (!onQuote) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';
    if (!sel || sel.rangeCount === 0 || text.length < 3) {
      setSelection(null);
      return;
    }
    // Only offer Reply for selections that live inside this reply's body.
    const container = bodyRef.current;
    if (!container || !container.contains(sel.anchorNode)) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const box = container.getBoundingClientRect();
    setSelection({
      text,
      top: rect.top - box.top - 38,
      left: Math.max(0, rect.left - box.left + rect.width / 2 - 40),
    });
  }, [onQuote]);

  // Answer is revealed at a steady rate rather than in provider-sized bursts.
  const revealedRaw = useSmoothReveal(content, streaming);
  /**
   * Mid-reveal the text routinely ends inside an unclosed ``` fence. Handing that to the
   * markdown renderer makes it try to parse a half-written diagram on every single frame —
   * expensive, and it spams the console with mermaid parse errors (visible in DevTools as
   * dozens of "Parse error on line 2"). Dropping the dangling fence until it completes
   * removes both. The block appears the moment its closing fence is revealed.
   */
  const revealed = useMemo(() => {
    if (!revealedRaw) return revealedRaw;
    const fences = (revealedRaw.match(/```/g) || []).length;
    if (fences % 2 === 0) return revealedRaw;
    return revealedRaw.slice(0, revealedRaw.lastIndexOf('```'));
  }, [revealedRaw]);

  // Tell the parent when there is nothing left to reveal.
  const doneRef = useRef(false);
  useEffect(() => {
    if (!onRevealDone || streaming || doneRef.current) return;
    const full = (content || '').length;
    if (full > 0 && revealed.length >= full) {
      doneRef.current = true;
      onRevealDone();
    }
  }, [streaming, revealed, content, onRevealDone]);

  const sources = useMemo(() => distinctSources(citations), [citations]);
  const visibleSources = showAllSources ? sources : sources.slice(0, 3);
  /**
   * While streaming we ALWAYS show the timeline, even before the first progress event
   * lands. chat.service does three Firestore round-trips (getOrCreateSession →
   * getMessages → saveMessage) before WorkflowEngine yields its first stage, so gating
   * on `steps.length > 0` left a 1–3s window showing nothing but bouncing dots. With an
   * empty step list the timeline simply renders step 1 ("Understanding the question")
   * as active, which is exactly what's happening at that moment.
   */
  const hasReasoning = steps.length > 0 || streaming;

  return (
    <div className="flex flex-col w-full text-slate-800 dark:text-gray-100">
      {/* ── Thought ─────────────────────────────────────────────────────────── */}
      {hasReasoning && (
        <ReasoningTimeline
          steps={steps}
          reasoningText={reasoning}
          streaming={streaming}
          hasAnswer={!!content}
          paceMs={streaming ? 420 : 0}
          showProgress
        />
      )}

      {/* ── Viewed ──────────────────────────────────────────────────────────── */}
      {sources.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 mr-0.5">
            <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
            Viewed
          </span>
          {sources.slice(0, 4).map((s) => (
            <span
              key={s.source}
              title={s.selectionReasoning || s.source}
              className="inline-flex items-center gap-1.5 max-w-[200px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[12px] font-medium"
            >
              <SourceIcon source={s.source} className="w-3 h-3 shrink-0" />
              <span className="truncate">{sourceLabel(s.source)}</span>
            </span>
          ))}
          {sources.length > 4 && (
            <span className="text-[12px] text-slate-400 dark:text-gray-500">+{sources.length - 4}</span>
          )}
        </div>
      )}

      {/* ── Live status line ────────────────────────────────────────────────── */}
      {streaming && statusMessage && (
        <div className="flex items-center gap-2 mb-3 text-[13.5px] text-slate-500 dark:text-gray-400">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-indigo-500 animate-spin shrink-0" />
          <span className="truncate">{statusMessage}</span>
        </div>
      )}

      {/* ── Answer body ─────────────────────────────────────────────────────── */}
      <div ref={bodyRef} className="relative" onMouseUp={handleSelection}>
        {!content && streaming ? (
          /* Deliberately empty. The reasoning timeline above is the single "working"
             signal — spinner, current step name, progress bar. The bouncing dots that
             used to live here duplicated it and were the only thing visible during the
             pre-stage window, which read as a hang. */
          null
        ) : (
          // Typography matched to the reference UI: one sans family throughout, with
          // weight and size carrying the hierarchy rather than a second face. `tracking-wide`
          // used to be applied here, which is wrong for body prose — wide tracking loosens
          // word shapes and makes long passages harder to scan.
          <div className="font-answer text-[15px] leading-[1.65] mb-3 text-slate-700 dark:text-slate-300/95 prose prose-slate dark:prose-invert max-w-none
                          prose-headings:font-semibold prose-headings:tracking-[-0.018em] prose-headings:text-slate-900 dark:prose-headings:text-slate-100
                          prose-h1:text-[19px] prose-h1:mt-6 prose-h1:mb-2.5
                          prose-h2:text-[16.5px] prose-h2:mt-6 prose-h2:mb-2
                          prose-h3:text-[15px] prose-h3:mt-5 prose-h3:mb-1.5
                          prose-p:my-3 prose-p:leading-[1.65]
                          prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-[1.6] prose-li:marker:text-slate-400
                          prose-strong:font-semibold prose-strong:text-slate-900 dark:prose-strong:text-slate-100
                          prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                          prose-code:font-mono prose-code:text-[13px] prose-code:font-medium prose-code:bg-slate-100 dark:prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                          prose-pre:bg-[#1e1e1e] prose-pre:p-0 prose-pre:rounded-xl prose-pre:font-mono prose-pre:text-[13px] prose-pre:leading-[1.6]
                          prose-blockquote:border-l-2 prose-blockquote:border-indigo-400/50 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-slate-600 dark:prose-blockquote:text-gray-400
                          prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-7
                          prose-table:text-[14px] prose-th:font-semibold
                          prose-img:rounded-2xl prose-img:shadow-md prose-img:max-w-[350px] prose-img:object-cover">
            <MarkdownMessage content={revealed} />
            {streaming && <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse align-middle" />}
          </div>
        )}

        <AnimatePresence>
          {selection && onQuote && (
            <motion.button
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.14 }}
              style={{ top: selection.top, left: selection.left }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onQuote(selection.text);
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="absolute z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12.5px] font-medium shadow-lg transition-colors"
            >
              <Quote className="w-3.5 h-3.5" strokeWidth={2} />
              Reply
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── N results ───────────────────────────────────────────────────────── */}
      {sources.length > 0 && (
        <div className="mb-3">
          <div className="text-[11.5px] text-slate-400 dark:text-gray-500 mb-1.5">
            {citations.length} {citations.length === 1 ? 'result' : 'results'}
          </div>
          <div className="space-y-0.5">
            {visibleSources.map((s) => (
              <div
                key={s.source}
                title={s.selectionReasoning || undefined}
                className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-gray-300 py-0.5 group"
              >
                <SourceIcon source={s.source} className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500" />
                <span className="truncate underline decoration-slate-200 dark:decoration-white/15 underline-offset-[3px] group-hover:decoration-slate-400 dark:group-hover:decoration-white/40 transition-colors">
                  {sourceLabel(s.source)}
                </span>
                {typeof s.pageNumber === 'number' && (
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 shrink-0">p.{s.pageNumber}</span>
                )}
              </div>
            ))}
          </div>
          {sources.length > 3 && (
            <button
              onClick={() => setShowAllSources((v) => !v)}
              className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              {showAllSources ? 'Less' : 'More'}
            </button>
          )}
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────────────────────── */}
      {!streaming && content && (
        <div className="flex items-center gap-1 text-slate-400 dark:text-gray-500">
          <button
            onClick={onCopy}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" strokeWidth={1.75} />}
          </button>

          <button
            onClick={() => onRate?.('thumbs_up')}
            disabled={!onRate}
            className={cn(
              'p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              rating === 'thumbs_up'
                ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                : 'hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-gray-200'
            )}
            title={onRate ? 'Good response' : 'Rating available once the reply is saved'}
          >
            <ThumbsUp className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <button
            onClick={() => onRate?.('thumbs_down')}
            disabled={!onRate}
            className={cn(
              'p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              rating === 'thumbs_down'
                ? 'text-red-500 bg-red-50 dark:bg-red-500/10'
                : 'hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-gray-200'
            )}
            title={onRate ? 'Bad response' : 'Rating available once the reply is saved'}
          >
            <ThumbsDown className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <button
            onClick={onSpeak}
            className={cn(
              'p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-gray-200 transition-colors',
              speaking && 'text-indigo-500'
            )}
            title={speaking ? 'Stop' : 'Read aloud'}
          >
            {speaking ? <VolumeX className="w-4 h-4" strokeWidth={1.75} /> : <Volume2 className="w-4 h-4" strokeWidth={1.75} />}
          </button>

          <span className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />

          <button
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12.5px] font-medium hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
            title="Regenerate response"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
