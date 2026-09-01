import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { cn } from '../../lib/utils';
import {
  SITE,
  PRO_MONTHLY_INR,
  PRO_YEARLY_PER_MONTH_INR,
  PRO_YEARLY_TOTAL_INR,
  PRO_REGULAR_MONTHLY_INR,
  PRO_REGULAR_YEARLY_TOTAL_INR,
} from '../../lib/siteConfig';
import { Underline } from './Annotate';

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
      '100 AI Chat messages / month with step-by-step reasoning',
      '15 minutes / month of Realtime Voice Tutoring',
      '5 Document / PDF uploads (up to 10MB per file)',
      '1 AI Podcast Studio episode / month (preview mode)',
      '3 AI-generated mock tests / month + Unlimited PYQs',
      'Unlimited community discussions, peer study chats & leaderboard',
      'English, Hindi and Hinglish support',
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
      'Up to 2,000 AI Chat messages / month with deep GraphRAG reasoning',
      'Up to 300 minutes (5 hours) / month of Realtime Voice Tutoring',
      'Up to 100 Document / PDF uploads (up to 50MB per file with OCR)',
      '25 AI Podcast Studio episodes with dual-voice cinematic mix & SFX',
      'Up to 1,000 AI adaptive mock tests with weakness heatmaps',
      'Priority fast-lane processing with flagship AI routing',
      'Priority human support · 7-Day 100% Refund Policy',
    ],
    cta: { label: 'Get Pro (Launch Offer)', to: '/checkout?plan=pro' },
    featured: true,
    footnote: 'Lock in this launch rate. 7-Day 100% Refund Policy — see applicable terms.',
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
    title: 'AI Tutoring, Voice & Core Intelligence',
    rows: [
      {
        feature: 'Monthly AI Chat & Doubt Solving',
        hint: 'Context-rich conversational turns with multi-stage reasoning traces',
        free: '100 / month',
        pro: 'Up to 2,000 / month',
        institution: 'Custom Cohort Volume',
      },
      {
        feature: 'Realtime Voice AI Tutoring',
        hint: 'Live spoken conversation with instant spoken explanations and doubt resolution',
        free: '15 min / month',
        pro: 'Up to 300 min (5 hrs) / month',
        institution: 'Unlimited Voice Seats',
      },
      {
        feature: 'Multi-Stage Reasoning Traces',
        hint: 'Step-by-step transparent thought process showing logic and formula derivations',
        free: true,
        pro: true,
        institution: true,
      },
      {
        feature: 'Official Syllabus Grounding',
        hint: 'RAG verification against official exam notices (SSC, UPSC, JEE, NEET, Banking, State PSCs)',
        free: true,
        pro: true,
        institution: 'Canonical + Custom Bank',
      },
      {
        feature: 'Camera Snap & Solve OCR',
        hint: 'Photo-to-solution for printed or handwritten questions with LaTeX math',
        free: true,
        pro: true,
        institution: true,
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
        free: '1 episode / month (preview)',
        pro: '25 episodes / month',
        institution: 'Custom Cohort Volume',
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
        free: 'Preview mode',
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
        feature: 'Official Topic-wise PYQ Practice Sets',
        hint: 'Official past year question bank with instant detailed solutions',
        free: 'Unlimited Free',
        pro: 'Unlimited Free',
        institution: 'Unlimited Free',
      },
      {
        feature: 'Full-Length Adaptive AI Mock Tests',
        hint: 'Exam interface, timed sections, negative marking, and real-time difficulty adaptation',
        free: '3 AI tests / month',
        pro: 'Up to 1,000 / month',
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
        feature: 'Monthly Document / PDF Uploads',
        hint: 'Dedicated RAG workspaces grounded strictly in your syllabus or notes',
        free: '5 documents / month',
        pro: 'Up to 100 documents / month',
        institution: 'Unlimited Shared',
      },
      {
        feature: 'Max PDF Upload File Size',
        hint: 'Upload coaching modules, handwritten scans, or standard reference books',
        free: '10 MB / file',
        pro: '50 MB / file (with OCR)',
        institution: '100 MB / file',
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
    title: 'Community, Study Circles & Automation',
    rows: [
      {
        feature: 'Community Forums & Peer Chat',
        hint: 'Discussion boards, doubt groups, study circles, and national leaderboards',
        free: 'Unlimited Free',
        pro: 'Unlimited Free',
        institution: 'Custom Cohort Circles',
      },
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
        free: 'Community & AI Guide',
        pro: 'Priority Human Support',
        institution: 'Dedicated Account Lead',
      },
      {
        feature: 'Refund Policy',
        hint: '100% full refund directly to original payment source with 1-click self-service',
        free: '—',
        pro: '7-Day 100% Refund Policy',
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
  showComparison = true,
}: {
  id?: string;
  headingAs?: 'h1' | 'h2';
  showComparison?: boolean;
}) {
  const { user, role } = useAuth();
  const [billing, setBilling] = useState<Billing>('yearly');
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const reduced = useReducedMotion();

  return (
    <section id={id} className="scroll-mt-16 max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-24">
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
        <Heading className="mt-3 text-[26px] sm:text-[34px] lg:text-[40px] leading-[1.15] font-semibold tracking-[-0.03em]">
          Start <Underline>free</Underline>. Upgrade when it&rsquo;s carrying real weight.
        </Heading>
        <p className="mt-3 sm:mt-4 text-[14.5px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
          The tutor, your notebooks and the practice engine are free to use. Pro lifts the limits
          and adds the studio — for the months when preparation stops being casual.
        </p>
      </div>

      {/* ── Billing toggle ── */}
      <div className="mt-7 sm:mt-9 inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] touch-manipulation">
        {(['monthly', 'yearly'] as Billing[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBilling(b)}
            aria-pressed={billing === b}
            className={cn(
              'relative h-9 px-3.5 sm:px-4 rounded-lg text-[13px] sm:text-[13.5px] font-medium transition-colors cursor-pointer touch-manipulation',
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
              <span className="relative ml-1.5 sm:ml-2 text-[11px] sm:text-[11.5px] font-semibold text-[#7d9a1f] dark:text-[#c8e558]">
                −70% Launch
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tiers Grid ── */}
      <div className="mt-8 grid gap-5 lg:grid-cols-3 items-stretch">
        {TIERS.map((tier) => {
          let to = tier.cta.to && tier.id === 'pro' ? `${tier.cta.to}&billing=${billing}` : tier.cta.to;
          let label = tier.cta.label;
          if (tier.id === 'free' && user) {
            to = role === 'teacher' ? '/teach' : '/dashboard';
            label = 'Go to Dashboard';
          }
          return (
            <motion.div
              key={tier.id}
              whileHover={reduced ? undefined : { y: -8, scale: 1.015 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className={cn(
                'relative flex flex-col rounded-2xl border p-5 sm:p-7 transition-all',
                tier.featured
                  ? 'border-[#c8e558] dark:border-[#c8e558]/60 bg-white dark:bg-[#141416] shadow-[0_18px_50px_-24px_rgba(140,170,40,0.4)] lg:-mt-2 lg:pb-8 hover:shadow-[0_24px_60px_-20px_rgba(140,170,40,0.5)]'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] shadow-xs hover:shadow-lg hover:border-slate-300 dark:hover:border-white/20',
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-5 sm:left-7 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#c8e558] text-slate-900 text-[11.5px] font-semibold shadow-xs">
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                  {tier.badge || 'Launch Special'}
                </span>
              )}

              <div>
                <h3 className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                  {tier.name}
                </h3>
                <p className="mt-1.5 text-[13.5px] text-slate-500 dark:text-gray-400 leading-relaxed min-h-[2.5rem]">
                  {tier.tagline}
                </p>
              </div>

              <div className="mt-4 sm:mt-5">
                <Price tier={tier} billing={billing} />
              </div>

              {to ? (
                <Link
                  to={to}
                  className={cn(
                    'mt-5 sm:mt-6 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-semibold transition-colors touch-manipulation cursor-pointer',
                    tier.featured
                      ? 'bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900'
                      : 'border border-slate-200 dark:border-white/12 text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                  )}
                >
                  {label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </Link>
              ) : (
                <a
                  href={tier.cta.href}
                  className="mt-5 sm:mt-6 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 dark:border-white/12 text-[14px] font-semibold text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors touch-manipulation"
                >
                  {label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </a>
              )}

              <ul className="mt-6 space-y-2.5 sm:space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2.5 items-start">
                    <Check
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        tier.featured ? 'text-[#7d9a1f] dark:text-[#c8e558]' : 'text-slate-400 dark:text-gray-500',
                      )}
                      strokeWidth={2.5}
                    />
                    <span className="text-[13px] sm:text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {tier.footnote && (
                <p className="mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.07] text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
                  {tier.footnote}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── Sleek Side-by-Side Feature Comparison Matrix ── */}
      {showComparison && (
        <div className="mt-14 sm:mt-20 pt-8 sm:pt-10 border-t border-slate-100 dark:border-white/[0.07]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
            <div>
              <h3 className="text-[19px] sm:text-[24px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                Compare features across plans
              </h3>
              <p className="mt-1 text-[13px] sm:text-[13.5px] text-slate-500 dark:text-gray-400">
                A detailed overview of capabilities, quotas, and limits.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="sm:hidden text-[11px] text-slate-400 dark:text-gray-500">
                Swipe table horizontally ↔
              </span>
              <button
                type="button"
                onClick={() => setIsTableExpanded(!isTableExpanded)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-[12.5px] font-medium text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 touch-manipulation"
              >
                {isTableExpanded ? 'Hide comparison' : 'Show comparison'}
                <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', isTableExpanded && 'rotate-180')} />
              </button>
            </div>
          </div>

          {isTableExpanded && (
            <div className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] overflow-hidden shadow-sm">
              {/* Table Wrapper: touch-auto and smooth horizontal scrolling without blocking page vertical scrolling */}
              <div
                className="w-full overflow-x-auto touch-auto custom-scrollbar"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <table className="w-full text-left border-collapse min-w-[520px] sm:min-w-[640px]">
                  {/* Header */}
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-white/[0.04]">
                      <th className="py-3.5 px-3.5 sm:px-5 text-[12.5px] sm:text-[13.5px] font-semibold text-slate-900 dark:text-white sticky left-0 z-20 bg-slate-50 dark:bg-[#18181b] min-w-[130px] sm:min-w-[220px] shadow-[1px_0_0_0_rgba(0,0,0,0.06)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.08)]">
                        Feature
                      </th>
                      <th className="py-3.5 px-2.5 sm:px-4 text-[12.5px] sm:text-[13px] font-semibold text-slate-900 dark:text-white text-center min-w-[85px] sm:min-w-[110px]">
                        Free
                      </th>
                      <th className="py-3.5 px-2.5 sm:px-4 text-[12.5px] sm:text-[13px] font-semibold text-[#728c1c] dark:text-[#c8e558] text-center bg-[#c8e558]/[0.08] min-w-[95px] sm:min-w-[120px]">
                        Pro (Launch)
                      </th>
                      <th className="py-3.5 px-2.5 sm:px-4 text-[12.5px] sm:text-[13px] font-semibold text-slate-900 dark:text-white text-center min-w-[85px] sm:min-w-[110px]">
                        Institution
                      </th>
                    </tr>
                  </thead>

                  {/* Body */}
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                    {COMPARISON_CATEGORIES.map((category) => (
                      <Fragment key={category.title}>
                        {/* Category Header */}
                        <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                          <td
                            colSpan={4}
                            className="py-2.5 px-3.5 sm:px-5 text-[11px] sm:text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400 sticky left-0 z-10 bg-slate-50/95 dark:bg-[#18181b]/95"
                          >
                            {category.title}
                          </td>
                        </tr>

                        {/* Category Items */}
                        {category.rows.map((row) => (
                          <tr
                            key={row.feature}
                            className="hover:bg-slate-50/50 dark:hover:bg-white/[0.015] transition-colors"
                          >
                            <td className="py-3 px-3.5 sm:px-5 sticky left-0 z-10 bg-white dark:bg-[#141416] shadow-[1px_0_0_0_rgba(0,0,0,0.06)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.08)]">
                              <div className="text-[12.5px] sm:text-[13.5px] font-medium text-slate-800 dark:text-gray-200">
                                {row.feature}
                              </div>
                              {row.hint && (
                                <div className="text-[10.5px] sm:text-[11.5px] text-slate-400 dark:text-gray-500 mt-0.5 leading-snug">
                                  {row.hint}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2.5 sm:px-4 text-center">
                              <ValueCell val={row.free} />
                            </td>
                            <td className="py-3 px-2.5 sm:px-4 text-center bg-[#c8e558]/[0.03]">
                              <ValueCell val={row.pro} />
                            </td>
                            <td className="py-3 px-2.5 sm:px-4 text-center">
                              <ValueCell val={row.institution} />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer notes ── */}
      <p className="mt-8 text-[12px] sm:text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
        Payments are processed by Razorpay — card details never touch our servers. Backed by our{' '}
        <Link to="/refunds" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white font-semibold">
          7-Day 100% Refund Policy
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
