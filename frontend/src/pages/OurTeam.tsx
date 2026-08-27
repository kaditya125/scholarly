import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Mail, MessageSquare } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { cn } from '../lib/utils';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import {
  FOUNDER, TEAM, ADVISORS, BUILDING, BUILD_STATUS_LABEL, LEARNING_CHAIN,
  PHILOSOPHY_QUESTIONS, type Person, type BuildStatus,
} from '../components/landing/founderPageData';

/**
 * /our-team — "Meet the Founder".
 *
 * Public by design: it sits outside ProtectedRoute so a signed-out visitor, a signed-in
 * student and a signed-in teacher all get the same page, and none of them are diverted into
 * student onboarding by reading it.
 *
 * ── ROUTE vs LABEL ────────────────────────────────────────────────────────────────────────
 * The route and the footer link say "Our Team"; the page heading says "Meet the Founder".
 * That split is deliberate. Sadhya is being built by one person today, and the page says so
 * plainly — but when there are colleagues, only the h1 and the section list change. Nobody
 * has to migrate a URL, update the footer, or fix inbound links.
 *
 * ── HOW THIS GROWS ────────────────────────────────────────────────────────────────────────
 * `Person` is the unit. FOUNDER, TEAM and ADVISORS in founderPageData.ts all hold the same
 * shape, and Roster renders NOTHING for an empty list — so there is never a "Team" heading
 * sitting over an empty grid. Adding the first hire is a push to TEAM.
 *
 * The founder is the one Person the page does NOT render as a card: the hero shows the
 * photograph at full size with the details beside it, because a page about one person shouldn't
 * introduce them inside a box. PersonCard is untouched and still waiting for TEAM.
 *
 * Every factual claim on the page is carried by founderPageData.ts, where the rule is that
 * nothing about the founder is written unless it is independently verifiable, and nothing is
 * marked live unless a route is mounted and a real page renders it.
 */

/* ── Primitives ───────────────────────────────────────────────────────────────────────── */

/** Scroll-reveal. Matches /for-teachers: one transform, once, and inert under reduced motion. */
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

function SectionHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'mt-3 text-[27px] sm:text-[34px] lg:text-[40px] leading-[1.12] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white',
        className,
      )}
    >
      {children}
    </h2>
  );
}

function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('mt-5 text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400', className)}>
      {children}
    </p>
  );
}

/** Shared focus treatment — every interactive element on this page carries it. */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b0c]';

/* ── A note on the brand green used as TEXT below: #5f7415 ─────────────────────────────
   The lime (#c8e558) is a background/accent colour — as text on white it measures 1.5:1, and
   the darker olives used elsewhere for decorative type (#8ea63a, #8ba32b) reach only 2.7–2.9:1.
   #5f7415 is the same hue taken down until it clears WCAG AA on both the white page and the
   slate section band (5.26:1 and 5.02:1). The lime is kept for dark mode, where it measures
   13.9:1 on the #0b0b0c ground. Written as literals, not a constant, so Tailwind can see them. */

const STATUS_STYLES: Record<BuildStatus, string> = {
  available: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  building: 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
};

/**
 * Status is carried by the label text, not by the colour — the pill reads correctly in
 * greyscale and to a screen reader, which colour alone would not.
 */
function StatusPill({ status }: { status: BuildStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap',
        STATUS_STYLES[status],
      )}
    >
      {BUILD_STATUS_LABEL[status]}
    </span>
  );
}

/* ── Founder / team primitives ────────────────────────────────────────────────────────── */

/**
 * Avatar.
 *
 * Renders the real photograph when `person.photo` is set, and a typographic monogram when it
 * isn't. No portrait of a real person is generated here — an invented face on a page whose
 * whole point is that the person is real would undo the page. Swapping in a photo is one
 * string in founderPageData.ts; nothing else changes.
 */
function Avatar({ person, className }: { person: Person; className?: string }) {
  /*
   * A photo that fails to load falls back to the monogram rather than leaving a broken-image
   * icon on the page. The likeliest cause is a typo'd path after someone drops a file in
   * public/, and the monogram is the same thing the page shows without a photo at all — so the
   * failure degrades to the designed state instead of to a torn placeholder.
   */
  const [failed, setFailed] = useState(false);

  if (person.photo && !failed) {
    return (
      <img
        src={person.photo}
        alt={`${person.name}, ${person.role} at ${SITE.name}`}
        onError={() => setFailed(true)}
        /*
         * object-top, not the default centre. The avatar is square and a headshot is usually
         * portrait, so a centre-crop takes its window from the middle of the frame — clipping the
         * top of the head while keeping a band of shirt. Anchoring to the top keeps the face in
         * the crop for any portrait source without needing the image pre-cropped.
         */
        className={cn(
          'object-cover object-top rounded-2xl border border-slate-200 dark:border-white/10',
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-2xl select-none',
        'border border-slate-200 dark:border-white/10',
        'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/[0.07] dark:to-white/[0.02]',
        'font-semibold tracking-[-0.04em] text-slate-800 dark:text-white',
        className,
      )}
    >
      {person.initials}
    </span>
  );
}

/**
 * The founder's photograph, at the size a founder page earns.
 *
 * ── WHY IT IS NOT CROPPED ─────────────────────────────────────────────────────────────────
 * This is an environmental portrait, not a headshot: full figure, seated, with the Sadhya wall
 * and its tagline behind. A square or 4:5 window would take either the head or the wall, and the
 * wall is half of why the picture is worth showing. So it renders at the source's own 2:3, and
 * `aspect-[2/3]` on the img reserves that space before the bytes land — the hero does not reflow
 * around it on a slow connection.
 *
 * ── WHY THREE FILES ───────────────────────────────────────────────────────────────────────
 * The master is a 1.9 MB PNG. On the first paint of a public page that is the entire weight
 * budget spent on one image; the 1000px WebP is 85 KB for the same picture at the size it is
 * actually drawn, and phones take the 500px one. Sizes are declared so the browser chooses
 * before layout rather than after.
 *
 * Returns null if it fails to load. The monogram is the right fallback for a 72px avatar and the
 * wrong one blown up to 430px, so the hero simply becomes a text hero — a designed state, not a
 * torn one.
 */
function FounderPortrait({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  const hero = person.heroPhoto;
  if (!hero || failed) return null;

  return (
    <figure className="relative w-full max-w-[300px] sm:max-w-[380px] lg:max-w-none mx-auto">
      {/* Brand wash behind the frame. Load-bearing, not decorative: the photograph's own
          background is a near-white wall, and without this it dissolves into a white page. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-5 rounded-[38px] bg-gradient-to-tr from-[#c8e558]/25 via-emerald-500/10 to-transparent blur-2xl"
      />

      <div className="relative overflow-hidden rounded-[26px] border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] shadow-[0_24px_60px_-30px_rgba(15,23,42,0.5)]">
        {/* The same hairline of brand colour PersonCard carries, so the photo reads as part of
            the page's vocabulary rather than an image dropped into it. */}
        <span
          aria-hidden
          className="absolute inset-x-10 top-0 z-10 h-px bg-gradient-to-r from-transparent via-[#c8e558] to-transparent"
        />
        <picture>
          <source
            type="image/webp"
            srcSet={`${hero.webp500} 500w, ${hero.webp1000} 1000w`}
            sizes="(min-width: 1024px) 420px, (min-width: 640px) 380px, 300px"
          />
          <img
            src={hero.jpg1000}
            alt={`${person.name}, ${person.role} at ${SITE.name}, ${hero.alt}`}
            width={hero.width}
            height={hero.height}
            /* Above the fold on this page, so it is fetched eagerly and early rather than
               lazily — a lazy hero is a hero that arrives after the reader has scrolled past. */
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onError={() => setFailed(true)}
            className="block w-full h-auto aspect-[2/3] object-cover"
          />
        </picture>
      </div>
    </figure>
  );
}

/**
 * One person. TEAM and ADVISORS use it the day they stop being empty, which is what keeps this
 * page from needing a rewrite later. The founder no longer uses it — on a page about one person
 * the name belongs in the hero itself, not in a box standing beside it.
 */
function PersonCard({
  person,
  nameAs: NameTag = 'h3',
  showContact = false,
}: {
  person: Person;
  nameAs?: 'h2' | 'h3';
  showContact?: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 sm:p-7">
      {/* A single hairline of brand colour along the top edge — the page's only decoration
          that isn't type or space. */}
      <span
        aria-hidden
        className="absolute inset-x-6 sm:inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-[#c8e558] to-transparent"
      />

      <div className="flex items-center gap-4">
        <Avatar person={person} className="w-16 h-16 sm:w-[72px] sm:h-[72px] text-[22px] sm:text-[25px] shrink-0" />
        <div className="min-w-0">
          <NameTag className="text-[19px] sm:text-[21px] font-semibold tracking-[-0.025em] text-slate-900 dark:text-white">
            {person.name}
          </NameTag>
          <p className="mt-1 text-[13.5px] font-medium text-[#5f7415] dark:text-[#c8e558]">{person.role}</p>
        </div>
      </div>

      <p className="mt-5 text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">{person.blurb}</p>

      {/* Renders only what exists. An empty `links` array produces no row at all rather than
          a set of icons pointing at profiles nobody owns. */}
      {person.links.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {person.links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label={`${person.name} on ${l.label}`}
              className={cn(
                'w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-colors',
                FOCUS,
              )}
            >
              <l.icon className="w-[15px] h-[15px]" strokeWidth={1.9} aria-hidden />
            </a>
          ))}
        </div>
      )}

      {showContact && (
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/[0.07] flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            to="/contact"
            className={cn(
              'inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white hover:text-[#5f7415] dark:hover:text-[#c8e558] transition-colors rounded',
              FOCUS,
            )}
          >
            <MessageSquare className="w-[15px] h-[15px]" strokeWidth={1.9} aria-hidden />
            Get in touch
          </Link>
          <a
            href={`mailto:${SITE.email.support}`}
            className={cn(
              'inline-flex items-center gap-1.5 text-[13.5px] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded',
              FOCUS,
            )}
          >
            <Mail className="w-[15px] h-[15px]" strokeWidth={1.9} aria-hidden />
            {SITE.email.support}
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * A named group of people — "The team", "Advisors".
 *
 * Returns null for an empty list on purpose. A heading with nothing under it reads as a team
 * that left, not a team that hasn't been hired yet.
 */
function Roster({ title, blurb, people }: { title: string; blurb?: string; people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
      <Reveal>
        <div className="max-w-[38rem]">
          <SectionHeading className="mt-0">{title}</SectionHeading>
          {blurb && <Lede>{blurb}</Lede>}
        </div>
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p, i) => (
          <Reveal key={p.name} delay={Math.min(i, 5) * 0.05}>
            <PersonCard person={p} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────────────────── */

export default function OurTeam() {
  useSeo({
    title: `Meet the Founder | ${SITE.name}`,
    description:
      'Sadhya is built by Aditya Kumar, its founder and product engineer. Why it exists: a connected learning system for competitive-exam preparation that tracks what a student has actually covered, where they are weak, and what to practise next — not just how long they studied.',
    url: `${SITE.url}/our-team`,
    type: 'profile',
  });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const reduced = useReducedMotion();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased selection:bg-[#c8e558] selection:text-slate-900">
      <SiteHeader />

      <main>
        {/* ══ 1 · Hero ═══════════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          {/* Soft brand wash, the same treatment the other public pages use. Decorative. */}
          <div
            aria-hidden
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-[680px] max-w-[140vw] h-[320px] bg-gradient-to-tr from-[#c8e558]/15 via-emerald-500/10 to-transparent blur-[120px] pointer-events-none rounded-full"
          />

          <div className="relative max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 lg:pt-24 pb-16 sm:pb-20">
            {/* Text first in the DOM so the h1 leads for a screen reader and for search, and the
                photograph follows. On lg the photograph sits beside it; below lg it stacks under,
                which is the same reading order either way. */}
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-12 lg:gap-16 items-center">
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={reduced ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <Eyebrow>Our team</Eyebrow>
                <h1 className="mt-3 text-[34px] sm:text-[46px] lg:text-[54px] leading-[1.06] font-semibold tracking-[-0.035em]">
                  Meet the Founder
                </h1>

                {/* Identity, promoted out of the card it used to sit in. The h2 directly under
                    the h1 is the outline this page should have had all along: the page is about
                    a person, and the person is the first thing beneath its title. */}
                <div className="mt-6 flex items-baseline flex-wrap gap-x-3 gap-y-1">
                  <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.025em] text-slate-900 dark:text-white">
                    {FOUNDER.name}
                  </h2>
                  <p className="text-[14px] font-medium text-[#5f7415] dark:text-[#c8e558]">{FOUNDER.role}</p>
                </div>

                {/* The blurb comes from founderPageData.ts, where the rule is that nothing about
                    the founder is written unless it is independently verifiable. */}
                <Lede className="max-w-[34rem]">{FOUNDER.blurb}</Lede>
                <Lede className="max-w-[34rem]">
                  Sadhya started with a simple idea: exam preparation should understand not only
                  what students study, but what they actually know.
                </Lede>

                <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                  <Link
                    to="/how-it-works"
                    className={cn(
                      'inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14.5px] font-semibold transition-colors',
                      FOCUS,
                    )}
                  >
                    Explore Sadhya
                    <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
                  </Link>
                  <Link
                    to="/contact"
                    className={cn(
                      'inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors',
                      FOCUS,
                    )}
                  >
                    Get in touch
                  </Link>
                </div>

                {/* Carried over from the founder card this hero replaced, so removing the card
                    didn't quietly remove the one direct address on the page. */}
                <a
                  href={`mailto:${SITE.email.support}`}
                  className={cn(
                    'mt-6 inline-flex items-center gap-1.5 text-[13.5px] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded',
                    FOCUS,
                  )}
                >
                  <Mail className="w-[15px] h-[15px]" strokeWidth={1.9} aria-hidden />
                  {SITE.email.support}
                </a>
              </motion.div>

              <motion.div
                initial={reduced ? false : { opacity: 0, y: 20 }}
                animate={reduced ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              >
                <FounderPortrait person={FOUNDER} />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ══ 2 · Why I'm building Sadhya ════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-[42rem]">
                <Eyebrow>Why</Eyebrow>
                <SectionHeading>Why I&rsquo;m building Sadhya</SectionHeading>
                <Lede>
                  Exam preparation is often fragmented across syllabus PDFs, question banks, mock
                  tests, notes, communities, and disconnected study tools. Each one is competent on
                  its own. None of them know what the others know.
                </Lede>
                <Lede>
                  So the syllabus never finds out which questions a student got wrong, the question
                  bank never finds out which chapters they haven&rsquo;t opened, and the study plan
                  is left guessing. The student ends up doing the joining-up by hand, in their head,
                  at the exact moment they can least afford to.
                </Lede>
                <Lede>
                  Sadhya is being built as one connected system instead — where each stage hands
                  something real to the next.
                </Lede>
              </div>
            </Reveal>

            {/* The chain, in order. A list semantically, a sequence visually. */}
            <Reveal delay={0.08}>
              <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {LEARNING_CHAIN.map((step, i) => (
                  <li
                    key={step.label}
                    className="relative rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4"
                  >
                    <span className="text-[11.5px] font-semibold tabular-nums text-slate-400 dark:text-gray-500">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                      {step.label}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">{step.note}</p>
                    {/* Connector, desktop only. Decorative — the ordered list already carries
                        the sequence for anyone who isn't seeing it. */}
                    {i < LEARNING_CHAIN.length - 1 && (
                      <ArrowRight
                        aria-hidden
                        className="hidden lg:block absolute top-1/2 -right-[13px] -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-white/20"
                        strokeWidth={2}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-10 max-w-[42rem] text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                Instead of measuring only how much a student studies, Sadhya is designed to
                understand what they have actually covered, where they struggle, and what they
                should work on next.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ══ 3 · What I'm building ═════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[42rem]">
              <Eyebrow>The work</Eyebrow>
              <SectionHeading>What I&rsquo;m building</SectionHeading>
              <Lede>
                Six pieces of one system. What is in students&rsquo; hands today is marked as such;
                what isn&rsquo;t yet says so, rather than borrowing credit from a roadmap.
              </Lede>
            </div>
          </Reveal>

          <div className="mt-10 sm:mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BUILDING.map((c, i) => (
              <Reveal key={c.title} delay={Math.min(i, 5) * 0.05} className="h-full">
                <article className="group h-full flex flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.05] items-center justify-center shrink-0">
                      <c.icon
                        className="w-[18px] h-[18px] text-slate-700 dark:text-gray-300"
                        strokeWidth={1.9}
                        aria-hidden
                      />
                    </span>
                    <StatusPill status={c.status} />
                  </div>
                  <h3 className="mt-4 text-[16.5px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">{c.body}</p>
                  {c.href && (
                    <Link
                      to={c.href}
                      className={cn(
                        'mt-auto pt-4 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-slate-900 dark:text-white hover:text-[#5f7415] dark:hover:text-[#c8e558] transition-colors rounded',
                        FOCUS,
                      )}
                    >
                      Open it
                      <ArrowRight
                        className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    </Link>
                  )}
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══ 4 · The core philosophy ═══════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24 sm:py-32">
            <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-12 lg:gap-16">
              <Reveal>
                <div>
                  <Eyebrow>The idea underneath</Eyebrow>
                  <h2 className="mt-3 text-[30px] sm:text-[40px] lg:text-[46px] leading-[1.08] font-semibold tracking-[-0.035em]">
                    Progress should mean{' '}
                    <span className="relative inline-block">
                      more than activity.
                      <span
                        aria-hidden
                        className="absolute left-0 -bottom-0.5 w-full h-[3px] rounded-full bg-[#c8e558]"
                      />
                    </span>
                  </h2>
                  <Lede>
                    A student studying for four hours doesn&rsquo;t necessarily mean they are four
                    hours closer to mastering their exam.
                  </Lede>
                  <Lede>
                    Hours are the easiest thing to measure and the least useful thing to know. So
                    the system is built around five questions instead.
                  </Lede>
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <ol className="divide-y divide-slate-200/70 dark:divide-white/[0.07] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03]">
                  {PHILOSOPHY_QUESTIONS.map((q, i) => (
                    <li key={q} className="flex items-baseline gap-4 px-5 sm:px-6 py-4 sm:py-[18px]">
                      <span
                        aria-hidden
                        className="text-[12px] font-semibold tabular-nums shrink-0 text-[#5f7415] dark:text-[#c8e558]"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[15px] sm:text-[16px] leading-relaxed font-medium tracking-[-0.015em] text-slate-800 dark:text-gray-100">
                        {q}
                      </span>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ 5 · Built from the ground up ══════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <div className="max-w-[42rem]">
              <Eyebrow>How it&rsquo;s being made</Eyebrow>
              <SectionHeading>Built from the ground up.</SectionHeading>
              <Lede>
                Sadhya is currently being built independently, one system at a time — from the
                student experience and community to the learning infrastructure behind it.
              </Lede>
              <Lede>
                The goal isn&rsquo;t to build another collection of study tools. It&rsquo;s to build
                a connected learning system around the way students actually prepare.
              </Lede>
            </div>
          </Reveal>
        </section>

        {/* ══ 6 · Team & advisors ═══════════════════════════════════════════════════
            Both render null while their lists are empty — see Roster. They sit here, in
            order, so the day someone joins the page already has a place to put them. */}
        <Roster title="The team" blurb="The people building Sadhya alongside its founder." people={TEAM} />
        <Roster title="Advisors" blurb="People who help steer what Sadhya becomes." people={ADVISORS} />

        {/* ══ 7 · There's more to build ═════════════════════════════════════════════ */}
        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-[42rem]">
                <Eyebrow>What&rsquo;s next</Eyebrow>
                <SectionHeading>There&rsquo;s more to build.</SectionHeading>
                <Lede>
                  Sadhya is starting with one builder, but the vision is much bigger. As the
                  platform grows, the goal is to bring together people who care deeply about
                  education, technology, and the students we&rsquo;re building for.
                </Lede>
                {/* No careers system exists, so this goes to the real contact form rather than a
                    job-application flow that isn't there. */}
                <Link
                  to="/contact"
                  className={cn(
                    'mt-8 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl border border-slate-300 dark:border-white/15 text-[14.5px] font-semibold text-slate-900 dark:text-white hover:bg-white dark:hover:bg-white/[0.06] transition-colors',
                    FOCUS,
                  )}
                >
                  Be part of the journey
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ 8 · Closing CTA ═══════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24 sm:py-32">
          <Reveal>
            <div className="max-w-[40rem]">
              <h2 className="text-[30px] sm:text-[42px] leading-[1.1] font-semibold tracking-[-0.03em]">
                Come build the future of exam preparation with us.
              </h2>
              <p className="mt-5 text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                Sadhya is being built for students who want preparation to feel more connected, more
                personal, and more intelligent.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/how-it-works"
                  className={cn(
                    'inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14.5px] font-semibold transition-colors',
                    FOCUS,
                  )}
                >
                  Explore Sadhya
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
                </Link>
                <Link
                  to="/community"
                  className={cn(
                    'inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors',
                    FOCUS,
                  )}
                >
                  Join the Community
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
