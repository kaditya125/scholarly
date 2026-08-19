import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Compass, Layers, ShieldCheck } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';

/**
 * About page.
 *
 * Contains no invented company history — no founding date, headcount, investor list,
 * user count or customer logos, because none of that is established anywhere in this
 * repository and a marketing page is exactly where such claims become load-bearing.
 * It describes what the product does and the principles it is built on, both of which
 * are verifiable in the codebase.
 */

const PRINCIPLES = [
  {
    icon: Eye,
    title: 'Show the working',
    body: 'Every answer carries the sources it was built from and the six steps taken to reach it. If a student can’t check the reasoning, they’re being asked to trust a black box — which is exactly the habit an exam punishes.',
  },
  {
    icon: Compass,
    title: 'Built for a specific syllabus',
    body: 'A general assistant knows a little about everything. Sadhya is tuned to the exams students here actually sit — the pattern, the marking scheme, the prescribed texts — because that specificity is the difference between an interesting answer and a useful one.',
  },
  {
    icon: Layers,
    title: 'Capabilities, not roles',
    body: 'We don’t split the product into a student version and a teacher version. Everyone gets the same tools; a teaching profile changes how the AI drafts for you, rather than unlocking a separate app. Teachers augment the system — they aren’t bolted onto the side of it.',
  },
  {
    icon: ShieldCheck,
    title: 'Say only what’s true',
    body: 'No invented success rates, no stock-photo testimonials, no features listed before they work. When something is still being built, this site says so — including on this page.',
  },
];

export default function About() {
  useSeo({
    title: `About — ${SITE.name}`,
    description: `${SITE.name} (साध्य) is Sanskrit for "that which is to be attained" — an AI-first learning platform built around India's competitive exams, from NEET and JEE to UPSC, SSC and state teaching exams.`,
    url: `${SITE.url}/about`,
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />

      <main>
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 sm:pb-20">
          <div className="max-w-[42rem]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
              About
            </p>
            <h1 className="mt-3 text-[34px] sm:text-[46px] lg:text-[52px] leading-[1.07] font-semibold tracking-[-0.035em]">
              Most students don&rsquo;t need more content. They need someone to explain it.
            </h1>
            <p className="mt-6 text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              There is no shortage of material for NEET, JEE, UPSC or a Class 12 board paper. There
              are more books, videos and question banks than anyone could work through in a decade.
              What&rsquo;s scarce is someone patient enough to explain the same idea a third time, in
              the way that finally lands, at the exact level you&rsquo;re at.
            </p>
            <p className="mt-5 text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              That is the whole of what Sadhya is trying to be — and the reason it insists on
              showing you where every answer came from.
            </p>
          </div>
        </section>

        <section className="border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
            <h2 className="text-[24px] sm:text-[30px] leading-[1.15] font-semibold tracking-[-0.03em] max-w-[28rem]">
              What we hold to.
            </h2>

            <div className="mt-10 grid sm:grid-cols-2 gap-8 sm:gap-x-12 sm:gap-y-10">
              {PRINCIPLES.map((p) => (
                <div key={p.title}>
                  <span className="inline-flex w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] items-center justify-center">
                    <p.icon className="w-[18px] h-[18px] text-slate-700 dark:text-gray-300" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-4 text-[16.5px] font-semibold tracking-[-0.015em]">{p.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <div className="max-w-[42rem]">
            <h2 className="text-[24px] sm:text-[30px] leading-[1.15] font-semibold tracking-[-0.03em]">
              Where we are right now.
            </h2>
            <p className="mt-5 text-[15.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              The tutor, notebooks, scan-and-solve, practice, the adaptive baseline assessment, the
              podcast studio and the community are live and in use today. Teacher profiles are live;
              classes, cohorts and publishing to your own students are being built next.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              We would rather tell you that plainly than show you a dashboard that doesn&rsquo;t do
              anything yet.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[14.5px] font-semibold transition-colors"
              >
                Start learning
                <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
