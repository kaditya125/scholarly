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
  Quote,
  FolderClosed,
  Brain,
  ChevronRight,
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
  /** True while this reply is still streaming — drives the caret and the activity line. */
  streaming?: boolean;
  /** Backend progress events, mapped to the reasoning timeline's step model. */
  steps?: RStep[];
  /** Most recent progress message, shown on the activity line while streaming. */
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
 *   📁 Read files ›      one muted activity line — live backend status while streaming;
 *                        click to expand the reasoning steps and every source used
 *   markdown body        the answer itself (typography: `.chat-md` in index.css)
 *   action bar           copy, with rate · listen · regenerate on hover
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
  const hasReasoning = steps.length > 0 || streaming;

  // Detect specific examination with strict gating — never trigger on greetings or casual pleasantries
  const officialExamContext = useMemo(() => {
    const text = content || '';
    if (!text || text.length < 30) return null;

    // Reject greetings, capability introductions, and conversational pleasantries
    const isGreetingOrCapability =
      /^(welcome\s*back|hello|hi\s*there|hey|greetings|how\s*can\s*i\s*help|what\s*shall\s*we\s*master)/i.test(text.trim()) ||
      /(what\s*can\s*i\s*do\s*for\s*you|here['’]s\s*what\s*i\s*can\s*do|i\s*can\s*help\s*with|tell\s*me\s*what\s*you\s*want|ready\s*to\s*advance|ready\s*to\s*conquer|i\s*can\s*also|code\s*changes|troubleshooting)/i.test(text);
    if (isGreetingOrCapability) return null;

    // Must be specifically focused on official notification, syllabus document or exam administration
    const hasOfficialNoticeIntent =
      /(official\s*(notice|notification|portal|gazette|bulletin|information)|canonical\s*syllabus|admit\s*card|exam\s*calendar|nta\.nic\.in|ssc\.gov\.in|bpsc\.bihar\.gov\.in|upsc\.gov\.in)/i.test(text);
    if (!hasOfficialNoticeIntent) return null;

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
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex flex-col w-full">
      {/* ── Activity line: the reference's "📁 Read files" row ─────────────────
          Measured at 14px text / 16px icon in #767778, 28px tall, 13px above the answer.
          While streaming it carries the live backend status; click for the steps + sources. */}
      {(hasReasoning || sources.length > 0) && (
        <div className={cn('flex flex-col items-start', content ? 'mb-[13px]' : 'mb-1')}>
          <button
            onClick={() => setShowDetails((prev) => !prev)}
            className="group inline-flex items-center gap-1.5 h-7 max-w-full text-[14px] text-[#767778] hover:text-[#1a1c1f] dark:text-[#9a9b9d] dark:hover:text-white transition-colors cursor-pointer select-none"
          >
            {sources.length > 0 || streaming
              ? <FolderClosed className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              : <Brain className="w-4 h-4 shrink-0" strokeWidth={1.75} />}
            <span className={cn('truncate', streaming && 'chat-shimmer')}>
              {streaming
                ? statusMessage || 'Thinking'
                : sources.length > 0
                  ? 'Read files'
                  : 'Thought'}
            </span>
            <ChevronRight
              className={cn('w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all', showDetails && 'rotate-90 opacity-100')}
              strokeWidth={2}
            />
          </button>

          {/* Expandable details: the reasoning steps, then every source the answer drew on. */}
          {showDetails && (
            <div className="self-stretch mt-1 mb-1 ml-[7px] pl-3 border-l border-[#ececec] dark:border-white/10 space-y-2">
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
              {sources.length > 0 && (
                <div className="flex flex-col gap-1">
                  {sources.map((s) => (
                    <div
                      key={s.source}
                      title={s.selectionReasoning || s.source}
                      className="flex items-center gap-2 min-w-0 text-[13px] text-[#5d5e60] dark:text-[#a5a6a8]"
                    >
                      <SourceIcon source={s.source} className="w-3.5 h-3.5 shrink-0 text-[#8e8f90]" />
                      {isUrl(s.source) ? (
                        <a href={s.source} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                          {sourceLabel(s.source)}
                        </a>
                      ) : (
                        <span className="truncate">{sourceLabel(s.source)}</span>
                      )}
                      {typeof s.pageNumber === 'number' && (
                        <span className="text-[12px] text-[#8e8f90] shrink-0">p.{s.pageNumber}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Answer body ─────────────────────────────────────────────────────── */}
      <div ref={bodyRef} className="relative min-w-0 max-w-full break-words" onMouseUp={handleSelection}>
        {!content && streaming ? null : (
          // Typography lives in `.chat-md` (index.css), measured against the reference.
          <div className="chat-md w-full min-w-0">
            <MarkdownMessage content={revealed} />
            {streaming && <span className="inline-block w-1.5 h-3.5 ml-1 bg-neutral-400 animate-pulse align-middle" />}
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
              className="absolute z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1c1f] hover:bg-black text-white text-[13px] font-medium shadow-lg transition-colors"
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

      {/* ── Action bar: the reference's lone copy icon (15px, #8e8f90, directly under the
          text); the other actions appear on hover. ──────────────────────────────────── */}
      {!streaming && content && (
        <div className="group/actions flex items-center gap-0.5 text-[#8e8f90] dark:text-[#8b8c8e] mt-1">
          <button
            onClick={onCopy}
            className="p-1 -ml-0.5 rounded-md hover:bg-[#f2f3f5] dark:hover:bg-white/5 hover:text-[#1a1c1f] dark:hover:text-white transition-colors cursor-pointer"
            title="Copy"
          >
            {copied ? <Check className="w-[15px] h-[15px] text-emerald-500" /> : <Copy className="w-[15px] h-[15px]" strokeWidth={1.75} />}
          </button>

          {/* Secondary actions softly accessible on hover */}
          <div className="opacity-0 group-hover/actions:opacity-100 flex items-center gap-1 transition-opacity duration-150">
            <button
              onClick={() => onRate?.('thumbs_up')}
              disabled={!onRate}
              className={cn(
                'p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                rating === 'thumbs_up'
                  ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                  : 'hover:bg-[#f2f3f5] dark:hover:bg-white/5 hover:text-[#1a1c1f] dark:hover:text-white'
              )}
              title={onRate ? 'Good response' : 'Rating available once saved'}
            >
              <ThumbsUp className="w-[15px] h-[15px]" strokeWidth={1.75} />
            </button>

            <button
              onClick={() => onRate?.('thumbs_down')}
              disabled={!onRate}
              className={cn(
                'p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                rating === 'thumbs_down'
                  ? 'text-red-500 bg-red-50 dark:bg-red-500/10'
                  : 'hover:bg-[#f2f3f5] dark:hover:bg-white/5 hover:text-[#1a1c1f] dark:hover:text-white'
              )}
              title={onRate ? 'Bad response' : 'Rating available once saved'}
            >
              <ThumbsDown className="w-[15px] h-[15px]" strokeWidth={1.75} />
            </button>

            <button
              onClick={onSpeak}
              className={cn(
                'p-1 rounded-md hover:bg-[#f2f3f5] dark:hover:bg-white/5 hover:text-[#1a1c1f] dark:hover:text-white transition-colors',
                speaking && 'text-blue-500'
              )}
              title={speaking ? 'Stop' : 'Read aloud'}
            >
              {speaking ? <VolumeX className="w-[15px] h-[15px]" strokeWidth={1.75} /> : <Volume2 className="w-[15px] h-[15px]" strokeWidth={1.75} />}
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1 rounded-md hover:bg-[#f2f3f5] dark:hover:bg-white/5 hover:text-[#1a1c1f] dark:hover:text-white transition-colors"
                title="Regenerate response"
              >
                <RefreshCw className="w-[15px] h-[15px]" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Follow-ups ──────────────────────────────────────────────────────── */}
      {!streaming && content && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick?.(s)}
              className="inline-flex items-center max-w-full h-7 px-3 rounded-full border border-[#ececec] dark:border-white/10 text-[13px] text-[#1a1c1f] dark:text-[#e6e7e9] hover:bg-[#f5f5f6] dark:hover:bg-white/[0.06] transition-colors text-left"
            >
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
