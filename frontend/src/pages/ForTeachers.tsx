import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, Check, ChevronDown, Lock, ShieldCheck, Eye, UserCheck,
  Sparkles, Users, GraduationCap, Quote,
} from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { cn } from '../lib/utils';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import {
  PROBLEMS, CAPABILITIES, COPILOT_STEPS, EXAMPLE_PROMPTS, PROFILE_FIELDS, JOURNEY,
  DAY, COMPARISON, FAQS, STATUS_BOARD, STATUS_LABEL, type FeatureStatus,
} from '../components/landing/teacherPageData';
import AvatarStack from '../components/landing/AvatarStack';

/**
 * /for-teachers — the public teacher marketing page.
 *
 * Public by design: it sits outside ProtectedRoute so a signed-out visitor, a signed-in
 * student and a signed-in teacher all get the same page and none of them are pushed into
 * student onboarding.
 *
 * The organising constraint is that this page must not out-run the product. Every claim is
 * carried by teacherPageData.ts, where each item has a status derived from mounted routes and
 * real (non-mock) pages. Where something is specified but unbuilt — classes, enrolment,
 * teacher-aware AI, referral benefits — it is labelled rather than omitted, because a teacher
 * deciding whether to invest their preparation time in a platform deserves to know what is
 * actually here today and what is on the way.
 *
 * The primary CTA hands `{ role: 'teacher' }` to the existing signup route as navigation
 * state. It does not authenticate, does not assign a role, and does not bypass bootstrap —
 * the server remains the only authority on productRole.
 */

const ACCENT = '#c8e558';

/* ── Primitives ───────────────────────────────────────────────────────────────────────── */

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
      {children}
    </p>
  );
}

function SectionHeading({ children, as: As = 'h2' }: { children: ReactNode; as?: 'h1' | 'h2' }) {
  return (
    <As className="mt-3 text-[27px] sm:text-[34px] lg:text-[40px] leading-[1.12] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
      {children}
    </As>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
      {children}
    </p>
  );
}

const STATUS_STYLES: Record<FeatureStatus, string> = {
  available: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  building: 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  next: 'border-slate-300/60 bg-slate-100 text-slate-600 dark:border-white/12 dark:bg-white/[0.06] dark:text-gray-300',
};

function StatusPill({ status, className }: { status: FeatureStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ── Hero previews & CTAs ─────────────────────────────────────────────────────────────── */

function TeacherCta({ className }: { className?: string }) {
  return (
    <Link
      to="/signup"
      state={{ role: 'teacher' }}
      className={cn(
        'inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14.5px] font-semibold transition-colors',
        className,
      )}
    >
      Create a teacher account
      <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
    </Link>
  );
}

function GhostCta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
    >
      {children}
    </a>
  );
}

function DraftPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-x-1 sm:-inset-x-6 -inset-y-6 sm:-inset-y-8 rounded-[32px] bg-[#c8e558]/[0.10] dark:bg-[#c8e558]/[0.05] blur-2xl"
      />
      <div className="relative rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] shadow-[0_20px_60px_-24px_rgba(15,23,42,0.28)] dark:shadow-[0_20px_60px_-24px_rgba(0,0,0,0.75)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-white/[0.07]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" aria-hidden />
          <span className="text-[12px] font-medium text-slate-500 dark:text-gray-400">Scholarly — AI chat</span>
          <span className="ml-auto hidden sm:inline text-[11px] text-slate-500 dark:text-gray-400">Class 9 · CBSE</span>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 dark:bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-white dark:text-slate-900">
              Explain Newton&rsquo;s third law for a Class 9 group that has just met vectors.
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-[13.5px] leading-[1.7] text-slate-700 dark:text-gray-200">
              Start from the pair, not the push. Forces never appear alone — if the bat acts on the
              ball, the ball acts back on the bat, equal in size and opposite in direction.
            </p>
            <p className="text-[13.5px] leading-[1.7] text-slate-700 dark:text-gray-200">
              Because they have just met vectors, say it as: <span className="font-medium">F₍AB₎ = −F₍BA₎</span>.
              The minus sign is the whole law.
            </p>

            <div className="rounded-xl border border-amber-200/70 dark:border-amber-500/25 bg-amber-50/70 dark:bg-amber-500/[0.07] px-3.5 py-2.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-amber-700 dark:text-amber-300">
                Where they get stuck
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-700 dark:text-gray-200">
                The pair acts on <em>different bodies</em>, so it never cancels. That is the point
                most Class 9 students miss.
              </p>
            </div>

            <div className="pt-1">
              <p className="text-[11.5px] text-slate-500 dark:text-gray-400 mb-1.5">2 sources</p>
              <div className="flex flex-wrap gap-1.5">
                {['NCERT Science IX — Force and Laws of Motion', 'Your notebook — Term 2 mechanics'].map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center h-6 px-2.5 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-[11px] text-slate-600 dark:text-gray-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────────────────────── */

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-white/[0.07]">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-start justify-between gap-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg"
        >
          <span className="text-[15.5px] font-medium tracking-[-0.01em] text-slate-900 dark:text-white">{q}</span>
          <ChevronDown
            className={cn('w-4 h-4 mt-1 shrink-0 text-slate-400 dark:text-gray-500 transition-transform duration-200', open && 'rotate-180')}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </h3>
      {open && <p className="pb-5 pr-10 text-[14.5px] leading-[1.75] text-slate-600 dark:text-gray-300">{a}</p>}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────────────────── */

export default function ForTeachers() {
  const [teacherCount, setTeacherCount] = useState<number>(1);
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
            if (typeof data.teachers === 'number' && isMounted) {
              setTeacherCount(data.teachers);
              if (data.recentTeacherAvatars && Array.isArray(data.recentTeacherAvatars)) {
                setRecentAvatars(data.recentTeacherAvatars);
              }
              break;
            }
          }
        } catch {
          // fallback
        }
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, []);

  useSeo({
    title: 'Scholarly for Teachers — AI-assisted preparation, with you in control',
    description:
      'Draft explanations, generate practice, index your own material and turn a chapter into audio — with sources shown and nothing reaching a student unless you decide it should.',
    url: `${SITE.url}/for-teachers`,
  });

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />

      <main>
        {/* ══ 1 · Hero ═══════════════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 lg:pt-24 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] gap-12 lg:gap-16 xl:gap-20 items-center">
            <Reveal>
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-white/[0.04] backdrop-blur-sm mb-4 text-[13px] font-medium text-slate-700 dark:text-gray-300 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6ca855] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6ca855]"></span>
                </span>
                <AvatarStack avatars={recentAvatars} />
                <span>
                  <strong className="font-semibold text-slate-900 dark:text-white">
                    {teacherCount.toLocaleString()} {teacherCount === 1 ? 'teacher' : 'teachers'}
                  </strong>{' '}
                  registered &amp; building
                </span>
                <span className="text-slate-300 dark:text-gray-600">·</span>
                <Link to="/signup" state={{ role: 'teacher' }} className="text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558] font-semibold inline-flex items-center gap-0.5 transition-colors">
                  Join now &rarr;
                </Link>
              </div>

              <div>
                <Eyebrow>For teachers</Eyebrow>
              </div>
              <h1 className="mt-4 text-[36px] sm:text-[48px] lg:text-[56px] leading-[1.05] font-semibold tracking-[-0.035em]">
                Less time preparing.
                <br />
                <span className="relative inline-block whitespace-nowrap">
                  More time teaching.
                  <svg
                    className="absolute -bottom-1 sm:-bottom-1.5 left-0 w-full overflow-visible pointer-events-none"
                    height="11" viewBox="0 0 100 11" preserveAspectRatio="none" fill="none" aria-hidden
                  >
                    <path d="M1.5 5C18 8.8 44 9.6 98.5 2.6" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="mt-7 text-[16.5px] sm:text-[17.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[32rem]">
                Scholarly puts the AI, your own material and the exam context in one place, so the
                repetitive half of preparation — the explanations, the practice sets, the revision
                sheets — stops being rebuilt from scratch every term.
              </p>

              <p className="mt-4 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[32rem]">
                You review everything, with its sources visible. Nothing reaches a student unless
                you decide it should.
              </p>

              <div className="mt-9 flex flex-col sm:flex-row gap-3">
                <TeacherCta />
                <GhostCta to="#how">See how it works</GhostCta>
              </div>

              <p className="mt-6 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                Free to create an account · Your teaching profile takes about three minutes ·{' '}
                <a href="#status" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white">
                  what&rsquo;s built and what isn&rsquo;t
                </a>
              </p>
            </Reveal>

            <Reveal delay={0.12}>
              <DraftPreview />
            </Reveal>
          </div>
        </section>

        {/* ══ 2 · The problem ════════════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-[36rem]">
                <Eyebrow>The actual problem</Eyebrow>
                <SectionHeading>Preparation is the job nobody sees.</SectionHeading>
                <Lede>
                  The teaching itself is the part you trained for. It is everything around it that
                  eats the evening.
                </Lede>
              </div>
            </Reveal>

            <div className="mt-14 grid sm:grid-cols-2 gap-x-10 gap-y-10">
              {PROBLEMS.map((p, i) => (
                <Reveal key={p.title} delay={(i % 2) * 0.06}>
                  <div className="border-t border-slate-200 dark:border-white/10 pt-5">
                    <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{p.title}</h3>
                    <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-500 dark:text-gray-400">{p.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 3 · What you get ═══════════════════════════════════════════════════════ */}
        <section id="what-you-get" className="scroll-mt-16 max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[38rem]">
              <Eyebrow>What a teacher account gives you</Eyebrow>
              <SectionHeading>The whole platform, plus a teaching profile.</SectionHeading>
              <Lede>
                Scholarly is one product gated by capability, not a student app with a teacher app
                bolted to the side. Everything a student gets, you get — and the teacher-specific
                surfaces are being built on top of it. Each card below says exactly where it stands.
              </Lede>
            </div>
          </Reveal>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 0.05}>
                <div
                  className={cn(
                    'h-full rounded-2xl border p-6 flex flex-col',
                    c.status === 'available'
                      ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]'
                      : 'border-dashed border-slate-300 dark:border-white/12 bg-slate-50/50 dark:bg-white/[0.015]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'inline-flex w-10 h-10 rounded-xl items-center justify-center shrink-0',
                        c.status === 'available'
                          ? 'bg-slate-900 dark:bg-white'
                          : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05]',
                      )}
                    >
                      <c.icon
                        className={cn(
                          'w-[18px] h-[18px]',
                          c.status === 'available' ? 'text-white dark:text-slate-900' : 'text-slate-600 dark:text-gray-300',
                        )}
                        strokeWidth={1.9}
                        aria-hidden
                      />
                    </span>
                    <StatusPill status={c.status} />
                  </div>

                  <h3 className="mt-5 text-[16.5px] font-semibold tracking-[-0.015em]">{c.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 flex-1">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══ 3b · The journey ═══════════════════════════════════════════════════════ */}
        <section id="journey" className="scroll-mt-16 border-t border-slate-100 dark:border-white/[0.07]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
            <Reveal>
              <div className="max-w-[38rem]">
                <Eyebrow>Start to finish</Eyebrow>
                <SectionHeading>What actually happens when you sign up.</SectionHeading>
                <Lede>
                  Five minutes to get going, and then the honest version of where the road ends
                  today — including the two steps that are not built yet.
                </Lede>
              </div>
            </Reveal>

            <ol className="mt-14 space-y-0">
              {JOURNEY.map((j, i) => (
                <Reveal key={j.step} delay={Math.min(i, 3) * 0.05}>
                  <li className="relative grid sm:grid-cols-[3.5rem_minmax(0,1fr)] gap-x-6 gap-y-3 py-7 border-t border-slate-200 dark:border-white/10">
                    <div className="flex sm:block items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex w-9 h-9 rounded-full items-center justify-center text-[12.5px] font-semibold tabular-nums',
                          j.status === 'available'
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            : 'border border-dashed border-slate-300 dark:border-white/20 text-slate-500 dark:text-gray-400',
                        )}
                        aria-hidden
                      >
                        {j.step}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{j.title}</h3>
                        <StatusPill status={j.status} />
                        {j.time && (
                          <span className="text-[12.5px] text-slate-500 dark:text-gray-400">{j.time}</span>
                        )}
                      </div>
                      <p className="mt-2.5 max-w-[44rem] text-[14.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                        {j.body}
                      </p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>

            <Reveal delay={0.1}>
              <div className="mt-10 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-6 sm:p-7">
                <h3 className="text-[15.5px] font-semibold tracking-[-0.015em]">
                  Why we are telling you what doesn&rsquo;t work
                </h3>
                <p className="mt-2.5 max-w-[46rem] text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
                  Because you would find out in week two, and by then you would have moved a term&rsquo;s
                  preparation onto a platform that could not do what you assumed. Steps 1 to 4 genuinely
                  save you time from today. Steps 5 and 6 do not exist. When they do, we will say so
                  here — with the same plainness.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ 4 · AI copilot ═════════════════════════════════════════════════════════ */}
        <section id="how" className="scroll-mt-16 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
            <Reveal>
              <div className="max-w-[38rem]">
                <Eyebrow>Your drafting assistant</Eyebrow>
                <SectionHeading>AI does the repetitive half. You keep the judgement.</SectionHeading>
                <Lede>
                  It is not a black box that hands you a paragraph. You can see what it retrieved and
                  the steps it took, which is the difference between checking work and trusting it.
                </Lede>
              </div>
            </Reveal>

            <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-9">
              {COPILOT_STEPS.map((s, i) => (
                <Reveal key={s.n} delay={(i % 3) * 0.05}>
                  <div className="border-t border-slate-200 dark:border-white/10 pt-5">
                    <span className="text-[12px] font-semibold tabular-nums text-slate-500 dark:text-gray-400">{s.n}</span>
                    <h3 className="mt-2.5 text-[16px] font-semibold tracking-[-0.015em]">{s.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={0.1}>
              <div className="mt-14 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-8">
                <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Things you can ask for today</h3>
                <p className="mt-1.5 text-[13.5px] text-slate-500 dark:text-gray-400">
                  Each of these maps to a workflow that runs now — not a roadmap item.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <li key={p.text} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                      <span className="flex-1 flex gap-3">
                        <Quote className="w-3.5 h-3.5 mt-1 shrink-0 text-slate-300 dark:text-gray-600" strokeWidth={2} aria-hidden />
                        <span className="text-[14px] leading-relaxed text-slate-700 dark:text-gray-200">{p.text}</span>
                      </span>
                      <span className="shrink-0 ml-6 sm:ml-0 inline-flex items-center h-[22px] px-2.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[11.5px] font-medium text-slate-600 dark:text-gray-300">
                        {p.via}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ 5 · Teaching context ═══════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal>
              <Eyebrow>Your teaching context</Eyebrow>
              <SectionHeading>Set it once, instead of in every prompt.</SectionHeading>
              <Lede>
                A generic assistant makes you re-establish who you teach at the top of every
                conversation. Scholarly asks once, in an eight-step setup, and keeps it on your
                account.
              </Lede>
              <p className="mt-5 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                These are the actual fields the wizard collects — nothing more. Your location,
                availability and qualifications are deliberately not asked for, because no feature
                uses them and unused personal data is a liability rather than a head start.
              </p>

              <div className="mt-7 rounded-xl border border-amber-200/70 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/[0.06] p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} aria-hidden />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold">AI that reads this profile</p>
                      <StatusPill status="building" />
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      Being straight with you: the profile is collected and stored today, but the
                      assistant does not consult it yet. Connecting the two is what is being built
                      now — so setting it up is worth doing, and it is not doing the work yet.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] overflow-hidden">
                <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" aria-hidden />
                  <span className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Your teaching profile</span>
                </div>
                <dl className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {PROFILE_FIELDS.map((f) => (
                    <div key={f.label} className="flex items-baseline gap-4 px-5 sm:px-6 py-3">
                      <dt className="w-[8.5rem] shrink-0 text-[13px] text-slate-500 dark:text-gray-400">{f.label}</dt>
                      <dd className="text-[13.5px] font-medium text-slate-800 dark:text-gray-100">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ 6 · Create once ════════════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-[36rem]">
                <Eyebrow>Create once</Eyebrow>
                <SectionHeading>Material that survives the term.</SectionHeading>
                <Lede>
                  A chat you close is work you lose. A notebook is something you add to for years —
                  and the same source can become an explanation, a practice set and an audio
                  explainer without being rebuilt each time.
                </Lede>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <ol className="mt-14 grid gap-4 sm:gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { t: 'Bring it in', d: 'Chapter PDFs, your notes, past papers.', s: 'available' as FeatureStatus },
                  { t: 'Ask', d: 'Explanation, questions, summary, audio.', s: 'available' as FeatureStatus },
                  { t: 'Review', d: 'Sources shown; edit before anyone sees it.', s: 'available' as FeatureStatus },
                  { t: 'Keep', d: 'It stays in your notebook, searchable.', s: 'available' as FeatureStatus },
                  { t: 'Share to a class', d: 'Publishing to your own students.', s: 'next' as FeatureStatus },
                ].map((step, i) => (
                  <li
                    key={step.t}
                    className={cn(
                      'relative rounded-xl border p-5',
                      step.s === 'available'
                        ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]'
                        : 'border-dashed border-slate-300 dark:border-white/12 bg-transparent',
                    )}
                  >
                    {/* These ordinals carry the sequence, so they are real text rather than
                        decoration — kept at the same token as the other numbered lists so they
                        clear AA on both themes. */}
                    <span className="text-[11.5px] font-semibold tabular-nums text-slate-500 dark:text-gray-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="mt-2 text-[14.5px] font-semibold tracking-[-0.01em]">{step.t}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">{step.d}</p>
                    {step.s === 'next' && <StatusPill status="next" className="mt-3" />}
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>

        {/* ══ 7 · Teacher to student ═════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[38rem]">
              <div className="flex flex-wrap items-center gap-3">
                <Eyebrow>From teacher to student</Eyebrow>
                <StatusPill status="next" />
              </div>
              <SectionHeading>Nobody becomes your student without agreeing to it.</SectionHeading>
              <Lede>
                Classes and enrolment are specified and not yet built. When they arrive, they arrive
                with consent designed in from the start rather than added afterwards — which is why
                this section exists on a marketing page at all.
              </Lede>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="mt-12 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-8">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-gray-400">
                    You invite
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
                    You send an invitation to a class you own.
                  </p>
                </div>

                <div className="flex lg:flex-col items-center justify-center gap-2 text-slate-500 dark:text-gray-400">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.1em]">or</span>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-gray-400">
                    They request
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
                    A student finds your public profile and asks to join.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <ChevronDown className="w-5 h-5 text-slate-300 dark:text-gray-600" aria-hidden />
              </div>

              <div className="mt-6 rounded-xl border-2 border-[#c8e558] bg-[#c8e558]/[0.07] p-5 text-center">
                <p className="text-[14.5px] font-semibold">Both sides accept</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                  An invitation that has not been accepted grants nothing at all.
                </p>
              </div>

              <div className="mt-6 flex justify-center">
                <ChevronDown className="w-5 h-5 text-slate-300 dark:text-gray-600" aria-hidden />
              </div>

              <div className="mt-6 grid sm:grid-cols-3 gap-4">
                {[
                  { t: 'Only then, a class', d: 'The relationship lives inside one class — not across the platform.' },
                  { t: 'Only that class', d: 'You see their progress for your class. Never their private chats or other notebooks.' },
                  { t: 'They can leave', d: 'Access ends immediately when they do. Nothing lingers.' },
                ].map((x) => (
                  <div key={x.t} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] p-5">
                    <p className="text-[14px] font-semibold tracking-[-0.01em]">{x.t}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══ 8 · Peers ══════════════════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
              <Reveal>
                <Eyebrow>Other teachers</Eyebrow>
                <SectionHeading>Teaching is less lonely with peers.</SectionHeading>
                <Lede>
                  Connections work today, for everyone on Scholarly: send a request, they accept or
                  decline, either side can block. It is a genuine two-sided handshake — nobody joins
                  your network without agreeing.
                </Lede>
              </Reveal>

              <Reveal delay={0.08}>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Users className="w-[18px] h-[18px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} aria-hidden />
                      <h3 className="text-[15.5px] font-semibold tracking-[-0.015em]">Connect and follow</h3>
                      <StatusPill status="available" />
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                      Find people, send requests, follow their activity, and take part in discussions
                      and study groups.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-6">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <GraduationCap className="w-[18px] h-[18px] text-slate-600 dark:text-gray-300" strokeWidth={1.9} aria-hidden />
                      <h3 className="text-[15.5px] font-semibold tracking-[-0.015em]">Invite fellow teachers</h3>
                      <StatusPill status="next" />
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                      A referral programme for teachers is specified but not built. When it ships,
                      you will be able to invite peers and receive whatever benefit applies at the
                      time — we are not going to print a number here before it exists.
                    </p>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                      One thing already decided: a referral will never create a teaching
                      relationship or grant access to anyone&rsquo;s data. Those are separate by design.
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ 9 · Ecosystem ══════════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[36rem]">
              <Eyebrow>How it fits together</Eyebrow>
              <SectionHeading>One platform, three participants.</SectionHeading>
              <Lede>
                The AI is the constant. Teachers and students meet around it rather than in separate
                products — which is why a teacher account is not a smaller version of the platform.
              </Lede>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="mt-14 grid gap-4 sm:gap-5 md:grid-cols-3">
              {[
                { role: 'Teachers', icon: GraduationCap, items: ['Draft explanations', 'Build practice', 'Organise material', 'Guide students'] },
                { role: 'The AI', icon: Sparkles, items: ['Retrieve from curriculum', 'Explain and adapt', 'Generate practice', 'Show its sources'], accent: true },
                { role: 'Students', icon: Users, items: ['Ask anything', 'Practise and test', 'Revise by listening', 'Track weak areas'] },
              ].map((col) => (
                <div
                  key={col.role}
                  className={cn(
                    'rounded-2xl border p-6 sm:p-7',
                    col.accent
                      ? 'border-[#c8e558] dark:border-[#c8e558]/60 bg-[#c8e558]/[0.06]'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex w-10 h-10 rounded-xl items-center justify-center',
                      col.accent ? 'bg-[#c8e558]' : 'bg-slate-900 dark:bg-white',
                    )}
                  >
                    <col.icon
                      className={cn('w-[18px] h-[18px]', col.accent ? 'text-slate-900' : 'text-white dark:text-slate-900')}
                      strokeWidth={1.9}
                      aria-hidden
                    />
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">{col.role}</h3>
                  <ul className="mt-4 space-y-2">
                    {col.items.map((it) => (
                      <li key={it} className="flex gap-2.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                        <span className="mt-[0.6em] w-1 h-1 rounded-full bg-slate-400 dark:bg-gray-500 shrink-0" aria-hidden />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="mt-6 text-center text-[13.5px] text-slate-500 dark:text-gray-400">
              Shared material · shared vocabulary · one learning record per student
            </p>
          </Reveal>
        </section>

        {/* ══ 10 · A day ═════════════════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-[36rem]">
                <Eyebrow>In practice</Eyebrow>
                <SectionHeading>Where it actually fits in your day.</SectionHeading>
                <Lede>
                  Not a schedule the product tracks — Scholarly does not watch your timetable. Just
                  the moments where it takes work off you.
                </Lede>
              </div>
            </Reveal>

            <div className="mt-14 space-y-0">
              {DAY.map((d, i) => (
                <Reveal key={d.when} delay={i * 0.04}>
                  <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)_auto] gap-2 sm:gap-6 py-6 border-t border-slate-200 dark:border-white/10 items-baseline">
                    <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">{d.when}</p>
                    <p className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">{d.what}</p>
                    <span className="justify-self-start sm:justify-self-end inline-flex items-center h-[22px] px-2.5 rounded-md bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-[11.5px] font-medium text-slate-600 dark:text-gray-300 whitespace-nowrap">
                      {d.tool}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 11 · Control & privacy ═════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[38rem]">
              <Eyebrow>Control and privacy</Eyebrow>
              <SectionHeading>You stay the teacher.</SectionHeading>
              <Lede>
                Two commitments worth stating plainly, because both are architectural rather than
                promises we could quietly drop.
              </Lede>
            </div>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-2 gap-4 sm:gap-5">
            <Reveal>
              <div className="h-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-7">
                <span className="inline-flex w-10 h-10 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
                  <UserCheck className="w-[18px] h-[18px] text-white dark:text-slate-900" strokeWidth={1.9} aria-hidden />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">Nothing ships without you</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
                  The AI drafts; you decide. What to keep, what to rewrite, what to bin, what a
                  student ever sees. There is no path by which generated material reaches a learner
                  without passing through you.
                </p>
                <ul className="mt-5 space-y-2">
                  {['You review every output', 'Sources shown so you can check', 'Your material stays private by default'].map((x) => (
                    <li key={x} className="flex gap-2.5 text-[13.5px] text-slate-600 dark:text-gray-300">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-[#7d9a1f] dark:text-[#c8e558]" strokeWidth={2.5} aria-hidden />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.06}>
              <div className="h-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-7">
                <span className="inline-flex w-10 h-10 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
                  <ShieldCheck className="w-[18px] h-[18px] text-white dark:text-slate-900" strokeWidth={1.9} aria-hidden />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">Being a teacher grants you nobody</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Your role is not a key to anyone&rsquo;s data. There is no directory of students, no
                  lookup, no way to see a learner exists until they have chosen to work with you.
                </p>
                <ul className="mt-5 space-y-2">
                  {[
                    { icon: Lock, t: 'Private conversations stay private — always, to everyone' },
                    { icon: Eye, t: 'Class progress only, for students who joined your class' },
                    { icon: ShieldCheck, t: 'Access ends the moment a student leaves' },
                  ].map((x) => (
                    <li key={x.t} className="flex gap-2.5 text-[13.5px] text-slate-600 dark:text-gray-300">
                      <x.icon className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={2} aria-hidden />
                      {x.t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <blockquote className="mt-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-6 sm:p-8">
              <p className="text-[16px] sm:text-[18px] leading-relaxed font-medium tracking-[-0.015em] text-slate-900 dark:text-white">
                &ldquo;Role never grants access to a person. Only a relationship the other party
                accepted does.&rdquo;
              </p>
              <footer className="mt-3 text-[13px] text-slate-500 dark:text-gray-400">
                The governing rule of Scholarly&rsquo;s teacher–student architecture — enforced in the
                data model, not left to be remembered.
              </footer>
            </blockquote>
          </Reveal>
        </section>

        {/* ══ 12 · Comparison ════════════════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-[36rem]">
                <Eyebrow>The difference</Eyebrow>
                <SectionHeading>Why not just use a chatbot?</SectionHeading>
                <Lede>
                  A general assistant is genuinely good at drafting text. The gap is everything
                  around the draft.
                </Lede>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="mt-12 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] overflow-hidden">
                <div className="hidden sm:grid grid-cols-2 border-b border-slate-100 dark:border-white/[0.07]">
                  <p className="px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400">
                    A general chatbot
                  </p>
                  <p className="px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-900 dark:text-white border-l border-slate-100 dark:border-white/[0.07]">
                    Scholarly
                  </p>
                </div>
                {COMPARISON.map((row) => (
                  <div key={row.scholarly} className="grid sm:grid-cols-2 border-b border-slate-100 dark:border-white/[0.07] last:border-0">
                    <p className="px-6 py-4 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                      <span className="sm:hidden block text-[11px] font-semibold uppercase tracking-[0.1em] mb-1">General chatbot</span>
                      {row.generic}
                    </p>
                    <p className="px-6 pb-4 sm:py-4 text-[13.5px] leading-relaxed text-slate-800 dark:text-gray-100 sm:border-l border-slate-100 dark:border-white/[0.07]">
                      <span className="sm:hidden block text-[11px] font-semibold uppercase tracking-[0.1em] mb-1 text-slate-500 dark:text-gray-400">Scholarly</span>
                      {row.scholarly}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ 13 · Status board ══════════════════════════════════════════════════════ */}
        <section id="status" className="scroll-mt-16 max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[38rem]">
              <Eyebrow>Straight answers</Eyebrow>
              <SectionHeading>What&rsquo;s built, and what isn&rsquo;t.</SectionHeading>
              <Lede>
                You are deciding whether to move your preparation onto a platform. That decision
                needs the real picture, so here it is — including the parts that are not finished.
              </Lede>
            </div>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-4 sm:gap-5">
            {(['available', 'building', 'next'] as FeatureStatus[]).map((status, i) => (
              <Reveal key={status} delay={i * 0.06}>
                <div
                  className={cn(
                    'h-full rounded-2xl border p-6',
                    status === 'available'
                      ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]'
                      : 'border-dashed border-slate-300 dark:border-white/12',
                  )}
                >
                  <StatusPill status={status} />
                  <ul className="mt-5 space-y-2.5">
                    {STATUS_BOARD[status].map((item) => (
                      <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                        {status === 'available' ? (
                          <Check className="w-4 h-4 mt-0.5 shrink-0 text-[#7d9a1f] dark:text-[#c8e558]" strokeWidth={2.5} aria-hidden />
                        ) : (
                          <span className="mt-[0.6em] w-1 h-1 rounded-full bg-slate-400 dark:bg-gray-500 shrink-0" aria-hidden />
                        )}
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══ 14 · FAQ ═══════════════════════════════════════════════════════════════ */}
        <section className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <div className="grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-10 lg:gap-16">
              <Reveal>
                <div>
                  <Eyebrow>Questions</Eyebrow>
                  <SectionHeading>Before you sign up.</SectionHeading>
                  <p className="mt-4 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                    Not covered here? Write to{' '}
                    <a
                      href={`mailto:${SITE.email.support}`}
                      className="font-medium text-slate-900 dark:text-white underline underline-offset-2"
                    >
                      {SITE.email.support}
                    </a>
                    .
                  </p>
                </div>
              </Reveal>

              <Reveal delay={0.06}>
                <div>
                  {FAQS.map((f) => (
                    <Faq key={f.q} q={f.q} a={f.a} />
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ 15 · Final CTA ═════════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24 sm:py-32">
          <Reveal>
            <div className="max-w-[38rem]">
              <h2 className="text-[30px] sm:text-[42px] leading-[1.1] font-semibold tracking-[-0.03em]">
                Your students don&rsquo;t need another chatbot.
                <br />
                You need somewhere to keep the work.
              </h2>
              <p className="mt-5 text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                Set up a teaching profile, put one chapter into a notebook, and ask for the
                explanation you would otherwise write tonight.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <TeacherCta />
                <Link
                  to="/"
                  className="text-[14.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Explore Scholarly
                </Link>
              </div>
              <p className="mt-6 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                One account holds one role, and it can&rsquo;t be switched later without support —
                so choose teacher only if that&rsquo;s how you&rsquo;ll mainly use Scholarly.
              </p>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
