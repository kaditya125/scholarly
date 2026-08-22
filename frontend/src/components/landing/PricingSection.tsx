import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  SITE,
  PRO_MONTHLY_INR,
  PRO_YEARLY_PER_MONTH_INR,
  PRO_YEARLY_TOTAL_INR,
  PRO_REGULAR_MONTHLY_INR,
  PRO_REGULAR_YEARLY_TOTAL_INR,
} from '../../lib/siteConfig';

type Billing = 'monthly' | 'yearly';

interface Tier {
  id: string;
  name: string;
  badge?: string;
  tagline: string;
  priceMonthly: number | null; // null → "custom"
  regularPriceMonthly?: number;
  features: string[];
  cta: { label: string; to?: string; href?: string };
  featured?: boolean;
  footnote?: string;
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free Starter',
    tagline: 'Essential AI study companion for every student.',
    priceMonthly: 0,
    features: [
      '25 AI tutoring queries / day with step-by-step reasoning',
      'Official syllabus grounding (SSC, UPSC, JEE, NEET, State PSCs)',
      '10 Camera Snap & Solve questions / day',
      '3 Smart Notebooks (up to 25MB per document)',
      'Topic-wise PYQ practice quizzes & baseline assessment',
      'Discussions, study groups and the leaderboard',
      'English, Hindi and Hinglish',
    ],
    cta: { label: 'Start free', to: '/signup' },
    footnote: 'No card required.',
  },
  {
    id: 'pro',
    name: 'Sadhya Pro',
    badge: 'Launch Special · 60% Off',
    tagline: 'Uncapped intelligence & creative studios for serious aspirants.',
    priceMonthly: PRO_MONTHLY_INR,
    regularPriceMonthly: PRO_REGULAR_MONTHLY_INR,
    features: [
      'Unlimited AI tutoring & reasoning queries across all exams',
      'Dual-Voice AI Podcast Studio — turn notes/PDFs into audio',
      'Unlimited Camera Snap & Solve with LaTeX math derivations',
      'Unlimited Smart Notebooks (up to 200MB per file with full OCR)',
      'Full-length adaptive mock tests with National Percentile',
      'AI Video Lesson generator & visual Mind Map / Slide creator',
      'Automation Studio — daily scheduled revision workflows',
      'Priority fast-lane processing with flagship AI routing',
      'Priority support from a human',
    ],
    cta: { label: 'Get Pro (Launch Offer)', to: '/checkout?plan=pro' },
    featured: true,
    footnote: 'Lock in this launch rate for life. 7-day refund guarantee.',
  },
  {
    id: 'institution',
    name: 'Institution',
    tagline: 'For schools, coaching centres and batch educators.',
    priceMonthly: null,
    features: [
      'Bulk student seats with central license management',
      'Full Teacher LMS Workspace with live classes & student tracking',
      'Custom question banks & canonical institutional curriculum upload',
      'Automated assessment grading & cohort performance heatmaps',
      'Custom institutional branding on podcasts, notes & video lessons',
      'Dedicated Account Manager, invoicing & PO support',
    ],
    cta: { label: 'Talk to us', href: `mailto:${SITE.email.sales}?subject=Sadhya%20for%20Institutions%20%E2%80%94%20Launch%20Inquiry` },
    footnote: 'Priced per seat, based on cohort size.',
  },
];

interface ComparisonRow {
  feature: string;
  hint?: string;
  free: string | boolean;
  pro: string | boolean;
  institution: string | boolean;
}

interface ComparisonCategory {
  title: string;
  rows: ComparisonRow[];
}

const COMPARISON_CATEGORIES: ComparisonCategory[] = [
  {
    title: 'AI Tutoring & Core Intelligence',
    rows: [
      {
        feature: 'Daily AI Tutoring Queries',
        hint: 'Context-rich conversational turns with memory profile grounding',
        free: '25 / day',
        pro: 'Unlimited',
        institution: 'Unlimited',
      },
      {
        feature: 'Multi-Stage Reasoning Traces',
        hint: 'Step-by-step transparent thought process showing logic and SCERT graph traversal',
        free: true,
        pro: true,
        institution: true,
      },
      {
        feature: 'Official Syllabus Grounding',
        hint: 'RAG verification against official gazette notices (SSC, UPSC, JEE, NEET, Banking, State PSCs)',
        free: true,
        pro: true,
        institution: 'Canonical + Custom Bank',
      },
      {
        feature: 'Camera Snap & Solve OCR',
        hint: 'Photo-to-solution for printed or handwritten questions with LaTeX math',
        free: '10 / day',
        pro: 'Unlimited',
        institution: 'Unlimited',
      },
      {
        feature: 'Multi-LLM Flagship Routing',
        hint: 'Access to Gemini 2.5 Pro, high-throughput Groq, and specialized reasoning models',
        free: 'Standard Fast',
        pro: 'Flagship + Fast Lane',
        institution: 'Flagship + Dedicated',
      },
      {
        feature: 'Multilingual Explanations',
        hint: 'Seamless explanations in English, Hindi, and natural Hinglish mix',
        free: true,
        pro: true,
        institution: true,
      },
    ],
  },
  {
    title: 'Audio, Video & Creative Studios',
    rows: [
      {
        feature: 'Dual-Voice AI Podcast Studio',
        hint: 'Turns any topic, syllabus module, or uploaded PDF into 2-speaker audio conversations',
        free: '3 preview / mo',
        pro: 'Unlimited Studio',
        institution: 'Unlimited + Voice Cloning',
      },
      {
        feature: 'MP3 Podcast Download & Offline Play',
        hint: 'Listen on the go during commute and revision',
        free: false,
        pro: true,
        institution: true,
      },
      {
        feature: 'AI Video Lesson Generator',
        hint: 'Synthesizes structured animated video lessons with voice narration and slides',
        free: 'Preview only',
        pro: 'Full Generator',
        institution: 'Full + Batch Export',
      },
      {
        feature: 'Interactive Mind Maps & Diagrams',
        hint: 'Automated nested concept maps, timelines, and downloadable SVGs',
        free: 'Basic text',
        pro: 'Interactive Visual',
        institution: 'Interactive Visual',
      },
      {
        feature: 'Presentation Slide Deck Creator',
        hint: 'Generates complete lecture slides with bullet points and speaker notes',
        free: 'Text outline',
        pro: 'Full Deck + Export',
        institution: 'Custom Template Decks',
      },
    ],
  },
  {
    title: 'Adaptive Mock Tests & Assessment',
    rows: [
      {
        feature: 'Topic-wise PYQ Practice Sets',
        hint: 'Official past year question bank with instant detailed solutions',
        free: '5 tests / day',
        pro: 'Unlimited',
        institution: 'Unlimited',
      },
      {
        feature: 'Full-Length Adaptive Mock Tests',
        hint: 'Exact exam interface, timed sections, negative marking, and real-time difficulty adaptation',
        free: '1 baseline mock',
        pro: 'Unlimited Mocks',
        institution: 'Custom Test Series',
      },
      {
        feature: 'National Percentile & Rank Estimation',
        hint: 'Real-time cohort percentile calculation benchmarked against past exam qualifiers',
        free: false,
        pro: true,
        institution: 'Cohort + National',
      },
      {
        feature: 'Weak-Topic Diagnostic Heatmaps',
        hint: 'Granular topic-level accuracy, speed velocity, and targeted drill recommendations',
        free: 'Basic summary',
        pro: 'Deep Analytics',
        institution: 'Institutional Matrix',
      },
    ],
  },
  {
    title: 'Smart Notebooks & Document Hub',
    rows: [
      {
        feature: 'Smart Document Notebooks',
        hint: 'Dedicated RAG workspaces grounded strictly in your syllabus or notes',
        free: '3 Notebooks',
        pro: 'Unlimited',
        institution: 'Unlimited Shared',
      },
      {
        feature: 'Max PDF Upload Size',
        hint: 'Upload coaching modules, handwritten scans, or standard reference books',
        free: '25 MB / file',
        pro: '200 MB / file',
        institution: '500 MB / file',
      },
      {
        feature: 'Exact Document Citations & Page Jump',
        hint: 'Click any citation to highlight the source sentence and page number inside your PDF',
        free: true,
        pro: true,
        institution: true,
      },
      {
        feature: 'Instant Flashcard & Worksheet Generator',
        hint: 'Extract high-yield Q&A pairs directly from uploaded notes in seconds',
        free: 'Basic',
        pro: 'Unlimited High-Yield',
        institution: 'Batch Question Bank',
      },
    ],
  },
  {
    title: 'Automation & Productivity Workflows',
    rows: [
      {
        feature: 'Automation Studio Revision Workflows',
        hint: 'Scheduled daily spaced-repetition quizzes delivered automatically to your dashboard',
        free: false,
        pro: true,
        institution: 'Institute Automation',
      },
      {
        feature: 'Dynamic AI Study Planner',
        hint: 'Self-adjusting exam timeline based on your real test scores and syllabus deadlines',
        free: 'Static plan',
        pro: 'Adaptive Real-Time',
        institution: 'Batch Calendar Sync',
      },
      {
        feature: 'Private Study Rooms & Collaborative Notes',
        hint: 'Host real-time study sessions with friends with shared AI notes and whiteboard',
        free: 'Join only',
        pro: 'Host & Manage',
        institution: 'Virtual Classrooms',
      },
    ],
  },
  {
    title: 'Performance, Security & Support',
    rows: [
      {
        feature: 'GPU Processing Queue Priority',
        hint: 'Fast lane execution without wait times during peak exam preparation hours',
        free: 'Standard',
        pro: 'Priority Fast-Lane',
        institution: 'Dedicated Cluster',
      },
      {
        feature: 'Customer Support',
        hint: 'Direct assistance for questions, study guidance, and platform help',
        free: 'Community & Guide',
        pro: 'Priority Human Support',
        institution: 'Dedicated Account Lead',
      },
      {
        feature: 'Refund Guarantee',
        hint: 'No questions asked money-back window',
        free: '—',
        pro: '7-Day Full Refund',
        institution: 'Custom SLA Contract',
      },
    ],
  },
];

function Price({ tier, billing }: { tier: Tier; billing: Billing }) {
  if (tier.priceMonthly === null) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[34px] sm:text-[38px] leading-none font-semibold tracking-[-0.03em]">Custom</span>
      </div>
    );
  }
  if (tier.priceMonthly === 0) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[34px] sm:text-[38px] leading-none font-semibold tracking-[-0.03em]">₹0</span>
        <span className="text-[13.5px] text-slate-500 dark:text-gray-400">forever</span>
      </div>
    );
  }
  const perMonth = billing === 'yearly' ? PRO_YEARLY_PER_MONTH_INR : PRO_MONTHLY_INR;
  const regularPerMonth = PRO_REGULAR_MONTHLY_INR;
  const yearlyTotal = PRO_YEARLY_TOTAL_INR;

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[34px] sm:text-[38px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
          ₹{perMonth}
        </span>
        <span className="text-[13.5px] text-slate-500 dark:text-gray-400">/month</span>
        <span className="text-[13.5px] line-through text-slate-400 dark:text-gray-500 font-normal">
          ₹{regularPerMonth}/mo
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 min-h-[1.25rem]">
        {billing === 'yearly' ? (
          <span>
            ₹{yearlyTotal.toLocaleString('en-IN')} billed once a year <span className="text-[#7d9a1f] dark:text-[#c8e558] font-medium">(Save 70%)</span>
          </span>
        ) : (
          'Billed monthly · Cancel anytime'
        )}
      </p>
    </div>
  );
}

function ValueCell({ val }: { val: string | boolean }) {
  if (typeof val === 'boolean') {
    return val ? (
      <span className="inline-flex items-center justify-center text-[#728c1c] dark:text-[#c8e558]">
        <Check className="w-4 h-4" strokeWidth={2.5} />
      </span>
    ) : (
      <span className="text-slate-300 dark:text-gray-600 font-light">—</span>
    );
  }
  return (
    <span className="text-[13px] text-slate-700 dark:text-gray-200">
      {val}
    </span>
  );
}

export default function PricingSection({
  id = 'pricing',
  headingAs: Heading = 'h2',
}: {
  id?: string;
  headingAs?: 'h1' | 'h2';
}) {
  const [billing, setBilling] = useState<Billing>('yearly');
  const [showComparison, setShowComparison] = useState(true);
  const reduced = useReducedMotion();

  return (
    <section id={id} className="scroll-mt-16 max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
      {/* ── Launch Callout (Minimalist & Sleek) ── */}
      <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#c8e558] text-slate-900 shrink-0">
            Launch Special
          </span>
          <p className="text-[13px] text-slate-600 dark:text-gray-300">
            Flat <strong>60% off</strong> on Pro for early adopters. Grandfathered rate locked in for life.
          </p>
        </div>

        <Link
          to="/checkout?plan=pro&billing=yearly"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-900 dark:text-white underline underline-offset-4 hover:opacity-80 transition-opacity shrink-0"
        >
          Claim ₹149/mo pass <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── Heading Block ── */}
      <div className="max-w-[36rem]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
          Plans
        </p>
        <Heading className="mt-3 text-[28px] sm:text-[34px] lg:text-[40px] leading-[1.12] font-semibold tracking-[-0.03em]">
          Start free. Upgrade when it&rsquo;s carrying real weight.
        </Heading>
        <p className="mt-4 text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
          The tutor, your notebooks and the practice engine are free to use. Pro lifts the limits
          and adds the studio — for the months when preparation stops being casual.
        </p>
      </div>

      {/* ── Billing toggle ── */}
      <div className="mt-9 inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
        {(['monthly', 'yearly'] as Billing[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBilling(b)}
            aria-pressed={billing === b}
            className={cn(
              'relative h-9 px-4 rounded-lg text-[13.5px] font-medium transition-colors cursor-pointer',
              billing === b
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200',
            )}
          >
            {billing === b && (
              <motion.span
                layoutId="billing-pill"
                className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.09] shadow-sm"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative capitalize">{b}</span>
            {b === 'yearly' && (
              <span className="relative ml-2 text-[11.5px] font-semibold text-[#7d9a1f] dark:text-[#c8e558]">
                −70% Launch
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tiers Grid ── */}
      <div className="mt-8 grid gap-4 sm:gap-5 lg:grid-cols-3 items-start">
        {TIERS.map((tier) => {
          const to = tier.cta.to && tier.id === 'pro' ? `${tier.cta.to}&billing=${billing}` : tier.cta.to;
          return (
            <div
              key={tier.id}
              className={cn(
                'relative h-full flex flex-col rounded-2xl border p-6 sm:p-7',
                tier.featured
                  ? 'border-[#c8e558] dark:border-[#c8e558]/60 bg-white dark:bg-[#141416] shadow-[0_18px_50px_-24px_rgba(140,170,40,0.4)] lg:-mt-3 lg:pb-9'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]',
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-6 sm:left-7 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#c8e558] text-slate-900 text-[11.5px] font-semibold">
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                  {tier.badge || 'Launch Special'}
                </span>
              )}

              <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-white">
                {tier.name}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 min-h-[2.6rem]">
                {tier.tagline}
              </p>

              <div className="mt-5 min-h-[4.2rem]">
                <Price tier={tier} billing={billing} />
              </div>

              {to ? (
                <Link
                  to={to}
                  className={cn(
                    'mt-6 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-semibold transition-colors',
                    tier.featured
                      ? 'bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900'
                      : 'border border-slate-200 dark:border-white/12 text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                  )}
                >
                  {tier.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </Link>
              ) : (
                <a
                  href={tier.cta.href}
                  className="mt-6 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 dark:border-white/12 text-[14px] font-semibold text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  {tier.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </a>
              )}

              <ul className="mt-7 space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        tier.featured ? 'text-[#7d9a1f] dark:text-[#c8e558]' : 'text-slate-400 dark:text-gray-500',
                      )}
                      strokeWidth={2.5}
                    />
                    <span className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {tier.footnote && (
                <p className="mt-6 pt-5 border-t border-slate-100 dark:border-white/[0.07] text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
                  {tier.footnote}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Sleek Side-by-Side Feature Comparison Matrix ── */}
      <div className="mt-20 pt-10 border-t border-slate-100 dark:border-white/[0.07]">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-[20px] sm:text-[24px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
              Compare features across plans
            </h3>
            <p className="mt-1 text-[13.5px] text-slate-500 dark:text-gray-400">
              A detailed overview of capabilities, quotas, and limits.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowComparison(!showComparison)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            {showComparison ? 'Hide table' : 'Show table'}
            <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', showComparison && 'rotate-180')} />
          </button>
        </div>

        {showComparison && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]">
            <table className="w-full text-left border-collapse min-w-[640px]">
              {/* Header */}
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
                  <th className="py-3.5 px-5 text-[13.5px] font-semibold text-slate-900 dark:text-white w-[42%]">
                    Feature
                  </th>
                  <th className="py-3.5 px-4 text-[13px] font-semibold text-slate-900 dark:text-white w-[19%] text-center">
                    Free
                  </th>
                  <th className="py-3.5 px-4 text-[13px] font-semibold text-[#728c1c] dark:text-[#c8e558] w-[20%] text-center bg-[#c8e558]/[0.06]">
                    Pro (Launch)
                  </th>
                  <th className="py-3.5 px-4 text-[13px] font-semibold text-slate-900 dark:text-white w-[19%] text-center">
                    Institution
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {COMPARISON_CATEGORIES.map((category) => (
                  <Fragment key={category.title}>
                    {/* Category Header */}
                    <tr className="bg-slate-50/40 dark:bg-white/[0.015]">
                      <td colSpan={4} className="py-2.5 px-5 text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                        {category.title}
                      </td>
                    </tr>

                    {/* Category Items */}
                    {category.rows.map((row) => (
                      <tr
                        key={row.feature}
                        className="hover:bg-slate-50/40 dark:hover:bg-white/[0.015] transition-colors"
                      >
                        <td className="py-3 px-5">
                          <div className="text-[13.5px] text-slate-800 dark:text-gray-200">
                            {row.feature}
                          </div>
                          {row.hint && (
                            <div className="text-[11.5px] text-slate-400 dark:text-gray-500 mt-0.5">
                              {row.hint}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ValueCell val={row.free} />
                        </td>
                        <td className="py-3 px-4 text-center bg-[#c8e558]/[0.03]">
                          <ValueCell val={row.pro} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ValueCell val={row.institution} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer notes ── */}
      <p className="mt-8 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
        Payments are processed by Razorpay — card details never touch our servers. Includes 7-day money back guarantee. See our{' '}
        <Link to="/refunds" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white">
          refunds &amp; cancellation policy
        </Link>{' '}
        and{' '}
        <Link to="/terms" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white">
          terms
        </Link>
        .
      </p>
    </section>
  );
}
