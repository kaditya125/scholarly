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
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import MarkdownMessage from './MarkdownMessage';
import ReasoningTimeline, { RStep } from './ReasoningTimeline';
import OfficialSourceCarousel from './OfficialSourceCarousel';

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
  /** Short follow-up questions the student might naturally ask next. */
  suggestions?: string[];
  /** Fires when the student clicks a follow-up suggestion chip. */
  onSuggestionClick?: (text: string) => void;

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
 * Chases the incoming buffer at a steady, natural human reading pace (~45–80 chars/sec).
 */
function useSmoothReveal(text: string, streaming: boolean): string {
  const full = text || '';
  const ref = useRef(full);
  ref.current = full;

  const everStreamed = useRef(streaming);
  if (streaming) everStreamed.current = true;

  const [shown, setShown] = useState(streaming ? 0 : full.length);

  useEffect(() => {
    if (!everStreamed.current) { setShown(ref.current.length); return; }
    const id = setInterval(() => {
      setShown((p) => {
        const f = ref.current.length;
        if (p >= f) return p;
        // Ultra-smooth, gentle reading cadence (~45–80 chars/sec).
        // Reveals 1–3 characters per tick at 25ms interval so every sentence flows naturally.
        const remaining = f - p;
        const step = Math.max(1, Math.min(3, Math.ceil(remaining / 300)));
        return Math.min(f, p + step);
      });
    }, 25);
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
 *   follow-ups           clickable "what next" chips, once the reply has settled
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
  suggestions = [],
  onSuggestionClick,
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

  const revealedRaw = useSmoothReveal(content, streaming);
  const revealed = useMemo(() => {
    if (!revealedRaw) return revealedRaw;
    const fences = (revealedRaw.match(/```/g) || []).length;
    if (fences % 2 === 0) return revealedRaw;
    return revealedRaw.slice(0, revealedRaw.lastIndexOf('```'));
  }, [revealedRaw]);

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
  const hasReasoning = steps.length > 0 || streaming;

  // Detect specific examination with strict gating — never trigger on greetings or casual pleasantries
  const officialExamContext = useMemo(() => {
    const text = content || '';
    if (!text || text.length < 30) return null;

    // Reject greetings and conversational pleasantries
    const isGreeting = /^(welcome\s*back|hello|hi\s*there|hey|greetings|how\s*can\s*i\s*help|what\s*shall\s*we\s*master)/i.test(text.trim()) && !/syllabus|pattern|tier\s*[1I2II]|prelims|cutoff|eligibility|exam\s*date|vacancy|marking/i.test(text);
    if (isGreeting) return null;

    // Must have substantive academic or examination focus
    const hasExamSubstance = /syllabus|subtopic|pattern|cutoff|eligibility|age\s*limit|vacanc|tier\s*[1I2II]|prelims|mains|paper\s*[1-4]|admit\s*card|answer\s*key|official\s*(notice|notification|portal|website|calendar)|gov\.in|nic\.in|pyq|marking\s*scheme|exam\s*date|negative\s*marking|quantitative|reasoning|general\s*studies|physics|chemistry|biology|mathematics/i.test(text);
    if (!hasExamSubstance) return null;

    const isBpsc = /\b(BPSC|Bihar Public Service|70th CCE|71st CCE|72nd CCE)\b/i.test(text);
    const isUppsc = /\b(UPPSC|Uttar Pradesh Public Service|UP PCS)\b/i.test(text);
    const isSsc = /\b(SSC|Staff Selection Commission|CGL|CHSL|MTS|CPO)\b/i.test(text);
    const isUpsc = (/\b(UPSC|Union Public Service Commission|IAS|IPS|CSE|CSAT)\b/i.test(text) || (/\bCivil Services\b/i.test(text) && !isBpsc && !isUppsc));
    const isNeet = /\b(NEET|National Eligibility cum Entrance|NTA NEET)\b/i.test(text);
    const isJee = /\b(JEE\s*(Main|Advanced)|IIT\s*JEE|Joint Entrance Examination)\b/i.test(text);

    if (isBpsc) {
      return {
        examId: 'BPSC_CCE',
        examName: 'Bihar Public Service Commission — Combined Competitive Examination',
        examShortName: 'BPSC 72nd CCE',
        authorityName: 'Bihar Public Service Commission (BPSC)',
        authorityUrl: 'https://bpsc.bihar.gov.in',
        pdfUrl: 'https://bpsc.bihar.gov.in',
        pdfTitle: 'BPSC 72nd CCE Official Notice & Calendar',
        documentHash: 'c7d9e1f8298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b99',
        activeTopic: 'General Studies & Bihar Special',
        relatedQueries: [
          'What is the detailed syllabus for BPSC 72nd CCE Prelims (General Studies)?',
          'What are the age limits and category relaxations for BPSC CCE?',
          'What is the BPSC Mains exam pattern and optional subject list?',
        ],
      };
    }

    if (isUppsc) {
      return {
        examId: 'UPPSC_PCS',
        examName: 'Uttar Pradesh Combined State / Upper Subordinate Services',
        examShortName: 'UPPSC PCS',
        authorityName: 'Uttar Pradesh Public Service Commission (UPPSC)',
        authorityUrl: 'https://uppsc.up.nic.in',
        pdfUrl: 'https://uppsc.up.nic.in',
        pdfTitle: 'UPPSC PCS 2026 Official Notice & Syllabus',
        documentHash: 'd8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9',
        activeTopic: 'General Studies & UP Special',
        relatedQueries: [
          'What is the syllabus for UPPSC PCS Prelims Paper 1 & Paper 2?',
          'What is the UPPSC PCS Mains exam pattern?',
          'What are the age limits and reservation rules for UPPSC?',
        ],
      };
    }

    if (isUpsc) {
      return {
        examId: 'UPSC_CSE',
        examName: 'Civil Services Examination',
        examShortName: 'UPSC CSE',
        authorityName: 'Union Public Service Commission',
        authorityUrl: 'https://upsc.gov.in',
        pdfUrl: 'https://upsc.gov.in',
        pdfTitle: 'UPSC CSE 2026 Official Gazette Notification',
        documentHash: 'a7b3c2998fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b888',
        activeTopic: 'General Studies & CSAT',
        relatedQueries: [
          'What is the CSAT qualifying cutoff and syllabus for UPSC Prelims?',
          'What are the optional subject choices available in UPSC Mains?',
          'What are the age relaxation rules for OBC/SC/ST in UPSC CSE?',
        ],
      };
    }

    if (isNeet) {
      return {
        examId: 'NEET_UG',
        examName: 'National Eligibility cum Entrance Test',
        examShortName: 'NEET UG',
        authorityName: 'National Testing Agency (NTA)',
        authorityUrl: 'https://neet.nta.nic.in',
        pdfUrl: 'https://neet.nta.nic.in',
        pdfTitle: 'NEET UG 2026 Information Bulletin',
        documentHash: 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149a01',
        activeTopic: 'Physics, Chemistry & Biology',
        relatedQueries: [
          'What is the chapter-wise weightage for Biology in NEET UG?',
          'What is the NEET UG marking scheme and negative marking?',
          'What are the minimum qualifying percentiles for NEET UG?',
        ],
      };
    }

    if (isJee) {
      return {
        examId: 'JEE_MAIN',
        examName: 'Joint Entrance Examination (Main)',
        examShortName: 'JEE Main',
        authorityName: 'National Testing Agency (NTA)',
        authorityUrl: 'https://jeemain.nta.nic.in',
        pdfUrl: 'https://jeemain.nta.nic.in',
        pdfTitle: 'JEE Main 2026 Information Bulletin',
        documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        activeTopic: 'Mathematics & Physics',
        relatedQueries: [
          'What are the high-weightage topics in JEE Main Physics?',
          'What are the qualifying percentile cutoffs for JEE Advanced?',
          'What is the chapter-wise weightage for Mathematics in JEE Main?',
        ],
      };
    }

    if (isSsc) {
      return {
        examId: 'SSC_CGL',
        examName: 'Combined Graduate Level Examination',
        examShortName: 'SSC CGL',
        authorityName: 'Staff Selection Commission',
        authorityUrl: 'https://ssc.gov.in',
        pdfUrl: 'https://ssc.gov.in',
        pdfTitle: 'SSC CGL 2026 Official Notice & Syllabus',
        documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        activeTopic: 'Tier I Quantitative & Reasoning Syllabus',
        relatedQueries: [
          'What is the marking scheme and negative marking in SSC CGL Tier 1?',
          'What are the eligibility criteria and cutoff dates for SSC CGL 2026?',
          'Can you explain the Tier 2 Mathematical Abilities syllabus?',
        ],
      };
    }

    return null;
  }, [content]);

  // Only consider fully revealed once typewriter has completed the full text
  const isFullyRevealed = !streaming && (content || '').length > 0 && revealed.length >= (content || '').length;

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
      {/* break-words covers long unbroken tokens (base64, identifiers, URLs without
          hyphens) that offer the line-breaker no opportunity of its own. The structural
          guard against sideways drift lives on the centred column in Chat.tsx; deliberately
          no overflow-x here, since this subtree hosts the absolutely-positioned selection
          popup and clipping would swallow it. */}
      <div ref={bodyRef} className="relative min-w-0 max-w-full break-words" onMouseUp={handleSelection}>
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
          <div className="font-answer text-[14.5px] sm:text-[15px] leading-[1.65] mb-3 text-slate-700 dark:text-slate-300/95 prose prose-slate dark:prose-invert max-w-none w-full min-w-0 break-words
                          prose-headings:font-semibold prose-headings:tracking-[-0.018em] prose-headings:text-slate-900 dark:prose-headings:text-slate-100
                          prose-h1:text-[18px] sm:text-[19px] prose-h1:mt-6 prose-h1:mb-2.5
                          prose-h2:text-[16px] sm:text-[16.5px] prose-h2:mt-6 prose-h2:mb-2
                          prose-h3:text-[14.5px] sm:text-[15px] prose-h3:mt-5 prose-h3:mb-1.5
                          prose-p:my-3 prose-p:leading-[1.65] prose-p:break-words
                          prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-[1.6] prose-li:marker:text-slate-400 prose-li:break-words
                          prose-strong:font-semibold prose-strong:text-slate-900 dark:prose-strong:text-slate-100
                          prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                          prose-code:font-mono prose-code:text-[13px] prose-code:font-medium prose-code:bg-slate-100 dark:prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                          prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-7
                          prose-img:rounded-2xl prose-img:shadow-md prose-img:max-w-full prose-img:object-cover
                          [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:max-w-full [&_.katex-display]:py-1
                          [&_pre]:max-w-full [&_table]:max-w-full">
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

      {/* ── Official Verified Source Deck (emerges only after full reply is generated) ── */}
      <AnimatePresence>
        {isFullyRevealed && officialExamContext && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <OfficialSourceCarousel source={officialExamContext} onSuggestionClick={onSuggestionClick} />
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── Follow-ups ──────────────────────────────────────────────────────── */}
      {!streaming && content && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick?.(s)}
              className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-gray-300 text-[12.5px] font-medium hover:bg-slate-200 dark:hover:bg-white/[0.1] hover:text-slate-800 dark:hover:text-gray-100 transition-colors text-left"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-indigo-500" strokeWidth={1.75} />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
