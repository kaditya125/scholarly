import { type ReactNode, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, Camera, NotebookPen, Headphones,
  SlidersHorizontal, Gauge, Languages, Presentation, Check, Users,
} from 'lucide-react';
import ProductPreview from '../components/landing/ProductPreview';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import PricingSection from '../components/landing/PricingSection';
import ProcessChain from '../components/landing/ProcessChain';
import AvatarStack from '../components/landing/AvatarStack';

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
 *   · language mirroring            → config/prompts.ts SCHOLARLY_LANGUAGE_RULE
 *   · exam coverage                 → config/prompts.ts SCHOLARLY_EXAM_KNOWLEDGE
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

/** Straight from the backend's exam knowledge base. Nothing here is aspirational. */
const EXAMS = [
  'NEET', 'JEE Main', 'JEE Advanced', 'UPSC CSE', 'SSC CGL', 'SSC CHSL',
  'BPSC', 'Bihar TRE', 'CTET & STET', 'CUET', 'IBPS PO', 'SBI PO',
  'RBI Grade B', 'RRB NTPC', 'UGC NET', 'State PSCs', 'CBSE & ICSE, Class 6–12',
];

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
    body: 'Point your camera at a problem in a textbook or a past paper. Scholarly reads it, works out which chapter it belongs to, pulls that chapter, and solves it with you step by step.',
  },
  {
    icon: NotebookPen,
    title: 'Bring your own material',
    body: 'Upload your PDFs, class notes and question papers into a notebook. Scholarly indexes them, maps how the concepts connect, and answers from your material — citing it back.',
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
 * Motion system.
 *
 * One easing curve and one gesture — rise and fade — used everywhere, with the only variable
 * being WHEN each element takes its turn. That is what keeps a page this long feeling composed
 * rather than busy: nothing spins, nothing scales in, nothing parallaxes.
 *
 * Every primitive drops to a plain <div> under `prefers-reduced-motion`, so the page renders
 * fully formed rather than animating a shorter distance.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Scroll reveal for a single block. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Reveals its <Item> descendants one after another instead of as a block.
 *
 * `onLoad` runs the sequence on mount rather than on scroll — correct for the hero, which is
 * already in view when the page arrives and would otherwise pop in fully formed.
 */
function Stagger({
  children,
  className,
  gap = 0.07,
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
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      initial="hidden"
      {...(onLoad
        ? { animate: 'show' }
        : { whileInView: 'show', viewport: { once: true, margin: '-80px' } })}
    >
      {children}
    </Tag>
  );
}

/** A single step in a <Stagger>. Inherits its cue through motion's variant context. */
function Item({ children, className, y = 18 }: { children: ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The hand-drawn arc under a word — the same gesture as FlourishLink in the auth shell,
 * which is where this brand's one bit of personality already lives.
 */
function Underline({ children, delay = 0.5 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
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
        {/* Drawn rather than faded in: it is a hand gesture, so it should arrive like one. */}
        <motion.path
          d="M1.5 5C18 8.8 44 9.6 98.5 2.6"
          stroke={ACCENT}
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 0.75, ease: EASE, delay: reduced ? 0 : delay }}
        />
      </svg>
    </span>
  );
}

/**
 * Section label. Sits at slate-500/gray-400 rather than the lighter slate-400 the app
 * uses for incidental chrome — at 12px uppercase this is real text a visitor reads, and
 * slate-400 on white only reaches ~2.9:1.
 */
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
 * Lifts a little on hover. The border lightening does the work at rest; the lift only confirms
 * the card is a single object — these are not links, so it must not imply somewhere to click.
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
      className="h-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-7 transition-colors hover:border-slate-300 dark:hover:border-white/20"
      whileHover={reduced ? undefined : { y: -4 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <span className="inline-flex w-10 h-10 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
        <Icon className="w-[18px] h-[18px] text-white dark:text-slate-900" strokeWidth={1.9} />
      </span>
      <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">{title}</h3>
      <p className="mt-2.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">{body}</p>
    </motion.div>
  );
}

function PrimaryCta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14.5px] font-semibold transition-colors"
    >
      {children}
      <ArrowRight
        className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
        strokeWidth={2.25}
      />
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [studentCount, setStudentCount] = useState<number>(1);
  const [recentAvatars, setRecentAvatars] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      const endpoints = [
        `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/public/stats`,
        'http://localhost:8080/api/public/stats',
        'http://127.0.0.1:8080/api/public/stats',
        '/api/public/stats',
      ].filter(Boolean);

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            if (typeof data.students === 'number' && isMounted) {
              setStudentCount(data.students);
              if (data.recentStudentAvatars && Array.isArray(data.recentStudentAvatars)) {
                setRecentAvatars(data.recentStudentAvatars);
              }
              break;
            }
          }
        } catch {
          // try next fallback endpoint
        }
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />

      <main>
        {/* ══ Hero ═══════════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 lg:pt-24 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 lg:gap-16 xl:gap-20 items-center">
            {/* Sequenced on mount: the hero is already in view on arrival, so a scroll trigger
                would fire everything at once. */}
            <Stagger onLoad gap={0.09}>
              <Item>
                <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-white/[0.04] backdrop-blur-sm mb-4 text-[13px] font-medium text-slate-700 dark:text-gray-300 shadow-sm">
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
                </div>
              </Item>

              <Item>
                <h1 className="text-[38px] sm:text-[50px] lg:text-[58px] leading-[1.05] font-semibold tracking-[-0.035em]">
                  Ask anything from
                  <br />
                  your <Underline>syllabus</Underline>.
                </h1>
              </Item>

              <Item>
                <p className="mt-6 sm:mt-7 text-[16.5px] sm:text-[18px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[30rem]">
                  An AI tutor built around your exam, your subjects and your level. It answers from
                  the curriculum, shows you the sources it used, and lets you check every step it
                  took to get there.
                </p>
              </Item>

              <Item>
                <div className="mt-9 flex flex-col sm:flex-row gap-3">
                  <PrimaryCta to="/signup">Start learning</PrimaryCta>
                  <a
                    href="#how"
                    className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    See how it works
                  </a>
                </div>
              </Item>

              <Item y={12}>
                <p className="mt-5 text-[13px] text-slate-500 dark:text-gray-400">
                  Free to create an account · Set up takes about two minutes ·{' '}
                  <span className="font-semibold text-slate-700 dark:text-gray-200">
                    {studentCount.toLocaleString()} {studentCount === 1 ? 'student' : 'students'}
                  </span>{' '}
                  already learning
                </p>
              </Item>
            </Stagger>

            <Reveal delay={0.22}>
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        {/* ══ Exam coverage ══════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-12 sm:py-14">
            <Reveal>
              <div className="lg:flex lg:items-start lg:gap-16">
                <p className="lg:w-[15rem] shrink-0 text-[13.5px] leading-relaxed font-medium text-slate-500 dark:text-gray-400">
                  It knows the pattern, syllabus and marking scheme for the exams students here
                  actually sit.
                </p>
                <Stagger className="mt-6 lg:mt-0 flex flex-wrap gap-x-2 gap-y-2" gap={0.025}>
                  {EXAMS.map((e) => (
                    <Item key={e} y={8}>
                      <span className="inline-block px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[13px] font-medium text-slate-600 dark:text-gray-300">
                        {e}
                      </span>
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
                A general chatbot hands you a paragraph and asks you to trust it. Scholarly shows
                the six steps it runs before it writes a word, and the sources each answer rests
                on — so you can check the reasoning, not just the result.
              </Lede>
            </div>
          </Reveal>

          <ProcessChain />
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
                  A question you photograph. A PDF you already have. A topic you&rsquo;d rather listen
                  to on the way to class. Scholarly takes all of them — and answers in whatever shape
                  actually helps.
                </Lede>
              </div>
            </Reveal>

            <Stagger className="mt-14 sm:mt-16 grid sm:grid-cols-2 gap-4 sm:gap-5" gap={0.08}>
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
                <div className="flex gap-4">
                  <span className="mt-0.5 w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] flex items-center justify-center shrink-0">
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
                </div>

                <div className="flex gap-4">
                  <span className="mt-0.5 w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] flex items-center justify-center shrink-0">
                    <Languages className="w-[17px] h-[17px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-[-0.015em]">
                      English, Hindi, or both
                    </h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
                      Write in whichever language you think in — including mixed Hinglish. Scholarly
                      replies in the same one, and keeps formulae and exam terminology in English.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] overflow-hidden">
                <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" aria-hidden />
                  <span className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">
                    Your learning profile
                  </span>
                </div>
                {/* Rows arrive one by one, so the card reads as a profile being filled in.
                    Still a real <dl>: HTML permits a <div> grouping each dt/dd pair, which is
                    exactly what <Item> renders. */}
                <Stagger as="dl" className="divide-y divide-slate-100 dark:divide-white/[0.06]" gap={0.05}>
                  {PROFILE_FIELDS.map(([k, v]) => (
                    <Item key={k} y={10}>
                      <div className="flex items-baseline gap-4 px-5 sm:px-6 py-3">
                        <dt className="w-[7.5rem] shrink-0 text-[13px] text-slate-500 dark:text-gray-400">{k}</dt>
                        <dd className="text-[13.5px] font-medium text-slate-800 dark:text-gray-100">{v}</dd>
                      </div>
                    </Item>
                  ))}
                </Stagger>
              </div>
            </Reveal>
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
                  Teaching? You get the whole platform, plus a profile.
                </h2>
                <p className="mt-4 max-w-[36rem] text-[15.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                  A teacher account includes everything above — chat, notebooks, practice, the
                  podcast studio — and a teaching profile: the subjects you cover, the classes and
                  boards you teach, the exams you prepare students for, and how you like to explain.
                </p>
                <p className="mt-4 max-w-[36rem] text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Classes, cohorts, publishing to your own students, and AI that reads your teaching
                  profile are all still being built. We would rather say that plainly than show you
                  an empty dashboard.
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
                <Link
                  to="/signup"
                  state={{ role: 'teacher' }}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-transparent text-[14.5px] font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors whitespace-nowrap"
                >
                  Create a teacher account
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </Link>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ Plans ══════════════════════════════════════════════════════════ */}
        <div className="border-t border-slate-100 dark:border-white/[0.07]">
          <PricingSection />
        </div>

        {/* ══ Final CTA ══════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24 sm:py-32">
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <h2 className="text-[32px] sm:text-[42px] lg:text-[48px] leading-[1.1] font-semibold tracking-[-0.03em] max-w-[36rem]">
                Start with the thing you&rsquo;re stuck on, today
              </h2>
              <p className="mt-5 text-[16.5px] sm:text-[17.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[32rem]">
                Tell Scholarly what you&rsquo;re preparing for, then ask it one real question and see what comes back.
              </p>

              {/* Checkmark perks */}
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
                {['Start for free', 'No credit card required', 'Cancel anytime'].map((perk) => (
                  <span key={perk} className="inline-flex items-center gap-1.5 text-[13.5px] text-slate-500 dark:text-gray-400">
                    <Check className="w-4 h-4 text-[#6ca855]" strokeWidth={2.5} />
                    {perk}
                  </span>
                ))}
              </div>

              {/* CTA button */}
              <div className="mt-8">
                <PrimaryCta to="/signup">Start learning &mdash; it&rsquo;s free</PrimaryCta>
              </div>

              {/* Divider */}
              <div className="mt-14 w-full border-t border-slate-200 dark:border-white/[0.08]" />

              {/* Stats row */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12 w-full max-w-[38rem]">
                {[
                  { value: `${studentCount.toLocaleString()}`, label: 'Students registered' },
                  { value: '17+', label: 'Exams covered' },
                  { value: '6-step', label: 'Reasoning every answer' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <p className="text-[22px] sm:text-[24px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-500 dark:text-gray-400">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
