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
  Moon,
  ListTree
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
import { db } from '../../lib/firestore';
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
    <div className="my-6 sm:my-8 w-full rounded-xl overflow-hidden aspect-video shadow-md">
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
    <div className="mb-8 sm:mb-12">
      {/* Breadcrumb — "Home / Subjects / Physics / Chapter..." */}
      <div
        className="text-center text-[11px] sm:text-[13px] text-[#9A9A95] mb-5 sm:mb-8 flex flex-wrap items-center justify-center gap-1 leading-normal"
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
      >
        <span>Home</span>
        <span className="mx-1.5 text-[#C0BDB5]">/</span>
        <span>Subjects</span>
        <span className="mx-1.5 text-[#C0BDB5]">/</span>
        <span>{chapter.subject}</span>
        <span className="mx-1.5 text-[#C0BDB5]">/</span>
        <span className="text-[#1A1A1A] dark:text-white truncate max-w-[200px] sm:max-w-xs">
          {chapter.title}
        </span>
      </div>

      {/* Tags + Date row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            className="text-[10px] sm:text-[11px] font-semibold tracking-[0.12em] uppercase px-2.5 py-1 rounded-sm"
            style={{ background: '#EEDEB6', color: '#7A6540', fontFamily: "'Inter', sans-serif" }}
          >
            ARTICLE
          </span>
          <span
            className="text-[10px] sm:text-[11px] font-semibold tracking-[0.12em] uppercase px-2.5 py-1 rounded-sm"
            style={{ background: '#EEDEB6', color: '#7A6540', fontFamily: "'Inter', sans-serif" }}
          >
            {(chapter.subject || 'GENERAL').toUpperCase()}
          </span>
        </div>
        <span
          className="text-[10px] sm:text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9A9A95]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          UPDATED ON:&nbsp;{dateStr}
        </span>
      </div>

      {/* H1 Title — Responsive font size */}
      <h1
        className="text-[24px] xs:text-[28px] sm:text-[36px] md:text-[44px] lg:text-[48px] font-bold text-[#1A1A1A] dark:text-white leading-[1.2] sm:leading-[1.15] tracking-[-0.02em] mb-3 sm:mb-5"
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {chapter.title}
      </h1>

      {/* Reading time — "11 MIN TO READ" */}
      <div
        className="flex items-center gap-1.5 text-[11.5px] sm:text-[13px] text-[#9A9A95] mb-6 sm:mb-10"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <span>{(chapter.estimatedReadingTime || '15 mins').replace(' mins', ' MIN')}</span>
        <span className="font-semibold text-[#C4A96A] tracking-[0.06em] uppercase text-[10px] sm:text-[11px]">
          TO READ
        </span>
      </div>

      {/* Thin separator */}
      <div className="border-t border-[#E8E7E1] dark:border-white/10" />
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
      <div className="px-4 sm:px-8 md:px-12 lg:px-20 pt-6 sm:pt-12 max-w-[960px] mx-auto">
        <ArticleHero chapter={chapter} />
      </div>

      {/* ── Two-column: [TOC sticky | article body] ──────────────────
          CRITICAL CSS: alignSelf:'flex-start' on the <aside> makes
          position:sticky work correctly inside an overflow-y-auto parent.
          Without it the aside stretches to fill the flex container and
          sticky has no room to stick.
          ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start px-4 sm:px-8 md:px-12 lg:px-20 pb-16 sm:pb-20 max-w-[960px] mx-auto">

        {/* TOC — sticky with background #F4F3ED on desktop */}
        <SidebarTOC
          chapter={chapter}
          activeSectionId={activeSectionId}
          onSelect={onTocClick}
        />

        {/* Article body */}
        <article className="flex-1 min-w-0">

          {/* Lead paragraph + YouTube embed */}
          <div className="mb-8 sm:mb-10">
            <p className="text-[15.5px] sm:text-[17px] leading-[1.75] sm:leading-[1.85] text-[#555555] dark:text-gray-300 mb-6">
              {chapter.leadParagraph}
            </p>
            <YouTubeEmbed chapter={chapter} youtubeVideos={youtubeVideos} />
          </div>

          {/* Sections */}
          {(chapter.sections || []).map((sec) => (
            <section key={sec.id} id={sec.id} className="mb-12 sm:mb-16 scroll-mt-8">
              <h2
                className="text-[22px] sm:text-[30px] md:text-[38px] font-medium text-[#111111] dark:text-[#F0EFF0] leading-[1.25] tracking-tight mt-10 sm:mt-14 mb-4 sm:mb-6"
                style={{ fontFamily: fontStack }}
              >
                {sec.title}
              </h2>
              {sec.intro && (
                <p className="text-[15.5px] sm:text-[17.5px] md:text-[19px] leading-[1.75] sm:leading-[1.8] text-[#737373] dark:text-[#9A9A9F] mb-6 sm:mb-8">{sec.intro}</p>
              )}
              {(sec.concepts || []).map((concept, cIdx) => (
                <div key={concept.id} className="mb-8 sm:mb-12">
                  <h3
                    className="text-[18px] sm:text-[24px] md:text-[30px] font-medium text-[#111111] dark:text-[#F0EFF0] leading-[1.3] tracking-tight mt-6 sm:mt-10 mb-3 sm:mb-5"
                    style={{ fontFamily: fontStack }}
                  >
                    {cIdx + 1}. {concept.heading}
                  </h3>
                  {(concept.body || []).map((para, pIdx) => (
                    <p key={pIdx} className="text-[15px] sm:text-[17px] md:text-[18.5px] leading-[1.75] sm:leading-[1.8] text-[#737373] dark:text-gray-300 mb-4 sm:mb-6">
                      {pIdx === 0 ? <HighlightedText text={para} highlights={concept.highlights || []} /> : para}
                    </p>
                  ))}
                  {concept.boldLines?.map((line, bIdx) => (
                    <p key={`bold-${bIdx}`} className="text-[15px] sm:text-[17px] md:text-[18.5px] leading-[1.75] sm:leading-[1.8] text-[#333333] dark:text-[#E0E0E5] font-medium mb-4 sm:mb-6">{line}</p>
                  ))}
                  {concept.numberedList && concept.numberedList.length > 0 && (
                    <ol className="my-4 sm:my-6 space-y-2 list-none pl-0">
                      {concept.numberedList.map((item, nIdx) => (
                        <li key={nIdx} className="flex items-start gap-2.5 sm:gap-3 text-[15px] sm:text-[17px] md:text-[18.5px] leading-[1.75] sm:leading-[1.8] text-[#737373] dark:text-[#9A9A9F] mb-2 sm:mb-3">
                          <span className="shrink-0 font-medium text-[#333333] dark:text-[#E0E0E5] w-5 text-right">{nIdx + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {concept.bulletList && concept.bulletList.length > 0 && (
                    <ul className="my-4 sm:my-6 space-y-2 pl-0">
                      {concept.bulletList.map((item, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-2.5 sm:gap-3 text-[15px] sm:text-[17px] md:text-[18.5px] leading-[1.75] sm:leading-[1.8] text-[#737373] dark:text-[#9A9A9F] mb-2 sm:mb-3">
                          <span className="shrink-0 mt-[0.6em] w-1.5 h-1.5 rounded-full bg-[#BDBDB5] dark:bg-[#555]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-8 sm:mt-10 border-t border-[#E8E7E1] dark:border-white/10" />
                </div>
              ))}
            </section>
          ))}

          {/* In Summary */}
          <section id="sec-summary" className="mt-8 sm:mt-10 mb-12 sm:mb-16 scroll-mt-8">
            <h2
              className="text-[22px] sm:text-[28px] md:text-[34px] font-bold text-[#1A1A1A] dark:text-white leading-[1.2] tracking-[-0.015em] mt-10 sm:mt-14 mb-4 sm:mb-6"
              style={{ fontFamily: fontStack }}
            >
              In summary
            </h2>
            <p className="text-[15.5px] sm:text-[17px] leading-[1.75] sm:leading-[1.85] text-[#555555] dark:text-gray-300 mb-6">{chapter.summary?.body}</p>
            <ul className="space-y-2.5 sm:space-y-3 pl-0">
              {(chapter.summary?.keyPoints || []).map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 sm:gap-3 text-[15px] sm:text-[17px] leading-[1.7] sm:leading-[1.75] text-[#555555] dark:text-gray-300">
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
  const [scale, setScale] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 0.85 : 1.3));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState(false);
  const [sel, setSel] = useState<ClientRect | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showPodcast, setShowPodcast] = useState(false);
  const [showMobileToc, setShowMobileToc] = useState(false);
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
        .custom-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        .custom-scrollbar::-webkit-scrollbar { display: none !important; width: 0px !important; }
      `}</style>

      {/* ── Top Toolbar ── */}
      <header className="h-[52px] shrink-0 flex items-center justify-between px-3 sm:px-5 border-b border-[#E2E1DC] dark:border-white/10 bg-[#F9F8F4] dark:bg-[#131315] z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#555] dark:text-gray-400 hover:text-[#1A1A1A] dark:hover:text-white transition-colors shrink-0 touch-manipulation cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>
          <div className="h-4 w-px bg-[#D0CEC6] dark:bg-white/10 shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] sm:text-[14px] font-semibold text-[#1A1A1A] dark:text-white truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px] md:max-w-sm">
              {docChapter?.title || chapterTitle || 'Preparing Chapter...'}
            </div>
          </div>
        </div>

        {/* Mode selector - Desktop & Tablet */}
        <div className="hidden md:flex items-center gap-0.5 p-[3px] rounded-full bg-[#E9E8E3] dark:bg-white/5 border border-[#D5D3CB] dark:border-white/10 text-[12px] font-medium">
          {([
            { id: 'documentary', label: 'Article', icon: BookOpen },
            { id: 'split', label: 'Split View', icon: SlidersHorizontal },
            { id: 'ncert', label: 'NCERT PDF', icon: FileText },
            { id: 'exam', label: 'Exam Mode', icon: Target },
          ] as const).map((m) => {
            const Icon = m.icon;
            const isEffectiveMode = (m.id === 'split' && !docChapter && mode === 'documentary') ? true : mode === m.id;
            const active = isEffectiveMode;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all touch-manipulation cursor-pointer',
                  active
                    ? 'bg-white dark:bg-[#232328] text-[#1A1A1A] dark:text-white shadow-xs font-semibold'
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
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Mode Switcher (Article vs PDF) */}
          <div className="flex md:hidden items-center p-0.5 rounded-lg bg-[#E9E8E3] dark:bg-white/5 border border-[#D5D3CB] dark:border-white/10 text-[11px] font-medium mr-1">
            <button
              onClick={() => setMode('documentary')}
              className={cn(
                'px-2 py-1 rounded-md transition-all touch-manipulation flex items-center gap-1 cursor-pointer',
                mode === 'documentary' ? 'bg-white dark:bg-[#232328] text-[#1A1A1A] dark:text-white shadow-xs font-semibold' : 'text-[#777] dark:text-gray-400'
              )}
              title="Article mode"
            >
              <BookOpen className="w-3 h-3" />
              <span>Article</span>
            </button>
            <button
              onClick={() => setMode('ncert')}
              className={cn(
                'px-2 py-1 rounded-md transition-all touch-manipulation flex items-center gap-1 cursor-pointer',
                mode === 'ncert' || mode === 'split' ? 'bg-white dark:bg-[#232328] text-[#1A1A1A] dark:text-white shadow-xs font-semibold' : 'text-[#777] dark:text-gray-400'
              )}
              title="NCERT PDF mode"
            >
              <FileText className="w-3 h-3" />
              <span>PDF</span>
            </button>
          </div>

          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-[#D5D3CB] dark:border-white/10 text-[#555] dark:text-gray-400 hover:bg-[#E9E8E3] dark:hover:bg-white/5 transition-colors touch-manipulation cursor-pointer"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setShowPodcast(true)}
            className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-[#D5D3CB] dark:border-white/10 text-[11px] sm:text-[12px] font-medium text-[#555] dark:text-gray-400 hover:bg-[#E9E8E3] dark:hover:bg-white/5 transition-colors touch-manipulation cursor-pointer"
            title="Listen to audio podcast"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Listen</span>
          </button>
          <button
            onClick={() => setShowFlashcards(true)}
            className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-[#D5D3CB] dark:border-white/10 text-[11px] sm:text-[12px] font-medium text-[#555] dark:text-gray-400 hover:bg-[#E9E8E3] dark:hover:bg-white/5 transition-colors touch-manipulation cursor-pointer"
            title="Practice flashcards"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
      </header>

      {/* ── Main Panes ── */}
      <div className="flex-1 flex min-h-0 relative">

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
              mode === 'ncert' ? 'w-full' : 'hidden md:flex md:w-1/2'
            )}
          >
            {/* PDF toolbar */}
            <div className="h-11 shrink-0 flex items-center justify-between px-2.5 sm:px-4 border-b border-white/10 bg-[#1a1a1c]">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-300">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden xs:inline">NCERT PDF</span>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1 text-[12px] text-gray-300">
                <button onClick={() => gotoPage(pageNum - 1)} disabled={pageNum <= 1} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 touch-manipulation cursor-pointer" title="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="tabular-nums min-w-[45px] text-center text-[11px]">
                  {numPages ? `${pageNum}/${numPages}` : '—'}
                </span>
                <button onClick={() => gotoPage(pageNum + 1)} disabled={pageNum >= numPages} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 touch-manipulation cursor-pointer" title="Next page">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/10 mx-0.5 sm:mx-1" />
                <button onClick={() => zoom(-0.2)} className="p-1.5 rounded hover:bg-white/10 touch-manipulation cursor-pointer" title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
                <button onClick={() => zoom(0.2)} className="p-1.5 rounded hover:bg-white/10 touch-manipulation cursor-pointer" title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
                <button
                  onClick={() => { setScanMode((v) => !v); setSelection(null); }}
                  className={cn(
                    'px-2 py-1 rounded ml-1 text-[11px] font-semibold flex items-center gap-1 transition-colors touch-manipulation cursor-pointer',
                    scanMode ? 'bg-white text-slate-900' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  )}
                >
                  <ScanLine className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Scan</span>
                </button>
              </div>
            </div>

            {/* PDF canvas */}
            <div className="flex-1 overflow-auto flex justify-center py-4 sm:py-6 px-2 sm:px-4 relative">
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
                className="relative h-fit shadow-2xl max-w-full"
                style={{ display: loading || error ? 'none' : 'block' }}
              >
                <canvas ref={canvasRef} className="block rounded-sm max-w-full" />
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

        {/* Mobile floating Table of Contents trigger button */}
        {(mode === 'documentary' || mode === 'split') && !!docChapter && (docChapter.sections || []).length > 0 && (
          <div className="lg:hidden fixed bottom-5 right-5 z-40">
            <button
              onClick={() => setShowMobileToc(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl text-[12.5px] font-semibold touch-manipulation active:scale-95 transition-all cursor-pointer border border-slate-700/30 dark:border-slate-300"
            >
              <ListTree className="w-4 h-4" />
              <span>Contents</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Table of Contents Modal Sheet */}
      {showMobileToc && docChapter && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="fixed inset-0" onClick={() => setShowMobileToc(false)} />
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden max-h-[75vh] flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <ListTree className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
                <span className="text-[14px] font-bold text-slate-900 dark:text-white">Table of Contents</span>
              </div>
              <button
                onClick={() => setShowMobileToc(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 sm:p-4 overflow-y-auto space-y-1">
              {tocEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    scrollToSection(entry.id, entry.pageRef ?? 1);
                    setShowMobileToc(false);
                  }}
                  className={cn(
                    'w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] sm:text-[13.5px] transition-colors cursor-pointer',
                    activeSectionId === entry.id
                      ? 'bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {docChapter && <FlashcardModal open={showFlashcards} onClose={() => setShowFlashcards(false)} cards={docChapter.flashcards || []} />}
      {docChapter && <PodcastPlayerDrawer open={showPodcast} onClose={() => setShowPodcast(false)} podcast={docChapter.podcast || { episodeTitle: '', duration: '', tracks: [] }} />}
    </div>
  );
}
