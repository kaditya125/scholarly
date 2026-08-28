import { useParams, Link, Navigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, GraduationCap } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import { EXAM_CATALOG, getExamBySlug } from '../lib/examCatalog';
import { ExamLogo } from '../components/brand/ExamLogo';

/**
 * /exams/:slug — one dedicated, genuinely distinct landing page per exam Sadhya covers.
 *
 * This exists because a generic marketing page cannot rank for "SSC CGL preparation" —
 * search engines and searchers both need a page that is actually about SSC CGL. Content
 * comes entirely from examCatalog.ts's per-exam data, so the page differs meaningfully
 * exam to exam rather than being the same template with a name swapped in.
 */

const ACCENT = '#c8e558';

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

export default function ExamLanding() {
  const { slug } = useParams<{ slug: string }>();
  const exam = slug ? getExamBySlug(slug) : undefined;

  // JSON-LD: Sadhya's AI tutoring offering for this exam (Course schema), not the exam
  // itself — Sadhya doesn't conduct these exams, it prepares people for them.
  useEffect(() => {
    if (!exam) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${exam.fullName} Preparation — Sadhya`,
      description: exam.about,
      provider: {
        '@type': 'Organization',
        name: SITE.name,
        sameAs: SITE.url,
      },
      about: exam.fullName,
    });
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [exam]);

  useSeo({
    title: exam ? `${exam.name} Preparation — AI Tutor for ${exam.fullName} | ${SITE.name}` : `Exam Preparation | ${SITE.name}`,
    description: exam
      ? `Prepare for ${exam.fullName} (${exam.name}) with an AI tutor built around the exam's actual syllabus and pattern. ${exam.about.slice(0, 110)}…`
      : `${SITE.name} covers preparation for ${EXAM_CATALOG.length}+ competitive exams and school boards.`,
    url: exam ? `${SITE.url}/exams/${exam.slug}` : `${SITE.url}/exams`,
  });

  if (!exam) return <Navigate to="/" replace />;

  const others = EXAM_CATALOG.filter((e) => e.slug !== exam.slug).slice(0, 6);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0b]">
      <SiteHeader />

      <main className="pt-28 sm:pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <nav className="text-[13px] text-slate-400 dark:text-gray-500 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors">Home</Link>
              <span className="mx-1.5">/</span>
              <span className="text-slate-600 dark:text-gray-300">{exam.name}</span>
            </nav>

            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium"
                style={{ borderColor: `${ACCENT}55`, color: '#5c7a1a', background: `${ACCENT}14` }}
              >
                <ExamLogo slug={exam.slug} className="w-3.5 h-3.5 rounded-xs" size={14} />
                <span>{exam.category}</span>
              </span>
            </div>

            <h1 className="mt-4 text-[30px] sm:text-[40px] lg:text-[46px] leading-[1.1] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white flex items-center gap-3.5 flex-wrap">
              <ExamLogo slug={exam.slug} className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl shadow-xs shrink-0" size={44} />
              <span>{exam.fullName}</span>
            </h1>
            <p className="mt-2 text-[15px] text-slate-400 dark:text-gray-500">
              Conducted by {exam.conductedBy}
            </p>
            <p className="mt-5 text-[16px] sm:text-[17px] leading-relaxed text-slate-600 dark:text-gray-300">
              {exam.about}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                state={{ intent: exam.name }}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-semibold text-slate-900 shadow-sm transition-transform hover:scale-[1.02]"
                style={{ background: ACCENT }}
              >
                Start preparing for {exam.name}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-5 py-3 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                See pricing
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.05} className="mt-16">
            <Eyebrow>Exam pattern</Eyebrow>
            <p className="mt-3 text-[15.5px] leading-relaxed text-slate-600 dark:text-gray-300">
              {exam.structure}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-14">
            <Eyebrow>How Sadhya helps with {exam.name}</Eyebrow>
            <ul className="mt-4 space-y-3">
              {exam.howSadhyaHelps.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: ACCENT }} strokeWidth={2} />
                  <span className="text-[15px] leading-relaxed text-slate-600 dark:text-gray-300">{point}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.15} className="mt-16 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-[19px] font-semibold text-slate-900 dark:text-white">
              Ready to start {exam.name} preparation?
            </h2>
            <p className="mt-2 text-[14.5px] text-slate-500 dark:text-gray-400">
              Photograph a question, ask a doubt, or generate a practice test — Sadhya adapts to where you actually are in {exam.name}, not a generic syllabus.
            </p>
            <Link
              to="/signup"
              state={{ intent: exam.name }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-semibold text-slate-900 shadow-sm transition-transform hover:scale-[1.02]"
              style={{ background: ACCENT }}
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Reveal>

          {others.length > 0 && (
            <Reveal delay={0.2} className="mt-16">
              <Eyebrow>Other exams Sadhya covers</Eyebrow>
              <div className="mt-4 flex flex-wrap gap-2">
                {others.map((e) => (
                  <Link
                    key={e.slug}
                    to={`/exams/${e.slug}`}
                    className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[13px] font-medium text-slate-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/25 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <ExamLogo slug={e.slug} className="w-6 h-6 shrink-0 object-contain transition-transform group-hover:scale-110" size={24} />
                    <span>{e.name}</span>
                  </Link>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
