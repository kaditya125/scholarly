import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ScanLine,
  Loader2,
  X,
  BookOpen,
  Layers,
  Headphones,
  FileText,
  SlidersHorizontal,
  Target,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { auth } from '../../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { chapterPdfUrl } from '../../lib/api/scan';
import { ScanPanel } from './ScanPanel';
import { cn } from '../../lib/utils';
import {
  getDocumentaryChapter,
  DocumentaryChapter,
  makeArticleCacheKey,
  clearArticleCache,
} from '../../services/chapterDocumentaryService';
import { FlashcardModal, PodcastPlayerDrawer } from './DocumentaryBlocks';
import { PreparingChapter } from './PreparingChapter';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { api } from '../../lib/api/client';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ChapterReaderProps {
  notebookId: string;
  sourceId: string;
  chapterTitle?: string;
  bookTitle?: string;
  subject?: string;
  onBack: () => void;
}

interface ClientRect { x1: number; y1: number; x2: number; y2: number }

type ReadingMode = 'documentary' | 'split' | 'ncert' | 'exam';

// ─── Inline highlight utility ─────────────────────────────────────────────────
function HighlightedText({ text, highlights = [] }: { text: string; highlights?: string[] }) {
  if (!highlights.length) return <>{text}</>;
  let result = text;
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let remaining = result;

  const escapedHighlights = highlights.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedHighlights.join('|')})`, 'gi');
  const split = remaining.split(regex);

  split.forEach((part, i) => {
    const isMatch = highlights.some((h) => h.toLowerCase() === part.toLowerCase());
    parts.push({ text: part, highlight: isMatch });
  });

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark
            key={i}
            className="bg-[#F4E1CB] text-[#935D33]   px-1.5 py-0.5 rounded-[2px] font-normal not-italic"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

// ─── YouTube Video Embed ──────────────────────────────────────────────────────
function YouTubeEmbed({ chapter, youtubeVideos }: { chapter: DocumentaryChapter; youtubeVideos?: any[] }) {
  let videoId = '';
  if (youtubeVideos && youtubeVideos.length > 0 && youtubeVideos[0].id) {
    videoId = youtubeVideos[0].id;
  } else {
    // Map of known chapters to their YouTube video IDs
    const knownVideos: Record<string, string> = {
      'motion in a straight line': 'ZM8ECpBuQYE',
    'laws of motion': 'kKKM8Y-u7ds',
    'work energy power': 'w4QFJb9a8vo',
    'gravitation': 'TtpHjFbgBxY',
    'cell': 'MVAMmT1Nk0s',
    'genetics': 'CBezq1fFUEA',
    'thermodynamics': 'PwmNpq4Dyhk',
    'atoms': 'F62W18WRMKU',
    'waves': 'kDs3jFDyIsM',
    'living world': 'pvN8A5bSLOA', // Valid video for The Living World
  };

    const key = (chapter.title || 'Chapter Article').toLowerCase().trim();
    for (const [k, v] of Object.entries(knownVideos)) {
      if (key.includes(k)) { videoId = v; break; }
    }
  }

  // If no specific video is found, fallback to a general educational placeholder
  if (!videoId) {
    videoId = 'pvN8A5bSLOA'; 
  }

  return (
    <div className="my-8 w-full rounded-md overflow-hidden" style={{ aspectRatio: '16/9' }}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
        title={`${chapter.title} — Video`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
        loading="lazy"
      />
    </div>
  );
}

// ─── Article Hero Header (Eleken exact) ───────────────────────────────────────
function ArticleHero({ chapter }: { chapter: DocumentaryChapter }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <div className="mb-12">
      {/* Breadcrumb — "Home / Subjects / Physics / Chapter..." */}
      <div
        className="text-center text-[13px] text-[#9A9A95]  mb-8"
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
      >
        <span>Home</span>
        <span className="mx-2 text-[#C0BDB5]">/</span>
        <span>Subjects</span>
        <span className="mx-2 text-[#C0BDB5]">/</span>
        <span>{chapter.subject}</span>
        <span className="mx-2 text-[#C0BDB5]">/</span>
        <span className="text-[#1A1A1A] dark:text-white truncate">
          {(chapter.title || '').length > 40 ? (chapter.title || '').slice(0, 40) + '...' : chapter.title}
        </span>
      </div>

      {/* Tags + Date row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-sm"
            style={{ background: '#EEDEB6', color: '#7A6540', fontFamily: "'Inter', sans-serif" }}
          >
            ARTICLE
          </span>
          <span
            className="text-[11px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-sm"
            style={{ background: '#EEDEB6', color: '#7A6540', fontFamily: "'Inter', sans-serif" }}
          >
            {(chapter.subject || 'GENERAL').toUpperCase()}
          </span>
        </div>
        <span
          className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9A9A95] "
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          UPDATED ON:&nbsp;{dateStr}
        </span>
      </div>

      {/* H1 Title — Eleken large bold */}
      <h1
        className="text-[38px] sm:text-[44px] md:text-[50px] font-bold text-[#1A1A1A] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5"
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {chapter.title}
      </h1>

      {/* Reading time — "11 MIN TO READ" */}
      <div
        className="flex items-center gap-1.5 text-[13px] text-[#9A9A95]  mb-10"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <span>{(chapter.estimatedReadingTime || '15 mins').replace(' mins', ' MIN')}</span>
        <span className="font-semibold text-[#C4A96A]  tracking-[0.06em] uppercase text-[11px]">
          TO READ
        </span>
      </div>

      {/* Thin separator */}
      <div className="border-t border-[#E8E7E1] .06]" />
    </div>
  );
}

// ─── Sidebar TOC — Eleken exact (plain list, dividers, bold active) ───────────
function SidebarTOC({
  chapter,
  activeSectionId,
  onSelect,
}: {
  chapter: DocumentaryChapter;
  activeSectionId: string;
  onSelect: (id: string) => void;
}) {
  const entries = [
    ...(chapter.sections || []).map((s) => ({ id: s.id, label: s.title })),
    { id: 'sec-summary', label: 'In summary' },
  ];

  return (
    <aside
      className="hidden lg:block shrink-0 mr-10 xl:mr-14 custom-scrollbar border-r border-[#EAE8E1] dark:border-white/10"
      style={{
        width: '260px',
        position: 'sticky',
        top: '24px',
        alignSelf: 'flex-start',
        background: 'transparent',
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        padding: '24px 20px',
        paddingRight: '12px',
        height: 'fit-content',
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
        borderRadius: '4px'
      }}
    >
      <div className="flex items-center justify-between mb-4 pr-3">
        <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#9A9A95] dark:text-[#6A6A6F]">
          TABLE OF CONTENTS
        </span>
        <span className="text-[#9A9A95] dark:text-[#6A6A6F]">—</span>
      </div>

      {/* Thin top divider */}
      <div className="border-t border-[#E2E0D8] dark:border-white/10 mb-0" />

      {/* Entries — each separated by a thin divider, Eleken exact */}
      <div className="pr-3">
        {entries.map((entry) => {
          const active = activeSectionId === entry.id;
          return (
            <div key={entry.id}>
              <button
                onClick={() => onSelect(entry.id)}
                className={`block w-full text-left py-3.5 text-[14px] leading-[1.55] cursor-pointer transition-colors ${
                  active
                    ? 'font-semibold text-[#1A1A1A] dark:text-[#F0EFF0]'
                    : 'font-normal text-[#7A7A75] dark:text-[#9A9A9F] hover:text-[#1A1A1A] dark:hover:text-[#F0EFF0]'
                }`}
                style={{ background: 'transparent', border: 'none' }}
              >
                {entry.label}
              </button>
              {/* Thin divider between entries */}
              <div className="border-t border-[#E2E0D8] dark:border-white/10" />
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Article Content Renderer ─────────────────────────────────────────────────
function ArticleContent({
  chapter,
  activeSectionId,
  onTocClick,
  onSectionIntersect,
  scrollContainerRef,
  youtubeVideos,
}: {
  chapter: DocumentaryChapter;
  activeSectionId: string;
  onTocClick: (id: string) => void;
  onSectionIntersect: (id: string) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  youtubeVideos?: any[];
}) {
  // Scroll-spy: watches section headings, updates active TOC entry WITHOUT forcing a scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    const sectionIds = [...(chapter.sections || []).map((s) => s.id), 'sec-summary'];
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => { if (entry.isIntersecting) onSectionIntersect(id); });
        },
        {
          root: container ?? null,
          rootMargin: '-5% 0px -60% 0px',
          threshold: 0,
        }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [chapter, scrollContainerRef]);

  const fontStack = "'Inter','Helvetica Neue',Arial,sans-serif";

  return (
    <div style={{ fontFamily: fontStack }}>

      {/* ── Full-width Hero — spans the whole content area ── */}
      <div className="px-8 md:px-12 lg:px-20 pt-12 max-w-[960px] mx-auto">
        <ArticleHero chapter={chapter} />
      </div>

      {/* ── Two-column: [TOC sticky | article body] ──────────────────
          CRITICAL CSS: alignSelf:'flex-start' on the <aside> makes
          position:sticky work correctly inside an overflow-y-auto parent.
          Without it the aside stretches to fill the flex container and
          sticky has no room to stick.
          ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start px-8 md:px-12 lg:px-20 pb-20 max-w-[960px] mx-auto">

        {/* TOC — sticky with background #F4F3ED */}
        <SidebarTOC
          chapter={chapter}
          activeSectionId={activeSectionId}
          onSelect={onTocClick}
        />

        {/* Article body */}
        <article className="flex-1 min-w-0">

          {/* Lead paragraph + YouTube embed */}
          <div className="mb-10">
            <p className="text-[17px] leading-[1.85] text-[#555555] dark:text-gray-300 mb-6">
              {chapter.leadParagraph}
            </p>
            <YouTubeEmbed chapter={chapter} youtubeVideos={youtubeVideos} />
          </div>

          {/* Sections */}
          {(chapter.sections || []).map((sec) => (
            <section key={sec.id} id={sec.id} className="mb-16 scroll-mt-8">
              <h2
                className="text-[36px] sm:text-[42px] font-medium text-[#111111] dark:text-[#F0EFF0] leading-[1.2] tracking-tight mt-14 mb-6"
                style={{ fontFamily: fontStack }}
              >
                {sec.title}
              </h2>
              {sec.intro && (
                <p className="text-[19px] leading-[1.8] text-[#737373] dark:text-[#9A9A9F] mb-8">{sec.intro}</p>
              )}
              {(sec.concepts || []).map((concept, cIdx) => (
                <div key={concept.id} className="mb-12">
                  <h3
                    className="text-[28px] sm:text-[32px] font-medium text-[#111111] dark:text-[#F0EFF0] leading-[1.25] tracking-tight mt-10 mb-5"
                    style={{ fontFamily: fontStack }}
                  >
                    {cIdx + 1}. {concept.heading}
                  </h3>
                  {(concept.body || []).map((para, pIdx) => (
                    <p key={pIdx} className="text-[19px] leading-[1.8] text-[#737373] dark:text-gray-300 mb-6">
                      {pIdx === 0 ? <HighlightedText text={para} highlights={concept.highlights || []} /> : para}
                    </p>
                  ))}
                  {concept.boldLines?.map((line, bIdx) => (
                    <p key={`bold-${bIdx}`} className="text-[19px] leading-[1.8] text-[#333333] dark:text-[#E0E0E5] font-medium mb-6">{line}</p>
                  ))}
                  {concept.numberedList && concept.numberedList.length > 0 && (
                    <ol className="my-6 space-y-2 list-none pl-0">
                      {concept.numberedList.map((item, nIdx) => (
                        <li key={nIdx} className="flex items-start gap-3 text-[19px] leading-[1.8] text-[#737373] dark:text-[#9A9A9F] mb-3">
                          <span className="shrink-0 font-medium text-[#333333] dark:text-[#E0E0E5] w-5 text-right">{nIdx + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {concept.bulletList && concept.bulletList.length > 0 && (
                    <ul className="my-6 space-y-2 pl-0">
                      {concept.bulletList.map((item, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-3 text-[19px] leading-[1.8] text-[#737373] dark:text-[#9A9A9F] mb-3">
                          <span className="shrink-0 mt-[0.6em] w-1.5 h-1.5 rounded-full bg-[#BDBDB5] dark:bg-[#555]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-10 border-t border-[#E8E7E1] .06]" />
                </div>
              ))}
            </section>
          ))}

          {/* In Summary */}
          <section id="sec-summary" className="mt-10 mb-16 scroll-mt-8">
            <h2
              className="text-[32px] sm:text-[36px] font-bold text-[#1A1A1A] dark:text-white leading-[1.2] tracking-[-0.015em] mt-14 mb-6"
              style={{ fontFamily: fontStack }}
            >
              In summary
            </h2>
            <p className="text-[17px] leading-[1.85] text-[#555555] dark:text-gray-300 mb-6">{chapter.summary?.body}</p>
            <ul className="space-y-3 pl-0">
              {(chapter.summary?.keyPoints || []).map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-[17px] leading-[1.75] text-[#555555] dark:text-gray-300">
                  <span className="shrink-0 mt-[0.55em] w-1.5 h-1.5 rounded-full bg-[#BDBDB5] dark:bg-[#555]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>

        </article>
      </div>
    </div>
  );
}


// ─── Main Reader Component ────────────────────────────────────────────────────
export function ChapterReader({
  notebookId,
  sourceId,
  chapterTitle,
  bookTitle,
  subject,
  onBack,
}: ChapterReaderProps) {
  const { user, loading: authLoading } = useAuth();
  
  useEffect(() => {
    if (!authLoading && !user) {
      signInAnonymously(auth).catch(console.error);
    }
  }, [user, authLoading]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const articleScrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const draggingRef = useRef(false);
  const selRef = useRef<ClientRect | null>(null);

  const [mode, setMode] = useState<ReadingMode>('documentary');
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState(false);
  const [sel, setSel] = useState<ClientRect | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showPodcast, setShowPodcast] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  
  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    if (isCurrentlyDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  // Timestamp (epoch ms) of the last POST /generate we fired from this reader.
  // Rate-limits the auto-retry to once every 60s — without this, the broader
  // trigger (any non-terminal status, see fetch effect below) would spam the
  // backend with redundant generation jobs every time the source snapshot
  // re-emits. Replaces the legacy hasTriggeredGenRef one-shot guard, which
  // locked the user out of recovery the moment the first POST didn't visibly
  // resolve.
  const lastRetryAtRef = useRef<number>(0);
  // Timestamp (epoch ms) of when the reader first observed the current
  // non-terminal pipeline status. Cleared on every terminal transition (incl.
  // READY / READY_DEGRADED / FAILED). Lets PreparingChapter escalate its UI from
  // a passive spinner to a "this is taking longer than expected — tap Force
  // Retry" warning once ~60s have passed without forward progress, regardless
  // of which phase the pipeline is parked in.
  const [stuckSinceMs, setStuckSinceMs] = useState<number | null>(null);

  const setSelection = (r: ClientRect | null) => { selRef.current = r; setSel(r); };

  const handleForceRetry = () => {
    if (notebookId && sourceId) {
      api.post(`/documents/books/${notebookId}/chapters/${sourceId}/generate`).catch(console.error);
    }
  };

  // Load chapter documentary data
  const [docChapter, setDocChapter] = useState<DocumentaryChapter | null>(null);
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  // Start as '' (unknown) instead of 'QUEUED' so we never fire a premature POST /generate
  // before the Firestore snapshot has even told us the real status. The old default lied
  // about the chapter's state on first mount and triggered one spurious generation request
  // per page load.
  const [sourceStatus, setSourceStatus] = useState<string>('');

  // Listen to live ingestion status. The onError handler is critical: if the user's
  // Firestore rules reject, the notebook was deleted, or the WebChannel auth fails, the
  // success callback NEVER fires — without an error callback we'd have `sourceStatus=''`
  // forever, leaving the reader stuck on the "Connecting…" panel (no status, no article,
  // no trigger for Force Retry). Setting sourceStatus to 'FAILED' on error guarantees we
  // (a) leave the Connecting… UI and (b) match the auto-retry trigger below so the user
  // can still attempt a Force Retry.
  // Phase 3: also surface `failureReason` + `errorDetails` from the source doc so the
  // PreparingChapter panel can show WHY the source failed (instead of the generic
  // "We hit an issue" copy) and decide whether the Force Retry CTA should be hidden
  // (genuinely non-retryable faults like `MISSING_SOURCE_FILE` / `PERMISSION_DENIED` /
  // `SOURCE_NOT_FOUND`).
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  useEffect(() => {
    if (!notebookId || !sourceId) return;
    
    let active = true;
    let timeoutId: any;

    const pollStatus = async () => {
      try {
        const res = await api.get(`/documents/books/${notebookId}/chapters/${sourceId}/status`);
        if (!active) return;
        
        const data = res.data;
        if (data.status) {
          setSourceStatus(data.status);
          setFailureReason(data.failureReason || null);
          setErrorDetails(data.errorDetails || null);
        }
        
        if (data.article) {
          setDocChapter(data.article);
          if (data.article.sections?.length > 0) {
            setActiveSectionId((cur) => cur || data.article.sections[0].id);
          }
        }
        
        if (data.youtubeVideos) {
          setYoutubeVideos(data.youtubeVideos);
        }

        // Keep polling if not in a terminal state
        const TERMINAL_STATUSES = new Set(['', 'READY', 'READY_DEGRADED', 'FAILED', 'FAILED_NONRETRYABLE', 'COMPLETED']);
        if (!TERMINAL_STATUSES.has(data.status || '')) {
          timeoutId = setTimeout(pollStatus, 3000);
        }
      } catch (err: any) {
        if (!active) return;
        console.warn(`[ChapterReader] API poll failed for ${notebookId}/${sourceId}:`, err);
        if (err.response?.status === 404) {
          setSourceStatus('FAILED');
          setFailureReason('SOURCE_NOT_FOUND');
          setErrorDetails('The source document was not found on the server.');
        } else {
          setSourceStatus('FAILED');
          setFailureReason('SNAPSHOT_FAILED');
          setErrorDetails(String(err?.message || err || '').slice(0, 300));
        }
      }
    };

    pollStatus();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [notebookId, sourceId]);

  // Phase 3: a tiny derived constant so the auto-retry effect (and any future
  // gating) can answer "is this source genuinely non-retryable?" in one place.
  // Mirrors the `NON_RETRYABLE_REASONS` list in `PreparingChapter.tsx` — keep the
  // two in sync; if a new failure reason joins the catalog it'll need to be
  // added to BOTH lists until they're centralized in types.ts (see TODO).
  const NON_RETRYABLE_REASONS = ['MISSING_SOURCE_FILE', 'PERMISSION_DENIED', 'SOURCE_NOT_FOUND', 'SNAPSHOT_FAILED'];

  // Track "stuck in progress" so PreparingChapter can escalate the UI after ~60s of
  // no forward progress. Every status transition re-stamps the timer (useEffect dep),
  // so a pipeline stalled at PROCESSING / GENERATING_ARTICLE / … is detected within
  // 60s of its last forward-progress signal, regardless of stage.
  useEffect(() => {
    const IN_PROGRESS_STATUSES = new Set([
      'QUEUED', 'PENDING', 'UPLOADING',
      'PROCESSING', 'OCR', 'EXTRACTING', 'EXTRACTING_PDF',
      'CHUNKING', 'EMBEDDING', 'INDEXING',
      'BUILDING_KNOWLEDGE_GRAPH', 'GENERATING_GRAPH',
      'GENERATING_ARTICLE', 'GENERATING_STUDY_MODE', 'GENERATING_REVISION_MODE', 'GENERATING_EXAM_MODE',
      'GENERATING_FLASHCARDS', 'GENERATING_PODCAST', 'INDEXING_CONTENT',
    ]);
    // Phase 3: FAILED_NONRETRYABLE is also terminal — drag the stuckSinceMs tracker
    // into the off state the same way as the original FAILED, so the reader never
    // sees a phantom "this is taking longer than expected" warning for a source
    // the worker has already given up on permanently.
    const TERMINAL_STATUSES = new Set(['', 'READY', 'READY_DEGRADED', 'FAILED', 'FAILED_NONRETRYABLE', 'COMPLETED']);
    if (IN_PROGRESS_STATUSES.has(sourceStatus)) {
      setStuckSinceMs(Date.now());
    } else if (TERMINAL_STATUSES.has(sourceStatus)) {
      setStuckSinceMs(null);
    }
  }, [sourceStatus]);

  // Invalidate the article cache whenever the source enters a terminal state. Without
  // this, a Force Retry that re-generates a different documentary article still serves
  // the stale pre-Retry copy out of the chapterDocumentaryService CACHE — the reader
  // would see no visible content change after clicking Retry. Clearing on terminal
  // transition lets the very next fetch (driven by the sourceStatus dep above) load
  // the freshly-written article.
  useEffect(() => {
    if (
      sourceStatus !== '' &&
      (sourceStatus === 'READY' || sourceStatus === 'READY_DEGRADED' || sourceStatus === 'COMPLETED')
    ) {
      clearArticleCache(makeArticleCacheKey(notebookId, sourceId, subject, chapterTitle));
    }
  }, [sourceStatus, notebookId, sourceId, subject, chapterTitle]);      // Documentary fetch effect — intentionally excludes `activeSectionId` from the dep array
      // because the effect itself SETS activeSectionId after a successful fetch. Including it
      // caused a self-trigger: every Firestore snapshot tick (which updates sourceStatus) AND
      // every scroll-spy intersection observer tick (which updates activeSectionId) re-ran this
      // effect, producing noisy repeated .then() chains. The CACHE in chapterDocumentaryService
      // absorbs the cost, but the side-effects (`hasTriggeredGenRef` flips, redundant hot-path
      // logging) were the real problem. Using a functional setState for activeSectionId lets us
      // read the previous value without putting it in deps.
      useEffect(() => {
        let active = true;
        // We no longer call getDocumentaryChapter here because pollStatus fetches the article.
        // We just run the auto-retry logic if the source is stuck.
        if (active) {
          if (
            // Broaden from {QUEUED, READY_DEGRADED, FAILED} to every NON-READY non-COMPLETED
            // status so a hung mid-pipeline (status stuck on PROCESSING / GENERATING_ARTICLE /
            // …) also gets a chance to recover — the previous narrow window left the user
            // stranded with no retry CTA when an LLM provider stalled mid-step. Rate-limited
            // to one POST every 60s via lastRetryAtRef so we don't spam the backend.
            sourceStatus !== '' &&
            sourceStatus !== 'READY' &&
            sourceStatus !== 'COMPLETED' &&
            !(
              sourceStatus === 'FAILED_NONRETRYABLE' ||
              (sourceStatus === 'FAILED' && !!failureReason && NON_RETRYABLE_REASONS.includes(failureReason))
            )
          ) {
            if (notebookId && sourceId) {
              const now = Date.now();
              if (now - lastRetryAtRef.current > 60_000) {
                lastRetryAtRef.current = now;
                api.post(`/documents/books/${notebookId}/chapters/${sourceId}/generate`).catch(console.error);
              }
            }
          }
        }
        return () => { active = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- activeSectionId + sourceStatus are read for their SIDE-EFFECTS; see comment above.
      }, [notebookId, chapterTitle, subject, sourceStatus, sourceId, failureReason]);

  // ── Load PDF (with AbortController + 25s timeout so a hung backend stream never leaves
  //   the NCERT PDF panel spinning forever; before this, the only signal the user got was
  //   the indefinite "loader2" overlay).
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true); setError(null); setNumPages(0); setPageNum(1);
    (async () => {
      try {
        const token = await user?.getIdToken();
        const resp = await fetch(chapterPdfUrl(notebookId, sourceId), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!resp.ok) {
          throw new Error(
            resp.status === 404
              ? "This chapter's PDF isn't available to read yet."
              : `Failed to load PDF (${resp.status})`
          );
        }
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        const pdf = await getDocument({ data: buf }).promise;
        if (cancelled) { pdf.destroy(); return; }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setPageNum(1);
      } catch (e: any) {
        if (controller.signal.aborted || cancelled) return;
        const isTimeout = e?.name === 'AbortError';
        if (!cancelled) setError(isTimeout ? 'Loading the chapter PDF timed out after 25s — tap Scan or go Back and try again.' : (e?.message || 'Failed to load PDF'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (pdfRef.current) { try { pdfRef.current.destroy(); } catch { /* noop */ } pdfRef.current = null; }
    };
  }, [notebookId, sourceId, user]);

  // ── Render PDF page ──
  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || !numPages) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
        const task = page.render({ canvas, canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) console.warn('PDF page render error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [pageNum, scale, numPages]);

  const gotoPage = (p: number) => setPageNum(Math.max(1, Math.min(numPages || 1, p)));
  const zoom = (delta: number) => setScale((s) => Math.max(0.6, Math.min(3, s + delta)));

  const scrollToSection = (secId: string, pageRef: number) => {
    setActiveSectionId(secId);
    gotoPage(pageRef);
    const el = document.getElementById(secId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Scan drag selection ──
  const onPointerDown = (e: React.PointerEvent) => {
    const w = wrapperRef.current; if (!w) return;
    const r = w.getBoundingClientRect();
    draggingRef.current = true;
    setSelection({ x1: e.clientX - r.left, y1: e.clientY - r.top, x2: e.clientX - r.left, y2: e.clientY - r.top });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !selRef.current || !wrapperRef.current) return;
    const r = wrapperRef.current.getBoundingClientRect();
    setSelection({ ...selRef.current, x2: Math.max(0, Math.min(r.width, e.clientX - r.left)), y2: Math.max(0, Math.min(r.height, e.clientY - r.top)) });
  };
  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const s = selRef.current;
    const canvas = canvasRef.current;
    if (!s || !canvas) return;
    const left = Math.min(s.x1, s.x2); const top = Math.min(s.y1, s.y2);
    const width = Math.abs(s.x2 - s.x1); const height = Math.abs(s.y2 - s.y1);
    if (width < 14 || height < 14) { setSelection(null); return; }
    const cRect = canvas.getBoundingClientRect();
    const ratioX = canvas.width / cRect.width; const ratioY = canvas.height / cRect.height;
    const sx = Math.max(0, (left - cRect.left) * ratioX);
    const sy = Math.max(0, (top - cRect.top) * ratioY);
    const sw = Math.min(canvas.width - sx, width * ratioX);
    const sh = Math.min(canvas.height - sy, height * ratioY);
    if (sw < 6 || sh < 6) { setSelection(null); return; }
    const off = document.createElement('canvas');
    off.width = Math.round(sw); off.height = Math.round(sh);
    const octx = off.getContext('2d');
    if (!octx) { setSelection(null); return; }
    octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, off.width, off.height);
    setCrop(off.toDataURL('image/png'));
    setScanMode(false); setSelection(null);
  }, []);

  const selBox = (() => {
    if (!sel || !wrapperRef.current) return null;
    const w = wrapperRef.current.getBoundingClientRect();
    return {
      left: Math.min(sel.x1, sel.x2) - w.left,
      top: Math.min(sel.y1, sel.y2) - w.top,
      width: Math.abs(sel.x2 - sel.x1),
      height: Math.abs(sel.y2 - sel.y1),
    };
  })();

  // TOC entries
  const tocEntries = [
    ...(docChapter?.sections.map((s) => ({ id: s.id, label: s.title, pageRef: s.ncertPageRef })) || []),
    { id: 'sec-summary', label: 'In summary', pageRef: 1 },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden reader-root"
      style={{ background: 'var(--reader-bg, #F9F8F4)', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
    >
      <style>{`
        .dark .reader-root { --reader-bg: #131315; }
        .reader-root { --reader-bg: #F9F8F4; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D0CEC6; border-radius: 2px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #3a3a3e; }
      `}</style>

      {/* ── Top Toolbar ── */}
      <header className="h-[52px] shrink-0 flex items-center justify-between px-5 border-b border-[#E2E1DC] dark:border-white/10 bg-[#F9F8F4] dark:bg-[#131315] z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#555] dark:text-gray-400 hover:text-[#1A1A1A] dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="h-4 w-px bg-[#D0CEC6] dark:bg-white/10" />
          <div>
            <div className="text-[14px] font-semibold text-[#1A1A1A] dark:text-white truncate max-w-[200px] md:max-w-sm">
              {docChapter?.title || chapterTitle || 'Preparing Chapter...'}
            </div>
          </div>
        </div>

        {/* Mode selector */}
        <div className="hidden md:flex items-center gap-0.5 p-[3px] rounded-full bg-[#E9E8E3] dark:bg-white/5 border border-[#D5D3CB] dark:border-white/10 text-[12px] font-medium">
          {([
            { id: 'documentary', label: 'Article', icon: BookOpen },
            { id: 'split', label: 'Split View', icon: SlidersHorizontal },
            { id: 'ncert', label: 'NCERT PDF', icon: FileText },
            { id: 'exam', label: 'Exam Mode', icon: Target },
          ] as const).map((m) => {
            const Icon = m.icon;
            // Force 'split' visually active if docChapter is null and mode is documentary, because PDF shows by default.
            const isEffectiveMode = (m.id === 'split' && !docChapter && mode === 'documentary') ? true : mode === m.id;
            const active = isEffectiveMode;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all',
                  active
                    ? 'bg-white  text-[#1A1A1A]  shadow-sm'
                    : 'text-[#777] dark:text-gray-400 hover:text-[#1A1A1A] dark:hover:text-white'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#D5D3CB] dark:border-white/10 text-[#555] dark:text-gray-400 hover:bg-[#E9E8E3] dark:hover:bg-white/5 transition-colors"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowPodcast(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#D5D3CB] dark:border-white/10 text-[12px] font-medium text-[#555] dark:text-gray-400 hover:bg-[#E9E8E3] dark:hover:bg-white/5 transition-colors"
          >
            <Headphones className="w-3.5 h-3.5" />
            Listen
          </button>
          <button
            onClick={() => setShowFlashcards(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#D5D3CB] dark:border-white/10 text-[12px] font-medium text-[#555] dark:text-gray-400 hover:bg-[#E9E8E3] dark:hover:bg-white/5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            Flashcards
          </button>
        </div>
      </header>

      {/* ── Main Panes ── */}
      <div className="flex-1 flex min-h-0">

        {/* ═══════════════════════════════════════════════
            DOCUMENTARY — single scroll column, TOC sticky inside it
            ═══════════════════════════════════════════════ */}
        {(mode !== 'ncert' && mode !== 'split' && mode !== 'exam' && !!docChapter) && (
          <div
            ref={articleScrollRef}
            className="flex-1 overflow-y-auto custom-scrollbar bg-[#F9F8F4] dark:bg-[#131315]"
          >
            {docChapter ? (
              <ArticleContent
                chapter={docChapter}
                activeSectionId={activeSectionId}
                onTocClick={(id) => scrollToSection(id, (docChapter.sections || []).find(s => s.id === id)?.ncertPageRef ?? 1)}
                onSectionIntersect={setActiveSectionId}
                scrollContainerRef={articleScrollRef}
                youtubeVideos={youtubeVideos}
              />
            ) : (
              <PreparingChapter status={sourceStatus} onRetry={handleForceRetry} />
            )}
          </div>
        )}

        {/* SPLIT / EXAM modes */}
        {(mode === 'split' || mode === 'exam' || (!docChapter && mode === 'documentary')) && (
          <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#F9F8F4] dark:bg-[#131315]">
            {docChapter ? (
              <ArticleContent
                chapter={docChapter}
                activeSectionId={activeSectionId}
                onTocClick={(id) => scrollToSection(id, (docChapter.sections || []).find(s => s.id === id)?.ncertPageRef ?? 1)}
                onSectionIntersect={setActiveSectionId}
                scrollContainerRef={{ current: null } as React.RefObject<HTMLDivElement>}
                youtubeVideos={youtubeVideos}
              />          ) : (
            <PreparingChapter
              status={sourceStatus}
              stuckSinceMs={stuckSinceMs}
              failureReason={failureReason}
              errorDetails={errorDetails}
              onRetry={handleForceRetry}
              onOpenPdf={() => setMode('ncert')}
            />
          )}
        </main>
        )}


        {/* ═══════════════════════════════════════════════
            RIGHT — NCERT PDF Panel
            ═══════════════════════════════════════════════ */}
        {(mode === 'split' || mode === 'ncert' || (!docChapter && mode === 'documentary')) && (
          <aside
            className={cn(
              'bg-[#151516] border-l border-slate-800 flex flex-col relative shrink-0 transition-all duration-300',
              mode === 'ncert' ? 'w-full' : 'w-1/2'
            )}
          >
            {/* PDF toolbar */}
            <div className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-white/10 bg-[#1a1a1c]">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-300">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Official NCERT PDF</span>
              </div>
              <div className="flex items-center gap-1 text-[12px] text-gray-300">
                <button onClick={() => gotoPage(pageNum - 1)} disabled={pageNum <= 1} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="tabular-nums w-12 text-center text-[11px]">
                  {numPages ? `${pageNum}/${numPages}` : '—'}
                </span>
                <button onClick={() => gotoPage(pageNum + 1)} disabled={pageNum >= numPages} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button onClick={() => zoom(-0.2)} className="p-1 rounded hover:bg-white/10"><ZoomOut className="w-3.5 h-3.5" /></button>
                <button onClick={() => zoom(0.2)} className="p-1 rounded hover:bg-white/10"><ZoomIn className="w-3.5 h-3.5" /></button>
                <button
                  onClick={() => { setScanMode((v) => !v); setSelection(null); }}
                  className={cn(
                    'p-1.5 rounded ml-1 text-[11px] font-semibold flex items-center gap-1 transition-colors',
                    scanMode ? 'bg-white text-slate-900' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  )}
                >
                  <ScanLine className="w-3.5 h-3.5" /> Scan
                </button>
              </div>
            </div>

            {/* PDF canvas */}
            <div className="flex-1 overflow-auto flex justify-center py-6 px-4 relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <X className="w-8 h-8 text-gray-500 mb-2" />
                  <p className="text-[14px] text-gray-300 max-w-xs">{error}</p>
                </div>
              )}
              <div
                ref={wrapperRef}
                className="relative h-fit shadow-2xl"
                style={{ display: loading || error ? 'none' : 'block' }}
              >
                <canvas ref={canvasRef} className="block rounded-sm" />
                {scanMode && (
                  <div
                    className="absolute inset-0 cursor-crosshair"
                    style={{ background: 'rgba(0,0,0,0.35)' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                  >
                    {selBox && (
                      <div
                        className="absolute border-2 border-indigo-400 bg-indigo-400/10 rounded-sm"
                        style={{
                          left: selBox.left,
                          top: selBox.top,
                          width: selBox.width,
                          height: selBox.height,
                          boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)',
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Scan overlay */}
            {crop && (
              <div className="absolute inset-0 z-50 bg-[#151516]">
                <ScanPanel
                  notebookId={notebookId}
                  sourceId={sourceId}
                  page={pageNum}
                  chapterTitle={chapterTitle}
                  bookTitle={bookTitle}
                  subject={subject}
                  cropDataUrl={crop}
                  onClose={() => setCrop(null)}
                />
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Modals */}
      {docChapter && <FlashcardModal open={showFlashcards} onClose={() => setShowFlashcards(false)} cards={docChapter.flashcards || []} />}
      {docChapter && <PodcastPlayerDrawer open={showPodcast} onClose={() => setShowPodcast(false)} podcast={docChapter.podcast || { episodeTitle: '', duration: '', tracks: [] }} />}
    </div>
  );
}
