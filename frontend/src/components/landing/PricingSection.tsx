import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  SITE, PRO_MONTHLY_INR, PRO_YEARLY_PER_MONTH_INR, PRO_YEARLY_TOTAL_INR,
} from '../../lib/siteConfig';

/**
 * Subscription plans, shared by the landing page and /pricing.
 *
 * Prices mirror backend-firestore/src/services/payments.service.ts, which recomputes the
 * amount server-side on every order — the client can't influence what's charged.
 *
 * ⚠ A NOTE ON WHAT THE TIERS CLAIM
 * `isPro` is currently surfaced for display only (Settings.tsx); no route or service
 * enforces it. Free and Pro therefore have the same functional access right now. The
 * copy below is deliberately written to be true under that reality — it promises higher
 * limits, priority and support rather than features that are locked. Before advertising
 * anything as Pro-only, add the entitlement check server-side, or the claim is false for
 * paying customers.
 */

type Billing = 'monthly' | 'yearly';

interface Tier {
  id: string;
  name: string;
  tagline: string;
  priceMonthly: number | null; // null → "custom"
  features: string[];
  cta: { label: string; to?: string; href?: string };
  featured?: boolean;
  footnote?: string;
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Everything you need to start preparing with AI.',
    priceMonthly: 0,
    features: [
      'AI tutor with citations and the full reasoning trace',
      'Scan a question from any book or past paper',
      'Notebooks — upload your own PDFs and notes',
      'Practice quizzes and the adaptive baseline assessment',
      'Discussions, study groups and the leaderboard',
      'English, Hindi and Hinglish',
    ],
    cta: { label: 'Start free', to: '/signup' },
    footnote: 'No card required.',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For students preparing seriously, with a date on the calendar.',
    priceMonthly: PRO_MONTHLY_INR,
    features: [
      'Everything in Free, without the fair-use ceiling',
      'Podcast Studio — turn any topic into a two-voice explainer',
      'Generated video lessons',
      'Full-length adaptive mock tests with deep analytics',
      'Priority processing when the queue is busy',
      'Priority support from a human',
    ],
    cta: { label: 'Go Pro', to: '/checkout?plan=pro' },
    featured: true,
    footnote: 'Cancel anytime. Prices in INR, inclusive of applicable taxes.',
  },
  {
    id: 'institution',
    name: 'Institution',
    tagline: 'For schools, colleges and coaching centres.',
    priceMonthly: null,
    features: [
      'Bulk seats for your students',
      'Admin dashboard with cohort-level progress',
      'Custom curriculum and question banks',
      'Teacher accounts with teaching profiles',
      'Invoicing, PO and onboarding support',
      'A named point of contact',
    ],
    cta: { label: 'Talk to us', href: `mailto:${SITE.email.sales}?subject=Sadhya%20for%20institutions` },
    footnote: 'Priced per seat, based on cohort size.',
  },
];

function Price({ tier, billing }: { tier: Tier; billing: Billing }) {
  if (tier.priceMonthly === null) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[38px] leading-none font-semibold tracking-[-0.03em]">Custom</span>
      </div>
    );
  }
  if (tier.priceMonthly === 0) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[38px] leading-none font-semibold tracking-[-0.03em]">₹0</span>
        <span className="text-[14px] text-slate-500 dark:text-gray-400">forever</span>
      </div>
    );
  }
  const perMonth = billing === 'yearly' ? PRO_YEARLY_PER_MONTH_INR : PRO_MONTHLY_INR;
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[38px] leading-none font-semibold tracking-[-0.03em]">₹{perMonth}</span>
        <span className="text-[14px] text-slate-500 dark:text-gray-400">/month</span>
      </div>
      <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 h-4">
        {billing === 'yearly'
          ? `₹${PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')} billed once a year`
          : 'billed monthly'}
      </p>
    </div>
  );
}

/**
 * `headingAs` exists because this section is the whole point of /pricing but only one
 * band of the landing page. On /pricing it has to be the document's <h1>; on the landing
 * page the hero already holds that, so it drops to <h2> and the outline stays valid.
 */
export default function PricingSection({
  id = 'pricing',
  headingAs: Heading = 'h2',
}: {
  id?: string;
  headingAs?: 'h1' | 'h2';
}) {
  const [billing, setBilling] = useState<Billing>('yearly');
  const reduced = useReducedMotion();

  return (
    <section id={id} className="scroll-mt-16 max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
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

      {/* ── Billing toggle ─────────────────────────────────────────────── */}
      <div className="mt-9 inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
        {(['monthly', 'yearly'] as Billing[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBilling(b)}
            aria-pressed={billing === b}
            className={cn(
              'relative h-9 px-4 rounded-lg text-[13.5px] font-medium transition-colors',
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
                −15%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tiers ──────────────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 sm:gap-5 lg:grid-cols-3 items-start">
        {TIERS.map((tier) => {
          const to = tier.cta.to && tier.id === 'pro' ? `${tier.cta.to}&billing=${billing}` : tier.cta.to;
          return (
            <div
              key={tier.id}
              className={cn(
                'relative h-full flex flex-col rounded-2xl border p-6 sm:p-7',
                tier.featured
                  ? 'border-[#c8e558] dark:border-[#c8e558]/60 bg-white dark:bg-[#141416] shadow-[0_18px_50px_-24px_rgba(140,170,40,0.55)] lg:-mt-3 lg:pb-9'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]',
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-6 sm:left-7 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#c8e558] text-slate-900 text-[11.5px] font-semibold">
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                  Most popular
                </span>
              )}

              <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{tier.name}</h3>
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
                    <span className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">{f}</span>
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

      <p className="mt-7 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
        Payments are processed by Razorpay — card details never touch our servers. See our{' '}
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
