import React, { useState, useEffect, type ReactNode } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, ChevronDown, ChevronUp } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SkyAmbience from '../components/landing/sky';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import { EXAM_CATALOG, getExamBySlug } from '../lib/examCatalog';
import { examMetaDescription, examMetaTitle } from '../lib/examSeo';
import { ExamLogo } from '../components/brand/ExamLogo';

const ACCENT = '#c8e558';
const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-400">
      {children}
    </p>
  );
}

export default function ExamLanding() {
  const { slug } = useParams<{ slug: string }>();
  const exam = slug ? getExamBySlug(slug) : undefined;
  const [activeTab, setActiveTab] = useState<'pattern' | 'syllabus' | 'eligibility' | 'ai-prep'>('pattern');
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});

  const toggleUnit = (key: string) => {
    setExpandedUnits((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveTab('pattern');
    setExpandedUnits({});
  }, [slug]);

  useEffect(() => {
    if (!exam) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${exam.fullName} (${exam.name}) Comprehensive Preparation — Sadhya`,
      description: exam.about,
      provider: {
        '@type': 'Organization',
        name: SITE.name,
        sameAs: SITE.url,
      },
      about: exam.fullName,
    });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [exam]);

  useSeo({
    title: exam ? examMetaTitle(exam) : `Exam Preparation | ${SITE.name}`,
    // Title and description are both shared with scripts/seo-routes.ts, which stamps the same
    // strings into the served HTML. Assembled here, they ran 92-152 and 240-270 characters
    // against the ~60 and ~155 Google shows. fullName is not lost by leaving the title: it is
    // the page's <h1> and the JSON-LD `about` below. See src/lib/examSeo.ts.
    description: exam
      ? examMetaDescription(exam)
      : `${SITE.name} covers preparation for ${EXAM_CATALOG.length}+ competitive exams and boards.`,
    url: exam ? `${SITE.url}/exams/${exam.slug}` : `${SITE.url}/exams`,
  });

  if (!exam) {
    return <Navigate to="/" replace />;
  }

  /*
   * The "Other exams covered" strip at the bottom of the page.
   *
   * This line was deleted by 0c75581e (the landing-animation refactor) while BOTH of its usages
   * were left in place, so every render threw `ReferenceError: others is not defined` before any
   * markup was produced — all 19 /exams/:slug pages served a blank white document in production.
   * A ReferenceError in the component body cannot be caught by anything downstream; there is no
   * partial render to fall back to.
   *
   * Declared AFTER the `!exam` guard on purpose: it reads `exam.slug`, and above the guard
   * `exam` is legitimately undefined for an unknown slug.
   */
  const others = EXAM_CATALOG.filter((e) => e.slug !== exam.slug).slice(0, 8);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />
      <SkyAmbience />

      {/*
        Measure is deliberately narrower than the old 1160px. This is a document — pattern,
        syllabus, eligibility, read in order — not a dashboard to be scanned. The wide track is
        what pushed the previous design into filling the space with cards.
      */}
      <main className="relative z-10 max-w-[900px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-20 sm:pb-28">
        <Reveal>
          <nav className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400">
            <Link to="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">Home</Link>
            <span aria-hidden>/</span>
            <Link to="/#exams" className="hover:text-slate-900 dark:hover:text-white transition-colors">Exams</Link>
            <span aria-hidden>/</span>
            <span className="text-slate-900 dark:text-white font-medium">{exam.name}</span>
          </nav>

          {/* ══ Hero — on the page, not in a card ══════════════════════════ */}
          <header className="mt-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.04] flex items-center justify-center p-2 shrink-0">
                <ExamLogo slug={exam.slug} size={40} className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#6ca855] dark:text-[#c8e558]">
                  {exam.category}
                </p>
                <p className="mt-0.5 text-[13.5px] text-slate-500 dark:text-gray-400">
                  Conducted by <span className="text-slate-700 dark:text-gray-200">{exam.conductedBy}</span>
                </p>
              </div>
            </div>

            <h1 className="mt-6 text-[28px] sm:text-[36px] leading-[1.12] font-semibold tracking-[-0.035em] text-balance">
              {exam.fullName}
            </h1>

            <p className="mt-4 max-w-[36rem] text-[15px] leading-[1.7] text-slate-600 dark:text-gray-300">
              {exam.about}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                state={{ intent: exam.name }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-[14px] font-semibold text-slate-900 bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] transition-colors"
              >
                Start preparing for {exam.name}
                <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
              </Link>
              <Link
                to={`/test?topic=${encodeURIComponent(exam.name + ' - ' + exam.fullName)}&slug=${exam.slug}`}
                state={{ topic: `${exam.name}: ${exam.fullName}`, slug: exam.slug, count: 10, mode: 'exam' }}
                className="inline-flex items-center h-11 px-5 rounded-xl border border-slate-200 dark:border-white/10 text-[14px] font-semibold text-slate-700 dark:text-gray-200 hover:border-slate-300 dark:hover:border-white/25 transition-colors"
              >
                Take a practice quiz
              </Link>
              {exam.officialSite && (
                <a
                  href={exam.officialSite}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[13.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Official site ↗
                </a>
              )}
            </div>
          </header>

          {/* ══ At a glance — a row of facts, not four tiles ═══════════════ */}
          <dl className="mt-12 grid grid-cols-2 sm:grid-cols-4 border-t border-slate-100 dark:border-white/[0.07]">
            {[
              { label: 'Duration', value: exam.duration },
              { label: 'Total marks', value: exam.totalMarks },
              { label: 'Mode', value: exam.mode },
              { label: 'Frequency', value: exam.frequency },
            ].map((fact) => (
              <div
                key={fact.label}
                className="py-4 pr-5 border-b border-slate-100 dark:border-white/[0.07] sm:border-b-0"
              >
                <dt className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-400 dark:text-gray-500">
                  {fact.label}
                </dt>
                <dd className="mt-1 text-[13.5px] font-medium text-slate-800 dark:text-gray-200">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* ══ Tabs ═══════════════════════════════════════════════════════ */}
        <div className="mt-14">
          <div
            role="tablist"
            className="flex gap-6 overflow-x-auto border-b border-slate-100 dark:border-white/[0.07]"
          >
            {([
              ['pattern', 'Pattern & marking'],
              ['syllabus', 'Syllabus'],
              ['eligibility', 'Eligibility'],
              ['ai-prep', 'With Sadhya'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={`pb-3 -mb-px text-[14px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Pattern & marking ─────────────────────────────────────── */}
          {activeTab === 'pattern' && (
            <Reveal className="mt-10 space-y-12">
              <section>
                <Eyebrow>Marking scheme</Eyebrow>
                <p className="mt-3 pl-4 border-l-2 border-[#c8e558] text-[14.5px] leading-[1.7] text-slate-700 dark:text-gray-300">
                  {exam.markingScheme}
                </p>
              </section>

              <section>
                <Eyebrow>Stages and sections</Eyebrow>
                <div className="mt-5 space-y-10">
                  {exam.stages.map((stage, idx) => (
                    <div key={idx}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 border-b border-slate-100 dark:border-white/[0.07]">
                        <h3 className="text-[16px] font-semibold tracking-[-0.015em]">
                          <span className="mr-2 font-normal tabular-nums text-slate-400 dark:text-gray-500">
                            {idx + 1}
                          </span>
                          {stage.name}
                        </h3>
                        <p className="text-[13px] text-slate-500 dark:text-gray-400">
                          {stage.duration} · {stage.totalMarks}
                        </p>
                      </div>
                      <p className="mt-2 text-[13.5px] text-slate-500 dark:text-gray-400">{stage.type}</p>

                      {/* Its own scroll container, so a wide table never scrolls the page. */}
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[420px] text-left text-[14px]">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-[0.11em] text-slate-400 dark:text-gray-500">
                              <th className="pb-2 font-semibold">Section</th>
                              <th className="pb-2 font-semibold">Questions</th>
                              <th className="pb-2 font-semibold text-right">Marks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] border-t border-slate-100 dark:border-white/[0.07]">
                            {stage.sections.map((sec, sIdx) => (
                              <tr key={sIdx}>
                                <td className="py-3 pr-4 text-slate-800 dark:text-gray-200">
                                  {sec.name}
                                  {sec.timing && (
                                    <span className="block text-[12px] text-slate-400 dark:text-gray-500">
                                      {sec.timing}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 pr-4 tabular-nums text-slate-600 dark:text-gray-400">
                                  {sec.questions}
                                </td>
                                <td className="py-3 text-right tabular-nums font-medium text-slate-800 dark:text-gray-200">
                                  {sec.marks}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {/* ── Syllabus ──────────────────────────────────────────────── */}
          {activeTab === 'syllabus' && (
            <Reveal className="mt-10">
              <p className="max-w-[36rem] text-[14.5px] leading-[1.7] text-slate-600 dark:text-gray-300">
                Sadhya&rsquo;s question generation, notebooks and diagnostics are mapped to these
                official topics, so practice follows the syllabus rather than a guess at it.
              </p>

              <div className="mt-10 space-y-12">
                {exam.syllabus.map((subj, subIdx) => (
                  <section key={subIdx}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 pb-3 border-b border-slate-100 dark:border-white/[0.07]">
                      <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{subj.subject}</h3>
                      <div className="flex items-center gap-4">
                        <span className="text-[12.5px] tabular-nums text-slate-400 dark:text-gray-500">
                          {subj.chapters.length} units
                        </span>
                        <Link
                          to={`/test?topic=${encodeURIComponent(exam.name + ' - ' + subj.subject)}&slug=${exam.slug}`}
                          state={{ topic: `${exam.name}: ${subj.subject}`, slug: exam.slug, count: 5, mode: 'study' }}
                          className="text-[12.5px] font-semibold text-slate-900 dark:text-white underline underline-offset-4 decoration-slate-300 dark:decoration-white/25 hover:decoration-[#8ea63a] dark:hover:decoration-[#c8e558] transition-colors"
                        >
                          Practise this
                        </Link>
                      </div>
                    </div>

                    {subj.highWeightageTopics.length > 0 && (
                      <p className="mt-4 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                        <span className="font-semibold text-slate-700 dark:text-gray-200">Heaviest areas:</span>{' '}
                        {subj.highWeightageTopics.join(' · ')}
                      </p>
                    )}

                    <div className="mt-5">
                      {subj.chapters.map((ch, cIdx) => {
                        const unitKey = `${subIdx}-${cIdx}`;
                        const isExpanded = expandedUnits[unitKey] !== false;
                        return (
                          <div key={cIdx} className="border-b border-slate-100 dark:border-white/[0.07]">
                            <button
                              onClick={() => toggleUnit(unitKey)}
                              aria-expanded={isExpanded}
                              className="w-full py-3 text-left flex items-center justify-between gap-4 text-[14px] font-medium text-slate-800 dark:text-gray-200 hover:text-slate-950 dark:hover:text-white transition-colors"
                            >
                              <span>{ch.unit}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" strokeWidth={2} />
                              ) : (
                                <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" strokeWidth={2} />
                              )}
                            </button>
                            {isExpanded && (
                              <ul className="pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                {ch.topics.map((top, topIdx) => (
                                  <li
                                    key={topIdx}
                                    className="text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400"
                                  >
                                    {top}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </Reveal>
          )}

          {/* ── Eligibility ───────────────────────────────────────────── */}
          {activeTab === 'eligibility' && (
            <Reveal className="mt-10 space-y-12">
              <dl className="border-t border-slate-100 dark:border-white/[0.07]">
                {[
                  { term: 'Qualification', value: exam.eligibility.qualification },
                  { term: 'Age limit', value: exam.eligibility.ageLimit },
                  {
                    term: 'Attempts',
                    value:
                      exam.eligibility.attemptsLimit ||
                      'No restriction, as long as the age and qualification criteria are met.',
                  },
                  { term: 'Medium', value: exam.eligibility.languageMedium },
                ].map((row) => (
                  <div
                    key={row.term}
                    className="grid sm:grid-cols-[168px_1fr] gap-x-8 gap-y-1 py-5 border-b border-slate-100 dark:border-white/[0.07]"
                  >
                    <dt className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{row.term}</dt>
                    <dd className="text-[14.5px] leading-[1.7] text-slate-600 dark:text-gray-300">{row.value}</dd>
                  </div>
                ))}
              </dl>

              <section>
                <Eyebrow>How to approach it</Eyebrow>
                <ul className="mt-4 space-y-3">
                  {exam.preparationTips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check
                        className="w-4 h-4 mt-1 shrink-0 text-[#6ca855] dark:text-[#c8e558]"
                        strokeWidth={2.5}
                      />
                      <span className="text-[14.5px] leading-[1.7] text-slate-600 dark:text-gray-300">{tip}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          )}

          {/* ── With Sadhya ───────────────────────────────────────────── */}
          {activeTab === 'ai-prep' && (
            <Reveal className="mt-10">
              {/* The old version titled each of these "Feature #1", "Feature #2" — a heading that
                  told the reader nothing the point beside it did not. The point is the content. */}
              <ul className="border-t border-slate-100 dark:border-white/[0.07]">
                {exam.howSadhyaHelps.map((point, idx) => (
                  <li
                    key={idx}
                    className="grid sm:grid-cols-[40px_1fr] gap-x-4 py-5 border-b border-slate-100 dark:border-white/[0.07]"
                  >
                    <span className="hidden sm:block pt-0.5 text-[13px] tabular-nums text-slate-300 dark:text-gray-600">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <p className="text-[14.5px] leading-[1.7] text-slate-600 dark:text-gray-300">{point}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-[16px] font-semibold tracking-[-0.015em]">
                    Test your readiness for {exam.name}
                  </h3>
                  <p className="mt-1 text-[14px] text-slate-500 dark:text-gray-400">
                    A diagnostic quiz built to {exam.name}&rsquo;s current pattern.
                  </p>
                </div>
                <Link
                  to={`/test?topic=${encodeURIComponent(exam.name + ' - ' + exam.fullName)}&slug=${exam.slug}`}
                  state={{ topic: `${exam.name}: ${exam.fullName}`, slug: exam.slug, count: 10, mode: 'exam' }}
                  className="shrink-0 inline-flex items-center justify-center h-11 px-5 rounded-xl text-[14px] font-semibold text-slate-900 bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] transition-colors"
                >
                  Generate a practice test
                </Link>
              </div>
            </Reveal>
          )}
        </div>

        {/* ══ Other exams ════════════════════════════════════════════════ */}
        {others.length > 0 && (
          <Reveal delay={0.15} className="mt-20 pt-10 border-t border-slate-100 dark:border-white/[0.07]">
            <Eyebrow>Other exams on Sadhya</Eyebrow>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5">
              {others.map((e) => (
                <Link
                  key={e.slug}
                  to={`/exams/${e.slug}`}
                  className="inline-flex items-center gap-2 text-[13.5px] font-medium text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <ExamLogo slug={e.slug} size={16} className="w-4 h-4 shrink-0 object-contain" />
                  {e.name}
                </Link>
              ))}
            </div>
          </Reveal>
        )}
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
