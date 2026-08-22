import React, { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Check, X, ArrowRight, Sparkles, Zap, Flame, Shield, HelpCircle, ChevronDown } from 'lucide-react';
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
      '25 AI tutoring queries per day with full reasoning trace',
      'Official syllabus grounding (SSC, UPSC, JEE, NEET, State PSCs)',
      '10 Camera Snap & Solve OCR questions per day',
      '3 Smart Notebooks (up to 25MB per document)',
      'Topic-wise PYQ practice quizzes & baseline assessment',
      'Community study groups, discussions & leaderboards',
      'Full support for English, Hindi & Hinglish',
    ],
    cta: { label: 'Get started free', to: '/signup' },
    footnote: '100% free forever. No credit card required.',
  },
  {
    id: 'pro',
    name: 'Sadhya Pro',
    badge: '🚀 Launch Special — 60% Off',
    tagline: 'Uncapped intelligence & creative studios for serious aspirants.',
    priceMonthly: PRO_MONTHLY_INR,
    regularPriceMonthly: PRO_REGULAR_MONTHLY_INR,
    features: [
      'Unlimited AI tutoring & reasoning queries across all exams',
      'Dual-Voice AI Podcast Studio — turn notes/PDFs into 2-speaker audio',
      'Unlimited Camera Snap & Solve with step-by-step LaTeX working',
      'Unlimited Smart Notebooks (up to 200MB per file with full OCR)',
      'Full-length adaptive mock tests with National Percentile ranking',
      'AI Video Lesson generator & visual Mind Map / Slide creator',
      'Automation Studio — daily automated spaced-repetition revision',
      'Priority Fast-Lane processing with flagship LLM routing',
      'Priority 1-on-1 human support',
    ],
    cta: { label: 'Claim Launch Offer', to: '/checkout?plan=pro' },
    featured: true,
    footnote: 'Lock in this launch rate for life. 7-day money-back guarantee.',
  },
  {
    id: 'institution',
    name: 'Academy & Institution',
    tagline: 'For coaching centres, schools, colleges, and batch educators.',
    priceMonthly: null,
    features: [
      'Bulk student seats with central license management',
      'Full Teacher LMS Workspace with live classes & student tracking',
      'Custom question banks & canonical institutional curriculum upload',
      'Automated assessment grading & cohort performance heatmaps',
      'Custom institutional branding on podcasts, notes & video lessons',
      'Dedicated Account Manager, invoicing & PO support',
    ],
    cta: { label: 'Talk to Enterprise', href: `mailto:${SITE.email.sales}?subject=Sadhya%20for%20Institutions%20%E2%80%94%20Launch%20Inquiry` },
    footnote: 'Priced per seat based on batch size. Custom SLAs available.',
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
  icon: any;
  rows: ComparisonRow[];
}

const COMPARISON_CATEGORIES: ComparisonCategory[] = [
  {
    title: 'AI Tutoring & Core Intelligence',
    icon: Sparkles,
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
        hint: 'Photo-to-solution for complex printed or handwritten questions with LaTeX math',
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
    icon: Zap,
    rows: [
      {
        feature: 'Dual-Voice AI Podcast Studio',
        hint: 'Turns any topic, syllabus module, or uploaded PDF into engaging 2-speaker audio conversations',
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
    title: 'Adaptive Mock Tests & Assessment Engine',
    icon: Flame,
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
    icon: HelpCircle,
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
    icon: Sparkles,
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
    icon: Shield,
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
        pro: '24/7 Priority Human',
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
        <span className="text-[34px] sm:text-[38px] leading-none font-bold tracking-[-0.03em]">Custom</span>
      </div>
    );
  }
  if (tier.priceMonthly === 0) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[34px] sm:text-[38px] leading-none font-bold tracking-[-0.03em]">₹0</span>
        <span className="text-[13.5px] text-slate-500 dark:text-gray-400">forever</span>
      </div>
    );
  }
  const perMonth = billing === 'yearly' ? PRO_YEARLY_PER_MONTH_INR : PRO_MONTHLY_INR;
  const regularPerMonth = PRO_REGULAR_MONTHLY_INR;
  const yearlyTotal = PRO_YEARLY_TOTAL_INR;
  const regularYearlyTotal = PRO_REGULAR_YEARLY_TOTAL_INR;

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[34px] sm:text-[38px] leading-none font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
          ₹{perMonth}
        </span>
        <span className="text-[13.5px] text-slate-500 dark:text-gray-400">/month</span>
        <span className="text-[14px] line-through text-slate-400 dark:text-gray-500 font-normal">
          ₹{regularPerMonth}/mo
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 min-h-[1.25rem]">
        {billing === 'yearly' ? (
          <span>
            <strong className="text-slate-700 dark:text-gray-200">₹{yearlyTotal.toLocaleString('en-IN')}</strong> billed annually{' '}
            <span className="line-through text-slate-400 dark:text-gray-500">(₹{regularYearlyTotal.toLocaleString('en-IN')})</span>
          </span>
        ) : (
          'Billed monthly • Cancel anytime'
        )}
      </p>
    </div>
  );
}

function ValueCell({ val }: { val: string | boolean }) {
  if (typeof val === 'boolean') {
    return val ? (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#c8e558]/20 text-[#728c1c] dark:text-[#c8e558]">
        <Check className="w-4 h-4" strokeWidth={2.5} />
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-500">
        <X className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200">
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
    <section id={id} className="scroll-mt-16 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      {/* ── Launch Event Announcement Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#c8e558]/20 to-emerald-500/10 border border-[#c8e558]/40 dark:border-[#c8e558]/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-[#c8e558] text-slate-900 flex items-center justify-center shrink-0 shadow-sm font-bold text-sm">
            🚀
          </span>
          <div>
            <div className="text-[13px] sm:text-[14px] font-bold text-slate-900 dark:text-white flex items-center gap-2 justify-center sm:justify-start">
              <span>Sadhya 1.0 Launch Celebration Offer</span>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#c8e558] text-slate-900">
                LIMITED TIME
              </span>
            </div>
            <p className="text-[12px] sm:text-[12.5px] text-slate-600 dark:text-gray-300">
              Get <strong>60% off</strong> on Sadhya Pro. Lock in grandfathered pricing for your entire preparation journey.
            </p>
          </div>
        </div>

        <Link
          to="/checkout?plan=pro&billing=yearly"
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity shadow-xs"
        >
          Claim Launch Pass (₹149/mo) →
        </Link>
      </motion.div>

      {/* ── Heading Block ── */}
      <div className="max-w-[42rem]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-[#8ba32b] dark:text-[#c8e558]">
          Transparent Plans &amp; Launch Pricing
        </p>
        <Heading className="mt-2.5 text-[28px] sm:text-[36px] lg:text-[42px] leading-[1.12] font-bold tracking-[-0.03em]">
          Prepare without limits. Built for qualifiers.
        </Heading>
        <p className="mt-3.5 text-[15px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400">
          Start free with core reasoning and official syllabus practice. Upgrade to Pro for unlimited audio podcasts, full-length adaptive mocks, video lessons, and priority fast-lane computing.
        </p>
      </div>

      {/* ── Billing toggle ── */}
      <div className="mt-8 flex items-center gap-4 flex-wrap">
        <div className="inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
          {(['monthly', 'yearly'] as Billing[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBilling(b)}
              aria-pressed={billing === b}
              className={cn(
                'relative h-9 px-4 rounded-lg text-[13.5px] font-medium transition-colors cursor-pointer',
                billing === b
                  ? 'text-slate-900 dark:text-white font-semibold'
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
                <span className="relative ml-2 text-[11px] font-bold text-[#7d9a1f] dark:text-[#c8e558] bg-[#c8e558]/20 px-1.5 py-0.5 rounded-full">
                  SAVE 70%
                </span>
              )}
            </button>
          ))}
        </div>

        <span className="text-[12.5px] text-slate-500 dark:text-gray-400">
          💡 Annual billing includes an additional <strong>25% discount</strong> on top of launch rates.
        </span>
      </div>

      {/* ── Tiers Grid ── */}
      <div className="mt-8 grid gap-5 sm:gap-6 lg:grid-cols-3 items-stretch">
        {TIERS.map((tier) => {
          const to = tier.cta.to && tier.id === 'pro' ? `${tier.cta.to}&billing=${billing}` : tier.cta.to;
          return (
            <div
              key={tier.id}
              className={cn(
                'relative flex flex-col rounded-3xl border p-6 sm:p-7 transition-all',
                tier.featured
                  ? 'border-[#c8e558] dark:border-[#c8e558]/70 bg-white dark:bg-[#141416] shadow-[0_20px_60px_-20px_rgba(140,170,40,0.45)] lg:-mt-2 lg:pb-8 ring-1 ring-[#c8e558]/50'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]',
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3.5 left-6 sm:left-7 inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#c8e558] text-slate-950 text-[11.5px] font-bold shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {tier.badge || 'Launch Special'}
                </span>
              )}

              <h3 className="text-[18px] font-bold tracking-[-0.015em] text-slate-900 dark:text-white">
                {tier.name}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400 min-h-[2.4rem]">
                {tier.tagline}
              </p>

              <div className="mt-5 min-h-[4.2rem]">
                <Price tier={tier} billing={billing} />
              </div>

              {to ? (
                <Link
                  to={to}
                  className={cn(
                    'mt-6 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-bold transition-all shadow-xs active:scale-[0.98]',
                    tier.featured
                      ? 'bg-[#c8e558] hover:bg-[#bcd94c] text-slate-950 shadow-md shadow-[#c8e558]/20'
                      : 'border border-slate-200 dark:border-white/12 text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                  )}
                >
                  {tier.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </Link>
              ) : (
                <a
                  href={tier.cta.href}
                  className="mt-6 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 dark:border-white/12 text-[14px] font-bold text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  {tier.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </a>
              )}

              <ul className="mt-7 space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        tier.featured ? 'text-[#7d9a1f] dark:text-[#c8e558]' : 'text-slate-400 dark:text-gray-500',
                      )}
                      strokeWidth={2.5}
                    />
                    <span className="text-[13px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {tier.footnote && (
                <p className="mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.07] text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
                  {tier.footnote}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Interactive Side-by-Side Feature Comparison Matrix ── */}
      <div className="mt-20 pt-10 border-t border-slate-200 dark:border-white/10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              Full Plan Comparison Matrix
            </h3>
            <p className="mt-1 text-[14px] text-slate-500 dark:text-gray-400">
              Detailed breakdown of every feature, quota limit, and entitlement across all plans.
            </p>
          </div>

          <button
            onClick={() => setShowComparison(!showComparison)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-[12.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
          >
            {showComparison ? 'Collapse Matrix' : 'Expand Matrix'}
            <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', showComparison && 'rotate-180')} />
          </button>
        </div>

        {showComparison && (
          <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] shadow-sm">
            <table className="w-full text-left border-collapse min-w-[680px]">
              {/* Header */}
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03]">
                  <th className="py-4 px-5 text-[14px] font-bold text-slate-900 dark:text-white w-[40%]">
                    Feature &amp; Capability
                  </th>
                  <th className="py-4 px-4 text-[13.5px] font-bold text-slate-900 dark:text-white w-[20%] text-center">
                    Free Starter
                  </th>
                  <th className="py-4 px-4 text-[13.5px] font-bold text-[#728c1c] dark:text-[#c8e558] w-[20%] text-center bg-[#c8e558]/10">
                    Sadhya Pro (Launch Offer)
                  </th>
                  <th className="py-4 px-4 text-[13.5px] font-bold text-slate-900 dark:text-white w-[20%] text-center">
                    Institution
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {COMPARISON_CATEGORIES.map((category) => (
                  <React.Fragment key={category.title}>
                    {/* Category Title Row */}
                    <tr className="bg-slate-100/60 dark:bg-white/[0.04]">
                      <td colSpan={4} className="py-3 px-5">
                        <div className="flex items-center gap-2 text-[13px] font-bold tracking-wide uppercase text-slate-700 dark:text-gray-200">
                          <category.icon className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={2} />
                          <span>{category.title}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Category Item Rows */}
                    {category.rows.map((row) => (
                      <tr
                        key={row.feature}
                        className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 px-5">
                          <div className="text-[13.5px] font-medium text-slate-800 dark:text-gray-100">
                            {row.feature}
                          </div>
                          {row.hint && (
                            <div className="text-[11.5px] text-slate-400 dark:text-gray-500 mt-0.5 leading-snug">
                              {row.hint}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ValueCell val={row.free} />
                        </td>
                        <td className="py-3 px-4 text-center bg-[#c8e558]/[0.04]">
                          <ValueCell val={row.pro} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ValueCell val={row.institution} />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer notes & security ── */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12.5px] text-slate-500 dark:text-gray-400 border-t border-slate-100 dark:border-white/[0.06] pt-6">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-emerald-500" />
            256-Bit SSL Encrypted via Razorpay
          </span>
          <span>•</span>
          <span>7-Day No-Questions Refund Window</span>
          <span>•</span>
          <span>Grandfathered Rate Guarantee</span>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/refunds" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white">
            Refunds Policy
          </Link>
          <Link to="/terms" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white">
            Terms of Service
          </Link>
        </div>
      </div>
    </section>
  );
}
