import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, RotateCw, X } from 'lucide-react';
import { AgentArtifact, Flashcard, agentApi } from '../../lib/api/agent';
import { cn } from '../../lib/utils';
import Notation from './Notation';
import { ArtifactKindIcon, artifactKindName, describeArtifact } from './artifactKind';
import QuizPlayer from './workspace/QuizPlayer';
import ReportView from './workspace/ReportView';
import StudyPlanView from './workspace/StudyPlanView';

/**
 * The workspace: a right-hand panel that shows what an agent run produced.
 *
 *   - A document (PDF) has no public URL — the server serves it only to its owner — so the panel
 *     fetches it with the student's token and shows it from a local blob URL. That same blob backs
 *     Download and "Open in new tab", so neither makes a second request.
 *   - A flashcard deck has no file at all: its cards are the artifact's content, shown here one at
 *     a time. Formula cards draw their markup (F_x, v^2) as real notation.
 *   - A quiz is taken here (Phase 6), through the existing quiz routes and grader; an analysis and
 *     a revision plan are shown as the agent saved them.
 */

export interface AgentWorkspacePanelProps {
  artifactId: string | null;
  /** Shown while the artifact's own record loads. */
  title?: string;
  onClose: () => void;
  /** Sends a follow-up to the agent ("Analyze my quiz mistakes"), when the chat allows it. */
  onAsk?: (text: string) => void;
}

const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

const fileNameFor = (title: string, version: number) =>
  `${title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document'}-v${version}.pdf`;

function FlashcardsViewer({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(cards.length - 1, Math.max(0, i + delta)));
      setFlipped(false);
    },
    [cards.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!card) return null;
  const isFormula = card.kind === 'formula';

  return (
    <div className="h-full flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        <span className="capitalize">{card.kind ?? 'card'}</span>
      </div>

      <button
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Show the question' : 'Show the answer'}
        className={cn(
          'flex-1 min-h-[220px] w-full rounded-2xl border px-6 py-8 flex flex-col items-center justify-center text-center gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          flipped
            ? 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/[0.08]'
            : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-neutral-300 dark:hover:border-white/20',
        )}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-gray-500">
          {flipped ? 'Answer' : 'Question'}
        </span>
        {flipped ? (
          isFormula ? (
            <Notation formula text={card.back} className="font-serif text-[26px] leading-snug text-[#0f3490] dark:text-indigo-200" />
          ) : (
            <span className="text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-100">
              <Notation text={card.back} />
            </span>
          )
        ) : (
          <span className="text-[17px] leading-relaxed font-medium text-neutral-900 dark:text-neutral-50">
            <Notation text={card.front} />
          </span>
        )}
        {flipped && card.note && <span className="text-[12px] text-slate-500 dark:text-gray-400">{card.note}</span>}
        {!flipped && <span className="text-[12px] text-slate-400 dark:text-gray-500">Click or press Space to reveal</span>}
      </button>

      <div className="flex items-center justify-between">
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          Previous
        </button>
        <button
          onClick={() => setFlipped((f) => !f)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <RotateCw className="w-3.5 h-3.5" strokeWidth={2} />
          Flip
        </button>
        <button
          onClick={() => go(1)}
          disabled={index === cards.length - 1}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          Next
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default function AgentWorkspacePanel({ artifactId, title, onClose, onAsk }: AgentWorkspacePanelProps) {
  const [meta, setMeta] = useState<AgentArtifact | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!artifactId) return;
    let cancelled = false;
    let url: string | null = null;
    setMeta(null);
    setBlobUrl(null);
    setError(null);
    (async () => {
      try {
        const artifact = await agentApi.getArtifact(artifactId);
        if (cancelled) return;
        setMeta(artifact);
        // Only documents have a file; a flashcard deck is its content.
        if (artifact.kind === 'document') {
          const blob = await agentApi.downloadArtifact(artifactId);
          if (cancelled) return;
          url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          setBlobUrl(url);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load this.');
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [artifactId, attempt]);

  useEffect(() => {
    if (!artifactId) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [artifactId, onClose]);

  if (!artifactId) return null;
  const kind = meta?.kind;
  const isDeck = kind === 'flashcards';
  const isFile = kind === 'document';
  const heading = meta?.title || title || artifactKindName(kind);
  const cards: Flashcard[] = isDeck ? meta?.spec?.cards ?? [] : [];

  const subtitle = meta
    ? isFile
      ? `PDF · ${meta.pageCount} page${meta.pageCount === 1 ? '' : 's'} · ${formatBytes(meta.sizeBytes)}${meta.currentVersion > 1 ? ` · version ${meta.currentVersion}` : ''}`
      : describeArtifact(meta)
    : error
      ? 'Not available'
      : 'Loading…';

  return (
    <>
      {/* Below lg the panel covers the thread, so give it a backdrop that also closes it. */}
      <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${heading} (${artifactKindName(kind).toLowerCase()})`}
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-[min(560px,100vw)] bg-white dark:bg-[#141416] border-l border-neutral-200 dark:border-white/10 shadow-2xl"
      >
        <header className="flex items-start gap-3 px-4 py-3 border-b border-neutral-200 dark:border-white/10">
          <ArtifactKindIcon kind={kind} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-semibold text-neutral-900 dark:text-neutral-100 truncate">{heading}</h2>
            <p className="text-[12px] text-slate-500 dark:text-gray-400 tabular-nums">{subtitle}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </header>

        {blobUrl && meta && isFile && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 dark:border-white/[0.06]">
            <a
              href={blobUrl}
              download={fileNameFor(meta.title, meta.currentVersion)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2} />
              Download
            </a>
            <a
              href={blobUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
              Open in new tab
            </a>
          </div>
        )}

        <div className={cn('relative flex-1 min-h-0', isFile ? 'bg-neutral-100 dark:bg-black/30' : 'bg-neutral-50 dark:bg-black/20')}>
          {isDeck && cards.length > 0 ? (
            <FlashcardsViewer cards={cards} />
          ) : kind === 'quiz' && meta?.spec ? (
            <QuizPlayer spec={meta.spec} onAsk={onAsk} />
          ) : kind === 'report' && meta?.spec ? (
            <ReportView spec={meta.spec} onAsk={onAsk} />
          ) : kind === 'studyplan' && meta?.spec ? (
            <StudyPlanView spec={meta.spec} />
          ) : blobUrl ? (
            <iframe src={blobUrl} title={heading} className="absolute inset-0 w-full h-full border-0" />
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[13.5px] text-neutral-700 dark:text-neutral-300">{error}</p>
              <button
                onClick={() => setAttempt((n) => n + 1)}
                className="h-8 px-3 rounded-lg text-[12.5px] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center gap-2.5 text-[13px] text-slate-500 dark:text-gray-400" role="status">
              <span className="w-4 h-4 rounded-full border-2 border-indigo-500/25 border-t-indigo-500 motion-safe:animate-spin" aria-hidden />
              Loading…
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
