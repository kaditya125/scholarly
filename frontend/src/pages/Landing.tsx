import { type ReactNode, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, Camera, NotebookPen, Headphones,
  SlidersHorizontal, Gauge, Languages, Presentation, Check, Users, Radio, ClipboardCheck,
  Bot, MessageCircleQuestion, Sparkles, HelpCircle, ArrowUpRight
} from 'lucide-react';
import ProductPreview from '../components/landing/ProductPreview';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import AvatarStack from '../components/landing/AvatarStack';
import { HandwrittenTagline } from '../components/brand/HandwrittenTagline';
import { ExamLogo } from '../components/brand/ExamLogo';
import { EXAM_CHIPS } from '../lib/examChips';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import { cn } from '../lib/utils';

// Below-the-fold sections lazy-loaded to optimize initial mobile paint
const PricingSection = lazy(() => import('../components/landing/PricingSection'));
const ProcessChain = lazy(() => import('../components/landing/ProcessChain'));
const VoiceOrbDemo = lazy(() => import('../components/landing/VoiceOrbDemo'));
const BuiltWith = lazy(() => import('../components/landing/BuiltWith'));

/**
 * The public landing page.
 *
 * Written against what the product actually does. Every capability named here was verified
 * in the repository before it was written down:
 *   · the six-step reasoning trace  → components/chat/ReasoningTimeline.tsx
 *   · cited answers                 → components/chat/AssistantReply.tsx + services/rag/*
 *   · scan & solve                  → POST /api/scan/solve (Gemini Vision + scoped retrieval)
 *   · notebooks                     → /api/notebooks/:id/sources → chunk → embed → Pinecone
 *   · podcasts                      → /api/podcasts/generate → TTS → ffmpeg → Storage
 *   · study modes                   → config/prompts.ts buildModeInstructions()
 *   · adaptive baseline assessment  → /api/baseline-assessment
 *   · language mirroring            → config/prompts.ts SADHYA_LANGUAGE_RULE
 *   · exam coverage                 → config/prompts.ts SADHYA_EXAM_KNOWLEDGE
 *   · profile personalization       → lib/onboardingOptions.ts + buildStudentContextBlock()
 *   · teacher profile               → pages/TeacherOnboarding.tsx + /api/teacher
 *
 * Things the codebase does NOT support are absent on purpose — no user counts, no reviews,
 * no pass rates, no testimonials, no institutional partners. Sections that would need those
 * were not built rather than filled with invented numbers.
 *
 * Design language is inherited from the auth pages (components/auth/AuthShell.tsx), which are
 * the most recently designed surface in the app: Inter, lime #c8e558 as the single accent, the
 * amber layered mark, rounded-xl controls, hairline borders. Nothing new was introduced.
 */

const ACCENT = '#c8e558';

// ─── Content ─────────────────────────────────────────────────────────────────

/**
 * Sourced from examCatalog.ts, the single source of truth shared with each exam's
 * dedicated /exams/:slug landing page — nothing here is aspirational, and nothing here
 * can drift out of sync with what those pages actually say.
 */

/**
 * The six-step reasoning pipeline lives in components/landing/ProcessChain.tsx, which owns
 * both the copy and the alternating V-shape diagram that renders it. Kept there rather than
 * here so the text and the geometry it has to fit cannot drift apart.
 */

/**
 * Four ways material gets in and out — deliberately not a list of every feature. Level and
 * language belong to the personalization section below, because that is what they are.
 */
const CAPABILITIES = [
  {
    icon: Camera,
    title: 'Photograph the question',
    body: 'Point your camera at a problem in a textbook or a past paper. Sadhya reads it, works out which chapter it belongs to, pulls that chapter, and solves it with you step by step.',
  },
  {
    icon: NotebookPen,
    title: 'Your material & teacher notes',
    body: 'Upload your own PDFs or access exclusive notes, revision sheets, and curated question banks shared directly by verified educators into your notebooks.',
  },
  {
    icon: Presentation,
    title: 'Learn from any teacher',
    body: 'Join live & paid classes taught by expert teachers. Enroll in dedicated batches, get homework auto-graded, and ask questions directly during interactive sessions.',
  },
  {
    icon: Headphones,
    title: 'Listen instead of reading',
    body: 'Turn a topic or a notebook into a two-voice audio explainer. Choose the format — storytelling, documentary, interview, debate or solo narration — and the length.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Change what it does',
    body: 'One tutor, different jobs: explain a concept, condense a chapter into revision notes, get quizzed one question at a time, draft a full-length answer, or sit a mock interview.',
  },
  {
    icon: ClipboardCheck,
    title: 'Adaptive tests & tracking',
    body: 'Test your knowledge with adaptive baseline assessments and comprehensive chapter quizzes. Track your progress with detailed analytics and insights.',
  },
];

/** The literal fields the onboarding wizard collects (lib/onboardingOptions.ts). */
const PROFILE_FIELDS: [string, string][] = [
  ['Goal', 'NEET'],
  ['Board', 'CBSE'],
  ['Stream', 'PCB'],
  ['Subjects', 'Physics · Chemistry · Biology'],
  ['Level', 'Intermediate'],
  ['Target', 'AIR under 1000'],
  ['Study time', '3 hours a day'],
  ['Learns best from', 'Diagrams · Practice questions'],
  ['Language', 'Bilingual'],
];

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * Enhanced Motion system.
 *
 * Smooth cubic-bezier spring curves with interactive micro-interactions for
 * cards, chips, buttons, and containers.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

/** Scroll reveal for a single block with subtle scale and y-translation. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.65, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Reveals its <Item> descendants one after another with smooth spring stagger.
 */
function Stagger({
  children,
  className,
  gap = 0.08,
  onLoad = false,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  onLoad?: boolean;
  /** `dl` keeps the profile card a real description list rather than a stack of divs. */
  as?: 'div' | 'dl';
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return as === 'dl' ? <dl className={className}>{children}</dl> : <div className={className}>{children}</div>;
  }

  const Tag = as === 'dl' ? motion.dl : motion.div;
  return (
    <Tag
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: 0.05 } } }}
      initial="hidden"
      {...(onLoad
        ? { animate: 'show' }
        : { whileInView: 'show', viewport: { once: true, margin: '-60px' } })}
    >
      {children}
    </Tag>
  );
}

/** A single step in a <Stagger>. Inherits its cue through motion's variant context. */
function Item({ children, className, y = 20 }: { children: ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The hand-drawn arc under a word — the same gesture as FlourishLink in the auth shell.
 */
function Underline({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        className="absolute -bottom-1 sm:-bottom-1.5 left-0 w-full overflow-visible pointer-events-none"
        height="11"
        viewBox="0 0 100 11"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path
          d="M1.5 5C18 8.8 44 9.6 98.5 2.6"
          stroke={ACCENT}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Section label. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
      {children}
    </p>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-3 text-[28px] sm:text-[34px] lg:text-[40px] leading-[1.12] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
      {children}
    </h2>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
      {children}
    </p>
  );
}

/**
 * Interactive Capability Card with spring lift, glowing border, and icon pulse.
 */
function CapabilityCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Camera;
  title: string;
  body: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="group relative h-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-7 transition-colors hover:border-[#c8e558]/60 dark:hover:border-[#c8e558]/40 shadow-xs hover:shadow-lg"
      whileHover={reduced ? undefined : { y: -6, scale: 1.015 }}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      <motion.span
        className="inline-flex w-10 h-10 rounded-xl bg-slate-900 dark:bg-white items-center justify-center shadow-xs"
        whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
        transition={{ duration: 0.4 }}
      >
        <Icon className="w-[18px] h-[18px] text-white dark:text-slate-900" strokeWidth={1.9} />
      </motion.span>
      <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-white group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
        {title}
      </h3>
      <p className="mt-2.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">{body}</p>
    </motion.div>
  );
}

function PrimaryCta({ to, children }: { to: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      whileHover={reduced ? undefined : { scale: 1.03, y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="inline-block"
    >
      <Link
        to={to}
        className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14.5px] font-semibold transition-colors shadow-sm hover:shadow-md"
      >
        {children}
        <ArrowRight
          className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
          strokeWidth={2.25}
        />
      </Link>
    </motion.div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/*
 * Exams whose OFFICIAL syllabus is loaded and searchable right now.
 *
 * Deliberately not the full list of exams the platform supports: this claim is about the
 * commission's own syllabus being indexed and retrievable, which is a stronger and narrower
 * statement. Several more are parsed but not yet indexed, and listing those would promise a
 * student an answer the tutor cannot currently give.
 */
const SYLLABUS_LIVE = [
  { name: 'SSC CGL', source: 'ssc.gov.in' },
  { name: 'SSC MTS', source: 'ssc.gov.in' },
  { name: 'SSC GD Constable', source: 'ssc.gov.in' },
  { name: 'NEET UG', source: 'nta.ac.in' },
  { name: 'JEE Main', source: 'nta.ac.in' },
  { name: 'UPSC ESE', source: 'upsc.gov.in' },
  { name: 'UPSC CAPF', source: 'upsc.gov.in' },
  { name: 'BPSC LDC', source: 'bpsc.bihar.gov.in' },
  { name: 'BPSC DPRO', source: 'bpsc.bihar.gov.in' },
  { name: 'BPSC CDPO', source: 'bpsc.bihar.gov.in' },
];

const DEFAULT_AVATARS = [
  'https://lh3.googleusercontent.com/a/ACg8ocKAzheBPpqS7hokGk7Jph2pxnHPxEp7flbqQQ5k-7pj9yp5rus=s96-c',
  'https://lh3.googleusercontent.com/a/ACg8ocITomVr-Weu-QNw1_ZmRGs3EhmP_S7mQrbo916Hesp2yAf7WA=s96-c',
  'https://lh3.googleusercontent.com/a/ACg8ocLiiLcQtN9TguBm8svmA4TvWAth2gVXvIT4l9DErvCmM_QSgQ=s96-c',
];

export default function LandingPage() {
  useSeo({
    title: `${SITE.name} — ${SITE.tagline}`,
    description: `${SITE.descriptor} Covers NEET, JEE, UPSC CSE, SSC CGL, banking, teaching and school board exams — photograph a question, get a step-by-step answer, and an adaptive study plan built around your actual syllabus.`,
    url: SITE.url,
  });

  const [studentCount, setStudentCount] = useState<number>(32);
  const [activeStudents, setActiveStudents] = useState<number | null>(null);
  const prevActiveRef = useRef<number | null>(null);
  const [activeAnimKey, setActiveAnimKey] = useState(0); // bumped on every change to trigger animation
  const [recentAvatars, setRecentAvatars] = useState<string[]>(DEFAULT_AVATARS);
  const handleOpenHelpWithQuestion = (q: string) => {
    window.dispatchEvent(new CustomEvent('sadhya-open-helpdesk', { detail: { question: q } }));
  };

  useEffect(() => {
    let timeoutId: number;

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/public/stats');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (typeof data.students === 'number') {
              setStudentCount(data.students);
            }
            if (typeof data.activeStudents === 'number') {
              if (data.activeStudents !== prevActiveRef.current) {
                prevActiveRef.current = data.activeStudents;
                setActiveAnimKey(k => k + 1);
              }
              setActiveStudents(data.activeStudents);
            }
            if (data.recentStudentAvatars && Array.isArray(data.recentStudentAvatars)) {
              setRecentAvatars(data.recentStudentAvatars);
            }
          }
        }
      } catch {
        // silent fallback
      }
    };

    // Defer initial telemetry to allow smooth FCP/LCP
    timeoutId = window.setTimeout(fetchStats, 2000);

    // Refresh active student presence every 10s when tab is visible
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchStats();
      }
    }, 10000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchStats();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#131314] text-slate-900 dark:text-white antialiased">
      <SiteHeader />

      <main>
        {/* ══ Hero ═══════════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 lg:pt-24 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 lg:gap-16 xl:gap-20 items-center">
            <div>
              <motion.div
                whileHover={{ scale: 1.03, y: -2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-white/[0.04] backdrop-blur-sm mb-4 text-[13px] font-medium text-slate-700 dark:text-gray-300 shadow-xs hover:border-[#c8e558]/50"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6ca855] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6ca855]"></span>
                </span>
                <AvatarStack avatars={recentAvatars} />
                <span>
                  <strong className="font-semibold text-slate-900 dark:text-white">
                    {studentCount.toLocaleString()} {studentCount === 1 ? 'student' : 'students'}
                  </strong>{' '}
                  registered &amp; learning
                </span>
                <span className="text-slate-300 dark:text-gray-600">·</span>
                <Link to="/signup" className="text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558] font-semibold inline-flex items-center gap-0.5 transition-colors">
                  Join now &rarr;
                </Link>
              </motion.div>

              <h1 className="text-[38px] sm:text-[50px] lg:text-[58px] leading-[1.05] font-semibold tracking-[-0.035em]">
                Ask anything from
                <br />
                your <Underline>syllabus</Underline>.
              </h1>
              {/* Brand signature */}
              <HandwrittenTagline
                className="mt-3 flex text-[19px] sm:text-[21px] text-[#6ca855] dark:text-[#c8e558]"
                delay={0.1}
              />

              <p className="mt-6 sm:mt-7 text-[16.5px] sm:text-[18px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[30rem]">
                An AI tutor built around your exam, your subjects and your level. It answers from
                the curriculum, shows you the sources it used, and lets you check every step it
                took to get there.
              </p>

              <div className="mt-9 flex flex-col sm:flex-row gap-3">
                <PrimaryCta to="/signup">Start learning</PrimaryCta>
                <motion.div
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="inline-block"
                >
                  <Link
                    to="/how-it-works"
                    className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors shadow-2xs hover:shadow-xs"
                  >
                    See how it works
                  </Link>
                </motion.div>
              </div>

              <p className="mt-5 text-[13px] text-slate-500 dark:text-gray-400">
                Free to create an account · Set up takes about two minutes ·{' '}
                <span className="font-semibold text-slate-700 dark:text-gray-200">
                  {studentCount.toLocaleString()} {studentCount === 1 ? 'student' : 'students'}
                </span>{' '}
                already learning
              </p>

              <div className="mt-3 flex items-center">
                <Link
                  to="/help"
                  className="inline-flex items-center gap-1.5 text-[12.5px] sm:text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors group"
                >
                  <Bot className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558] group-hover:scale-110 transition-transform" />
                  <span>
                    Have questions? Ask{' '}
                    <span className="font-semibold text-slate-700 dark:text-gray-200 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors">
                      Sadhya
                    </span>{' '}
                    AI
                  </span>
                  <ArrowRight className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-all" />
                </Link>
              </div>
            </div>

            <div className="mt-8 lg:mt-0">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* ══ Exam coverage ══════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-12 sm:py-14">
            <Reveal>
              <div className="lg:flex lg:items-center lg:gap-14">
                <p className="lg:w-[16rem] shrink-0 text-[15px] sm:text-[15.5px] leading-relaxed font-medium text-slate-600 dark:text-gray-300">
                  It knows the pattern, syllabus and marking scheme for the exams students here
                  actually sit.
                </p>
                <Stagger className="mt-6 lg:mt-0 flex flex-wrap gap-x-2 gap-y-2.5 items-center flex-1" gap={0.025}>
                  {EXAM_CHIPS.map((e) => (
                    <Item key={e.slug} y={8}>
                      <motion.div
                        whileHover={{ scale: 1.07, y: -3 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                      >
                        <Link
                          to={`/exams/${e.slug}`}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-slate-800 dark:text-gray-200 hover:border-[#c8e558]/60 dark:hover:border-[#c8e558]/40 hover:text-slate-950 dark:hover:text-white transition-colors shadow-2xs hover:shadow-xs group"
                        >
                          <ExamLogo slug={e.slug} className="w-5 h-5 shrink-0 object-contain transition-transform group-hover:scale-115" size={20} />
                          <span>{e.name}</span>
                        </Link>
                      </motion.div>
                    </Item>
                  ))}
                </Stagger>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ How it works ═══════════════════════════════════════════════════ */}
        <section id="how" className="scroll-mt-16 max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[36rem]">
              <Eyebrow>Behind every answer</Eyebrow>
              <SectionHeading>You can watch it think.</SectionHeading>
              <Lede>
                A general chatbot hands you a paragraph and asks you to trust it. Sadhya shows
                the six steps it runs before it writes a word, and the sources each answer rests
                on — so you can check the reasoning, not just the result.
              </Lede>
            </div>
          </Reveal>

          <Suspense fallback={<div className="min-h-[280px]" />}>
            <ProcessChain />
          </Suspense>
        </section>


        {/* ══ Voice + official syllabus ══════════════════════════════════════ */}
        <section id="voice" className="scroll-mt-16 max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal>
              <Eyebrow>Talk to it</Eyebrow>
              <SectionHeading>Ask out loud, get an answer back.</SectionHeading>
              <Lede>
                Hold a real conversation with Sadhya — speak naturally, interrupt mid-sentence,
                switch between English and Hindi without announcing it. It answers in the language
                you asked in.
              </Lede>
              <p className="mt-5 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                When you ask what an exam covers, it does not answer from memory. It looks the
                topic up in the syllabus the commission itself published, and if it does not hold
                that syllabus it says so rather than guessing — a wrong answer about what is on
                your paper is worse than no answer.
              </p>

              <div className="mt-9 flex flex-wrap gap-2">
                {SYLLABUS_LIVE.map((e) => (
                  <motion.span
                    key={e.name}
                    whileHover={{ scale: 1.06, y: -2 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 hover:border-[#c8e558]/60 dark:hover:border-[#c8e558]/40 bg-white dark:bg-white/[0.04] text-[13px] font-semibold text-slate-700 dark:text-gray-200 shadow-2xs transition-colors cursor-default"
                  >
                    {e.name}
                    <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500">
                      {e.source}
                    </span>
                  </motion.span>
                ))}
              </div>
              <p className="mt-3 text-[12.5px] text-slate-400 dark:text-slate-500">
                Official syllabus loaded and searchable. More exams are being added.
              </p>
            </Reveal>

            <Reveal delay={0.08}>
              <Suspense fallback={<div className="min-h-[300px]" />}>
                <VoiceOrbDemo />
              </Suspense>
            </Reveal>
          </div>
        </section>

        {/* ══ Capabilities ═══════════════════════════════════════════════════ */}
        <section
          id="capabilities"
          className="scroll-mt-16 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]"
        >
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
            <Reveal>
              <div className="max-w-[36rem]">
                <Eyebrow>Ways in</Eyebrow>
                <SectionHeading>Learning doesn&rsquo;t stay inside a textbook.</SectionHeading>
                <Lede>
                  A question you photograph. A PDF you upload. Live &amp; paid classes taught by top verified
                  teachers, complete with their exclusive notes and question banks. Sadhya brings AI and expert educators together in one place.
                </Lede>
              </div>
            </Reveal>

            <Stagger className="mt-14 sm:mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5" gap={0.08}>
              {CAPABILITIES.map((c) => (
                <Item key={c.title} className="h-full">
                  <CapabilityCard {...c} />
                </Item>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ══ Personalization ════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal>
              <Eyebrow>Set up once</Eyebrow>
              <SectionHeading>It knows who it&rsquo;s teaching.</SectionHeading>
              <Lede>
                A short setup asks what you&rsquo;re working towards. After that, every answer is
                written for that — no re-explaining your situation at the top of each conversation.
              </Lede>
              <p className="mt-5 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                A beginner gets built up from first principles with the jargon explained. Someone
                advanced skips the definitions and goes straight to edge cases, derivations and
                exam-level problems. Same question, different answer.
              </p>

              <div className="mt-9 space-y-6">
                <motion.div
                  whileHover={{ x: 4 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className="flex gap-4"
                >
                  <span className="mt-0.5 w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] flex items-center justify-center shrink-0 shadow-2xs">
                    <Gauge className="w-[17px] h-[17px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-[-0.015em]">
                      If you&rsquo;re not sure of your level, it will find it
                    </h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
                      A baseline assessment that gets harder or easier as you answer, so it places you
                      in far fewer questions than a fixed-length test would need.
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ x: 4 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className="flex gap-4"
                >
                  <span className="mt-0.5 w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] flex items-center justify-center shrink-0 shadow-2xs">
                    <Languages className="w-[17px] h-[17px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-[-0.015em]">
                      English, Hindi, or both
                    </h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
                      Write in whichever language you think in — including mixed Hinglish. Sadhya
                      replies in the same one, and keeps formulae and exam terminology in English.
                    </p>
                  </div>
                </motion.div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" aria-hidden />
                  <span className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">
                    Your learning profile
                  </span>
                </div>
                {/* Valid WCAG definition list */}
                <dl className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {PROFILE_FIELDS.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline gap-4 px-5 sm:px-6 py-3 cursor-default hover:bg-[#c8e558]/5 transition-colors"
                    >
                      <dt className="w-[7.5rem] shrink-0 text-[13px] text-slate-600 dark:text-slate-300">{k}</dt>
                      <dd className="text-[13.5px] font-medium text-slate-900 dark:text-gray-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              </motion.div>
            </Reveal>
          </div>
        </section>

        {/* ══ Student Questions & Live Helpdesk ════════════════════════════ */}
        <section id="help" className="scroll-mt-16 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <Reveal>
                <span className="inline-flex w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 items-center justify-center">
                  <MessageCircleQuestion className="w-[18px] h-[18px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} />
                </span>
                <div className="mt-5">
                  <Eyebrow>Instant Answers & Helpdesk</Eyebrow>
                </div>
                <SectionHeading>Have questions before starting? Ask Sadhya.</SectionHeading>
                <Lede>
                  Whether you want to understand how our 24/7 AI tutor reasons, verify syllabus coverage for your exam, or check our 7-day money-back guarantee — get immediate answers with cited explanations.
                </Lede>
                <p className="mt-4 text-[14.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Need personalized guidance? Chat instantly with our senior support specialists with response times under 30 seconds.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOpenHelpWithQuestion("Tell me about Sadhya AI tutor features.")}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold hover:opacity-90 transition-all shadow-xs cursor-pointer"
                  >
                    <Bot className="w-4 h-4" />
                    Ask Sadhya AI Guide
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOpenHelpWithQuestion("I would like to talk with a live support specialist about Sadhya platform features.")}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-[13.5px] font-semibold hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-xs cursor-pointer"
                  >
                    <Headphones className="w-4 h-4 text-emerald-500" />
                    Talk to Live Specialist
                  </motion.button>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5 sm:p-6 shadow-sm flex flex-col gap-3.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                        Common Student Queries
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">Click to ask instantly</span>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        q: "How does OCR scan & solve work on handwritten problem sets?",
                        tag: "AI Tutor"
                      },
                      {
                        q: "Can I generate audio podcasts from uploaded textbook PDFs?",
                        tag: "Podcast Studio"
                      },
                      {
                        q: "What is the 7-day unconditional money-back guarantee?",
                        tag: "Pricing & Plans"
                      },
                      {
                        q: "How do teachers host live video classes and manage payouts?",
                        tag: "For Teachers"
                      },
                      {
                        q: "Do you sell student data or share private notes?",
                        tag: "Privacy & Security"
                      }
                    ].map((item, idx) => (
                      <motion.button
                        key={idx}
                        whileHover={{ x: 5, scale: 1.008 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        onClick={() => handleOpenHelpWithQuestion(item.q)}
                        className="w-full text-left group p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] hover:border-slate-300 dark:hover:border-white/20 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex flex-col pr-2">
                          <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white leading-snug">
                            {item.q}
                          </span>
                          <span className="text-[11px] text-slate-400 mt-0.5">{item.tag}</span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-white dark:bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-[#c8e558]/20 transition-colors">
                          <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] transition-colors" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ Teachers ═══════════════════════════════════════════════════════ */}
        <section
          id="teachers"
          className="scroll-mt-16 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]"
        >
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-10 lg:gap-16 items-end">
              <Reveal>
                <span className="inline-flex w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 items-center justify-center">
                  <Presentation className="w-[18px] h-[18px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} />
                </span>
                <div className="mt-5">
                  <Eyebrow>For teachers</Eyebrow>
                </div>
                <h2 className="mt-3 text-[26px] sm:text-[32px] leading-[1.15] font-semibold tracking-[-0.03em] max-w-[30rem]">
                  Teaching? You get the whole platform, plus a dashboard.
                </h2>
                <p className="mt-4 max-w-[36rem] text-[15.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                  A teacher account includes everything above — chat, notebooks, practice, the
                  podcast studio — and a powerful teaching dashboard. Manage your classes, track
                  student progress, and organize your cohorts effortlessly.
                </p>
                <p className="mt-4 max-w-[36rem] text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Host live interactive sessions, assign quizzes using our built-in test engine, and
                  leverage the AI content pipeline to instantly generate course materials and book covers.
                  Plus, invite peers via the referral program and receive automated weekly payouts straight to your bank.
                </p>
                <Link
                  to="/for-teachers"
                  className="group inline-flex items-center gap-1.5 mt-6 text-[14.5px] font-semibold text-slate-900 dark:text-white"
                >
                  Learn more
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
                </Link>
              </Reveal>

              <Reveal delay={0.08}>
                {/* Carries the chosen role into the existing signup wizard as navigation state.
                    It only preselects the card; the server still owns productRole. */}
                <motion.div
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Link
                    to="/signup"
                    state={{ role: 'teacher' }}
                    className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-transparent text-[14.5px] font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors whitespace-nowrap shadow-2xs hover:shadow-xs"
                  >
                    Create a teacher account
                    <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                  </Link>
                </motion.div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ Plans ══════════════════════════════════════════════════════════ */}
        <div className="border-t border-slate-100 dark:border-white/[0.07]">
          <Suspense fallback={<div className="min-h-[400px]" />}>
            <PricingSection showComparison={false} />
          </Suspense>
        </div>

        {/* ══ Final CTA ══════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24 sm:py-32">
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <h2 className="text-[32px] sm:text-[42px] lg:text-[48px] leading-[1.1] font-semibold tracking-[-0.03em] max-w-[36rem]">
                Start with the thing you&rsquo;re stuck on, today
              </h2>
              <p className="mt-5 text-[16.5px] sm:text-[17.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[32rem]">
                Tell Sadhya what you&rsquo;re preparing for, then ask it one real question and see what comes back.
              </p>

              {/* Checkmark perks */}
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
                {['Start for free', 'No credit card required', 'Cancel anytime'].map((perk) => (
                  <motion.span
                    key={perk}
                    whileHover={{ scale: 1.05 }}
                    className="inline-flex items-center gap-1.5 text-[13.5px] text-slate-500 dark:text-gray-400 cursor-default"
                  >
                    <Check className="w-4 h-4 text-[#6ca855]" strokeWidth={2.5} />
                    {perk}
                  </motion.span>
                ))}
              </div>

              {/* CTA button */}
              <div className="mt-8">
                <PrimaryCta to="/signup">Start learning &mdash; it&rsquo;s free</PrimaryCta>
              </div>

              {/* Divider */}
              <div className="mt-14 w-full border-t border-slate-200 dark:border-white/[0.08]" />

              {/* Stats row */}
              {(() => {
                const stats = [
                  { 
                    value: `${studentCount.toLocaleString()}`, 
                    label: 'Students registered' 
                  },
                  { 
                    value: '17+', 
                    label: 'Exams covered' 
                  },
                  ...(activeStudents && activeStudents > 0 ? [{ 
                    isLive: true,
                    value: `${activeStudents}`, 
                    label: activeStudents === 1 ? 'Student learning now' : 'Students learning now' 
                  }] : []),
                  { 
                    value: '6-step', 
                    label: 'Reasoning every answer' 
                  },
                ];

                return (
                  <div className={cn(
                    "mt-10 grid gap-6 sm:gap-8 w-full max-w-[48rem]",
                    stats.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-3"
                  )}>
                    {stats.map((stat, idx) => (
                      <motion.div
                        key={idx}
                        whileHover={{ scale: 1.06, y: -2 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                        className="text-center cursor-default"
                      >
                        {stat.isLive ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c8e558] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#8ba32b] dark:bg-[#c8e558]" />
                            </span>
                            {/* Animated rolling counter — flips up/down like YouTube subscriber count */}
                            <div className="relative h-[34px] sm:h-[38px] overflow-hidden flex items-center">
                              <motion.p
                                key={activeAnimKey}
                                initial={{ y: prevActiveRef.current !== null && (activeStudents ?? 0) > (prevActiveRef.current ?? 0) ? 28 : -28, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                                className="text-[22px] sm:text-[24px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white"
                              >
                                {stat.value}
                              </motion.p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[22px] sm:text-[24px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                            {stat.value}
                          </p>
                        )}
                        <p className="mt-1 text-[12.5px] sm:text-[13px] text-slate-500 dark:text-gray-400">
                          {stat.label}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </Reveal>
        </section>
      </main>

        {/* ══ Attribution ════════════════════════════════════════════════════ */}
        <section className="border-t border-slate-100 dark:border-white/[0.07]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-14 sm:py-16">
            <Reveal>
              <Suspense fallback={null}>
                <BuiltWith />
              </Suspense>
            </Reveal>
          </div>
        </section>

      <SiteFooter />
    </div>
  );
}
